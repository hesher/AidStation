/**
 * CourseMap Component
 *
 * Displays the race course on an interactive Mapbox map with aid station markers.
 */

'use client';

import React, { useEffect, useRef, useState, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import { CourseCoordinate, AidStation, WaypointType } from '@/lib/types';
import styles from './CourseMap.module.css';
import 'mapbox-gl/dist/mapbox-gl.css';

interface CourseMapProps {
  coordinates: CourseCoordinate[];
  aidStations?: AidStation[];
  onAidStationClick?: (station: AidStation, index: number) => void;
  enable3D?: boolean;
  terrainExaggeration?: number;
  totalRaceDistanceKm?: number;
  /** Index of the focused aid station (will pan and highlight) */
  focusedStationIndex?: number | null;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Maximum number of coordinate points to render on the map
// More points = smoother line but slower performance
const MAX_COORDINATE_POINTS = 1000;

const DEFAULT_TERRAIN_EXAGGERATION = 1.5;

/**
 * Format cutoff hours into a readable string
 * For cutoffs >= 24 hours, shows "Day X + HH:MM" format
 */
function formatCutoffTime(hours: number | undefined | null): string {
  if (hours === undefined || hours === null) return '';
  const dayOffset = Math.floor(hours / 24);
  const hoursInDay = hours - dayOffset * 24;
  const h = Math.floor(hoursInDay);
  const m = Math.round((hoursInDay - h) * 60);
  const timeStr = `${h}h ${m > 0 ? `${m}m` : ''}`.trim();

  if (hours >= 24) {
    return `Day ${dayOffset + 1}, ${timeStr}`;
  }
  return timeStr;
}

// Waypoint type configuration for markers
const WAYPOINT_MARKER_CONFIG: Record<WaypointType, { color: string; icon: string; label: string }> = {
  aid_station: { color: '#22c55e', icon: '🏕️', label: 'Aid Station' },
  water_stop: { color: '#3b82f6', icon: '💧', label: 'Water Stop' },
  viewpoint: { color: '#a855f7', icon: '👀', label: 'Viewpoint' },
  toilet: { color: '#64748b', icon: '🚻', label: 'Toilet' },
  milestone: { color: '#f59e0b', icon: '📍', label: 'Milestone' },
  custom: { color: '#ec4899', icon: '⭐', label: 'Custom' },
};

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

/**
 * Find the coordinate for an aid station based on its distance along the course
 */
function findStationCoordinate(
  station: AidStation,
  stationIndex: number,
  aidStationsLength: number,
  coordinates: CourseCoordinate[],
  totalRaceDistanceKm?: number
): CourseCoordinate | undefined {
  if (coordinates.length === 0) return undefined;

  if (station.distanceKm !== null && station.distanceKm !== undefined) {
    // Get the total distance - use the passed total race distance
    let totalDistance = totalRaceDistanceKm;

    // Fallback: estimate total distance using Haversine formula
    if (!totalDistance || totalDistance <= 0) {
      let approxDistance = 0;
      for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];
        const dLat = (curr.lat - prev.lat) * Math.PI / 180;
        const dLon = (curr.lon - prev.lon) * Math.PI / 180;
        const lat1 = prev.lat * Math.PI / 180;
        const lat2 = curr.lat * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        approxDistance += 6371 * c;
      }
      totalDistance = approxDistance;
    }

    if (totalDistance > 0) {
      const ratio = station.distanceKm / totalDistance;
      const targetIndex = Math.min(
        Math.floor(ratio * (coordinates.length - 1)),
        coordinates.length - 1
      );
      return coordinates[targetIndex];
    }
    
    // Fallback: distribute stations evenly
    const targetIndex = Math.min(
      Math.floor((stationIndex / aidStationsLength) * (coordinates.length - 1)),
      coordinates.length - 1
    );
    return coordinates[targetIndex];
  }
  
  // Station has no distance - distribute evenly along course
  const targetIndex = Math.min(
    Math.floor(((stationIndex + 1) / (aidStationsLength + 1)) * (coordinates.length - 1)),
    coordinates.length - 1
  );
  return coordinates[targetIndex];
}

function CourseMapComponent({
  coordinates,
  aidStations,
  onAidStationClick,
  enable3D = true,
  terrainExaggeration = DEFAULT_TERRAIN_EXAGGERATION,
  totalRaceDistanceKm,
  focusedStationIndex
}: CourseMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [is3DEnabled, setIs3DEnabled] = useState(enable3D);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Simplify coordinates for performance if there are too many points
  const displayCoordinates = React.useMemo(
    () => simplifyCoordinates(coordinates, MAX_COORDINATE_POINTS),
    [coordinates]
  );

  // Initialize the map
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
      pitch: is3DEnabled ? 45 : 0,
      bearing: 0,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      setMapLoaded(true);

      // Add 3D terrain if enabled
      if (is3DEnabled) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });

        map.current.setTerrain({
          source: 'mapbox-dem',
          exaggeration: terrainExaggeration,
        });

        map.current.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15,
          },
        });
      }

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
    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    return () => {
      // Clean up markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Reset map loaded state
      setMapLoaded(false);

      // Clean up map
      map.current?.remove();
    };
  }, [displayCoordinates, is3DEnabled, terrainExaggeration]);

  // Add aid station markers separately so they can update independently
  useEffect(() => {
    if (!map.current || !aidStations) return;

    // Remove existing aid station markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // For each aid station, try to find its position on the course
    aidStations.forEach((station, index) => {
      const stationCoord = findStationCoordinate(
        station,
        index,
        aidStations.length,
        coordinates,
        totalRaceDistanceKm
      );

      if (stationCoord && map.current) {
        // Get marker config based on waypoint type
        const waypointType = station.waypointType || 'aid_station';
        const markerConfig = WAYPOINT_MARKER_CONFIG[waypointType] || WAYPOINT_MARKER_CONFIG.aid_station;

        // Create custom marker element with waypoint-specific styling
        const el = document.createElement('div');
        el.className = styles.aidStationMarker;
        el.style.backgroundColor = markerConfig.color;
        el.innerHTML = `<span class="${styles.aidStationNumber}">${index + 1}</span>`;
        el.title = `${station.name} (${markerConfig.label})`;

        // Format cutoff time for display
        const cutoffDisplay = formatCutoffTime(station.cutoffHoursFromStart);
        const hasCutoff = cutoffDisplay !== '';

        // Build services list
        const services: string[] = [];
        if (station.hasDropBag) services.push('Drop Bag');
        if (station.hasCrew) services.push('Crew');
        if (station.hasPacer) services.push('Pacer');
        const servicesDisplay = services.length > 0 ? services.join(' • ') : '';

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="${styles.popupContent}">
            <div class="${styles.popupHeader}">
              <span class="${styles.popupIcon}">${markerConfig.icon}</span>
              <span class="${styles.popupName}">${station.name}</span>
            </div>
            ${hasCutoff ? `<div class="${styles.popupCutoff}">
              <span class="${styles.popupCutoffLabel}">Cutoff</span>
              <span class="${styles.popupCutoffValue}">${cutoffDisplay}</span>
            </div>` : ''}
            <div class="${styles.popupStats}">
              <span>${station.distanceKm?.toFixed(1) ?? '--'} km</span>
              <span>${station.elevationM ? Math.round(station.elevationM) + ' m' : '--'}</span>
            </div>
            ${servicesDisplay ? `<div class="${styles.popupServices}">${servicesDisplay}</div>` : ''}
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
  }, [aidStations, coordinates, onAidStationClick, totalRaceDistanceKm]);

  // Effect to focus on a specific aid station when focusedStationIndex changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (focusedStationIndex === null || focusedStationIndex === undefined) return;
    if (!aidStations || focusedStationIndex >= aidStations.length) return;

    const station = aidStations[focusedStationIndex];
    if (!station) return;

    // Find the station's coordinate
    const stationCoord = findStationCoordinate(
      station,
      focusedStationIndex,
      aidStations.length,
      coordinates,
      totalRaceDistanceKm
    );

    if (stationCoord && map.current) {
      // Pan and zoom to the focused station
      map.current.flyTo({
        center: [stationCoord.lon, stationCoord.lat],
        zoom: 12,
        duration: 800,
        essential: true
      });

      // Open the popup for this marker if it exists
      const marker = markersRef.current[focusedStationIndex];
      if (marker) {
        marker.togglePopup();
      }
    }
  }, [focusedStationIndex, aidStations, coordinates, totalRaceDistanceKm, mapLoaded]);

  // Toggle 3D mode
  const toggle3D = () => {
    if (!map.current) return;

    const new3DState = !is3DEnabled;
    setIs3DEnabled(new3DState);

    if (new3DState) {
      // Enable 3D terrain
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.current.setTerrain({
        source: 'mapbox-dem',
        exaggeration: terrainExaggeration,
      });
      if (!map.current.getLayer('sky')) {
        map.current.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15,
          },
        });
      }
      map.current.easeTo({ pitch: 45, duration: 1000 });
    } else {
      // Disable 3D terrain
      map.current.setTerrain(null);
      if (map.current.getLayer('sky')) {
        map.current.removeLayer('sky');
      }
      map.current.easeTo({ pitch: 0, duration: 1000 });
    }
  };

  // Calculate unique waypoint types present in aid stations for legend
  const uniqueWaypointTypes = React.useMemo(() => {
    if (!aidStations) return [];
    const types = new Set<WaypointType>();
    aidStations.forEach(station => {
      types.add(station.waypointType || 'aid_station');
    });
    return Array.from(types);
  }, [aidStations]);

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
      <button
        className={`${styles.terrainToggle} ${is3DEnabled ? styles.active : ''}`}
        onClick={toggle3D}
        title={is3DEnabled ? 'Disable 3D terrain' : 'Enable 3D terrain'}
        aria-label={is3DEnabled ? 'Disable 3D terrain view' : 'Enable 3D terrain view'}
      >
        <span className={styles.terrainToggleIcon}>🏔️</span>
        <span>{is3DEnabled ? '3D On' : '3D Off'}</span>
      </button>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#2196F3' }} />
          Start
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#F44336' }} />
          Finish
        </span>
        {uniqueWaypointTypes.map(type => {
          const config = WAYPOINT_MARKER_CONFIG[type];
          return (
            <span key={type} className={styles.legendItem}>
              <span className={styles.legendMarker} style={{ backgroundColor: config.color }} />
              {config.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
// Only re-render if coordinates, aidStations, or callback actually change
export const CourseMap = memo(CourseMapComponent, (prevProps, nextProps) => {
  // Custom comparison for performance
  // Return true if props are equal (should NOT re-render)

  // Always re-render if focusedStationIndex changed
  if (prevProps.focusedStationIndex !== nextProps.focusedStationIndex) {
    return false;
  }

  // Check if totalRaceDistanceKm changed
  if (prevProps.totalRaceDistanceKm !== nextProps.totalRaceDistanceKm) {
    return false;
  }

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
    // Check if any station's key properties changed
    for (let i = 0; i < prevStations.length; i++) {
      if (prevStations[i].distanceKm !== nextStations[i].distanceKm ||
        prevStations[i].name !== nextStations[i].name ||
        prevStations[i].waypointType !== nextStations[i].waypointType ||
        prevStations[i].cutoffHoursFromStart !== nextStations[i].cutoffHoursFromStart ||
        prevStations[i].hasDropBag !== nextStations[i].hasDropBag ||
        prevStations[i].hasCrew !== nextStations[i].hasCrew ||
        prevStations[i].hasPacer !== nextStations[i].hasPacer) {
        return false;
      }
    }
  }

  // Props are considered equal
  return true;
});

export default CourseMap;
