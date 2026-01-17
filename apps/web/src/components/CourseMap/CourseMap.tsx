/**
 * CourseMap Component
 *
 * Displays the race course on an interactive Mapbox map with aid station markers.
 */

'use client';

import React, { useEffect, useRef, useState, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import { CourseCoordinate, AidStation } from '@/lib/types';
import styles from './CourseMap.module.css';
import 'mapbox-gl/dist/mapbox-gl.css';

interface CourseMapProps {
  coordinates: CourseCoordinate[];
  aidStations?: AidStation[];
  onAidStationClick?: (station: AidStation, index: number) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Maximum number of coordinate points to render on the map
// More points = smoother line but slower performance
const MAX_COORDINATE_POINTS = 1000;

/**
 * Simplify coordinates array to reduce rendering load
 * Uses uniform sampling to keep the line shape while reducing point count
 */
function simplifyCoordinates(coords: CourseCoordinate[], maxPoints: number): CourseCoordinate[] {
  if (coords.length <= maxPoints) {
    return coords;
  }

  const result: CourseCoordinate[] = [];
  const step = (coords.length - 1) / (maxPoints - 1);

  // Always include first point
  result.push(coords[0]);

  // Sample points at regular intervals
  for (let i = 1; i < maxPoints - 1; i++) {
    const index = Math.round(i * step);
    if (index > 0 && index < coords.length - 1) {
      result.push(coords[index]);
    }
  }

  // Always include last point
  result.push(coords[coords.length - 1]);

  return result;
}

function CourseMapComponent({ coordinates, aidStations, onAidStationClick }: CourseMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);

  // Simplify coordinates for performance if there are too many points
  const displayCoordinates = React.useMemo(
    () => simplifyCoordinates(coordinates, MAX_COORDINATE_POINTS),
    [coordinates]
  );

  useEffect(() => {
    if (!mapContainer.current) return;

    if (!MAPBOX_TOKEN) {
      setMapError('Mapbox token not configured. Set NEXT_PUBLIC_MAPBOX_TOKEN in environment.');
      return;
    }

    if (displayCoordinates.length === 0) {
      setMapError('No course coordinates available');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Calculate bounds for the course
    const bounds = new mapboxgl.LngLatBounds();
    displayCoordinates.forEach(coord => {
      bounds.extend([coord.lon, coord.lat]);
    });

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      bounds: bounds,
      fitBoundsOptions: { padding: 50 },
    });

    map.current.on('load', () => {
      if (!map.current) return;

      // Add the course line
      map.current.addSource('course', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: displayCoordinates.map(c => [c.lon, c.lat]),
          },
        },
      });

      // Add course outline (shadow)
      map.current.addLayer({
        id: 'course-outline',
        type: 'line',
        source: 'course',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': 6,
          'line-opacity': 0.3,
        },
      });

      // Add the main course line
      map.current.addLayer({
        id: 'course-line',
        type: 'line',
        source: 'course',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#4CAF50',
          'line-width': 4,
        },
      });

      // Add start marker
      if (displayCoordinates.length > 0) {
        const startCoord = displayCoordinates[0];
        new mapboxgl.Marker({ color: '#2196F3' })
          .setLngLat([startCoord.lon, startCoord.lat])
          .setPopup(new mapboxgl.Popup().setHTML('<strong>🏁 Start</strong>'))
          .addTo(map.current);
      }

      // Add finish marker
      if (displayCoordinates.length > 1) {
        const finishCoord = displayCoordinates[displayCoordinates.length - 1];
        new mapboxgl.Marker({ color: '#F44336' })
          .setLngLat([finishCoord.lon, finishCoord.lat])
          .setPopup(new mapboxgl.Popup().setHTML('<strong>🎉 Finish</strong>'))
          .addTo(map.current);
      }
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
    map.current.addControl(
      new mapboxgl.FullscreenControl(),
      'top-right'
    );

    return () => {
      // Clean up markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Clean up map
      map.current?.remove();
    };
  }, [displayCoordinates]);

  // Add aid station markers separately so they can update independently
  useEffect(() => {
    if (!map.current || !aidStations) return;

    // Remove existing aid station markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // For each aid station, try to find its position on the course
      aidStations.forEach((station, index) => {
        // Find the closest coordinate based on distance
        let stationCoord: CourseCoordinate | undefined;

        if (station.distanceKm !== null && station.distanceKm !== undefined && coordinates.length > 0) {
          // Get the total distance - use the race's total distance or estimate from coordinates
          // We estimate by treating the coordinate index as a fraction of total distance
          // Find position along the course based on ratio of station distance to total race distance
          // For now, we use a simple approximation: station index ratio along the course

          // Get total race distance from the last aid station (if available) or use max known distance
          const maxDistance = aidStations.reduce((max, s) => {
            return s.distanceKm !== null && s.distanceKm !== undefined && s.distanceKm > max
              ? s.distanceKm
              : max;
          }, 0);

          if (maxDistance > 0) {
            const ratio = station.distanceKm / maxDistance;
            const targetIndex = Math.min(
              Math.floor(ratio * (coordinates.length - 1)),
              coordinates.length - 1
            );
            stationCoord = coordinates[targetIndex];
          } else {
            // Fallback: distribute stations evenly along the course
            const targetIndex = Math.min(
              Math.floor((index / aidStations.length) * (coordinates.length - 1)),
              coordinates.length - 1
            );
            stationCoord = coordinates[targetIndex];
          }
        } else if (coordinates.length > 0) {
          // Station has no distance - distribute evenly along course
          const targetIndex = Math.min(
            Math.floor(((index + 1) / (aidStations.length + 1)) * (coordinates.length - 1)),
            coordinates.length - 1
          );
          stationCoord = coordinates[targetIndex];
        }

      if (stationCoord && map.current) {
        // Create custom marker element
        const el = document.createElement('div');
        el.className = styles.aidStationMarker;
        el.innerHTML = `<span class="${styles.aidStationNumber}">${index + 1}</span>`;
        el.title = station.name;

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="${styles.popupContent}">
            <strong>${station.name}</strong><br/>
            📍 ${station.distanceKm?.toFixed(1) ?? '--'} km<br/>
            ⬆️ ${station.elevationM ? Math.round(station.elevationM) + ' m' : '--'}
            ${station.hasDropBag ? '<br/>🎒 Drop Bag' : ''}
            ${station.hasCrew ? '<br/>👥 Crew Access' : ''}
            ${station.hasPacer ? '<br/>🏃 Pacer Pickup' : ''}
          </div>
        `);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([stationCoord.lon, stationCoord.lat])
          .setPopup(popup)
          .addTo(map.current);

        el.addEventListener('click', () => {
          onAidStationClick?.(station, index);
        });

        markersRef.current.push(marker);
      }
    });
  }, [aidStations, coordinates, onAidStationClick]);

  if (mapError) {
    return (
      <div className={styles.container} data-testid="course-map">
        <div className={styles.error}>
          <span className={styles.errorIcon}>🗺️</span>
          <p>{mapError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} data-testid="course-map">
      <div ref={mapContainer} className={styles.map} />
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#2196F3' }} />
          Start
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#F44336' }} />
          Finish
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#4CAF50' }} />
          Aid Station
        </span>
      </div>
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
// Only re-render if coordinates, aidStations, or callback actually change
export const CourseMap = memo(CourseMapComponent, (prevProps, nextProps) => {
  // Custom comparison for performance
  // Return true if props are equal (should NOT re-render)
  
  // Check if coordinates array reference or length changed
  if (prevProps.coordinates !== nextProps.coordinates) {
    // Do a shallow length check - if length differs, definitely re-render
    if (prevProps.coordinates.length !== nextProps.coordinates.length) {
      return false;
    }
    // If first/last coords differ, re-render (course changed)
    if (prevProps.coordinates.length > 0 && nextProps.coordinates.length > 0) {
      const prevFirst = prevProps.coordinates[0];
      const nextFirst = nextProps.coordinates[0];
      const prevLast = prevProps.coordinates[prevProps.coordinates.length - 1];
      const nextLast = nextProps.coordinates[nextProps.coordinates.length - 1];
      if (prevFirst.lat !== nextFirst.lat || prevFirst.lon !== nextFirst.lon ||
          prevLast.lat !== nextLast.lat || prevLast.lon !== nextLast.lon) {
        return false;
      }
    }
  }
  
  // Check if aidStations array changed
  if (prevProps.aidStations !== nextProps.aidStations) {
    const prevStations = prevProps.aidStations || [];
    const nextStations = nextProps.aidStations || [];
    if (prevStations.length !== nextStations.length) {
      return false;
    }
  }
  
  // Props are considered equal
  return true;
});

export default CourseMap;
