/**
 * CourseMap Component
 *
 * Displays the race course on an interactive Mapbox map with aid station markers.
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
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

export function CourseMap({ coordinates, aidStations, onAidStationClick }: CourseMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    if (!MAPBOX_TOKEN) {
      setMapError('Mapbox token not configured. Set NEXT_PUBLIC_MAPBOX_TOKEN in environment.');
      return;
    }

    if (coordinates.length === 0) {
      setMapError('No course coordinates available');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Calculate bounds for the course
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => {
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
            coordinates: coordinates.map(c => [c.lon, c.lat]),
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
      if (coordinates.length > 0) {
        const startCoord = coordinates[0];
        new mapboxgl.Marker({ color: '#2196F3' })
          .setLngLat([startCoord.lon, startCoord.lat])
          .setPopup(new mapboxgl.Popup().setHTML('<strong>🏁 Start</strong>'))
          .addTo(map.current);
      }

      // Add finish marker
      if (coordinates.length > 1) {
        const finishCoord = coordinates[coordinates.length - 1];
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
  }, [coordinates]);

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

      if (station.distanceKm !== undefined && coordinates.length > 0) {
        // Find the coordinate closest to this distance along the course
        // This is a simplified approach - in production you'd want to
        // interpolate along the actual course line
        const totalDistance = coordinates[coordinates.length - 1]?.distanceKm || 0;
        if (totalDistance > 0) {
          const ratio = station.distanceKm / totalDistance;
          const targetIndex = Math.min(
            Math.floor(ratio * (coordinates.length - 1)),
            coordinates.length - 1
          );
          stationCoord = coordinates[targetIndex];
        }
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

export default CourseMap;
