/**
 * Elevation Profile Component
 *
 * Displays an elevation profile chart with optional pace overlay.
 */

'use client';

import { useMemo } from 'react';
import styles from './ElevationProfile.module.css';

interface DataPoint {
  distance: number;
  elevation: number;
  pace?: number;
}

interface ElevationProfileProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  showPace?: boolean;
  className?: string;
}

export function ElevationProfile({
  data,
  width = 600,
  height = 200,
  showPace = false,
  className = '',
}: ElevationProfileProps) {
  const { elevationPath, pacePath, stats, viewBox } = useMemo(() => {
    if (!data || data.length === 0) {
      return { elevationPath: '', pacePath: '', stats: null, viewBox: '' };
    }

    // Calculate bounds
    const distances = data.map((d) => d.distance);
    const elevations = data.map((d) => d.elevation);
    const paces = data.filter((d) => d.pace !== undefined).map((d) => d.pace!);

    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const minPace = paces.length > 0 ? Math.min(...paces) : 0;
    const maxPace = paces.length > 0 ? Math.max(...paces) : 10;

    // Padding
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Scale functions
    const scaleX = (d: number) =>
      padding.left + ((d - minDist) / (maxDist - minDist || 1)) * chartWidth;
    const scaleY = (e: number) =>
      padding.top + chartHeight - ((e - minElev) / (maxElev - minElev || 1)) * chartHeight;
    const scalePaceY = (p: number) =>
      padding.top + chartHeight - ((maxPace - p) / (maxPace - minPace || 1)) * chartHeight;

    // Create elevation path
    const elevPoints = data.map((d, i) => {
      const x = scaleX(d.distance);
      const y = scaleY(d.elevation);
      return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
    });

    // Create filled area path
    const areaPath = [
      ...elevPoints,
      `L ${scaleX(maxDist)},${height - padding.bottom}`,
      `L ${scaleX(minDist)},${height - padding.bottom}`,
      'Z',
    ].join(' ');

    // Create pace path if enabled
    let pacePathStr = '';
    if (showPace && paces.length > 0) {
      const pacePoints = data
        .filter((d) => d.pace !== undefined)
        .map((d, i) => {
          const x = scaleX(d.distance);
          const y = scalePaceY(d.pace!);
          return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
        });
      pacePathStr = pacePoints.join(' ');
    }

    // Calculate stats
    const totalDistance = maxDist - minDist;
    const elevationGain = data.reduce((sum, d, i) => {
      if (i === 0) return 0;
      const diff = d.elevation - data[i - 1].elevation;
      return sum + (diff > 0 ? diff : 0);
    }, 0);
    const elevationLoss = data.reduce((sum, d, i) => {
      if (i === 0) return 0;
      const diff = data[i - 1].elevation - d.elevation;
      return sum + (diff > 0 ? diff : 0);
    }, 0);

    return {
      elevationPath: areaPath,
      pacePath: pacePathStr,
      stats: {
        totalDistance,
        elevationGain,
        elevationLoss,
        minElev,
        maxElev,
        minPace,
        maxPace,
      },
      viewBox: `0 0 ${width} ${height}`,
    };
  }, [data, width, height, showPace]);

  if (!data || data.length === 0) {
    return (
      <div className={`${styles.container} ${className}`}>
        <div className={styles.empty}>No elevation data available</div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className}`}>
      <svg viewBox={viewBox} className={styles.chart}>
        {/* Grid lines */}
        <g className={styles.grid}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={50}
              y1={20 + (height - 60) * ratio}
              x2={width - 20}
              y2={20 + (height - 60) * ratio}
              className={styles.gridLine}
            />
          ))}
        </g>

        {/* Elevation area */}
        <path d={elevationPath} className={styles.elevationArea} />

        {/* Pace line if enabled */}
        {showPace && pacePath && (
          <path d={pacePath} className={styles.paceLine} />
        )}

        {/* Y-axis labels */}
        <g className={styles.axisLabels}>
          <text x={45} y={25} textAnchor="end" className={styles.axisLabel}>
            {stats?.maxElev?.toFixed(0)}m
          </text>
          <text x={45} y={height - 35} textAnchor="end" className={styles.axisLabel}>
            {stats?.minElev?.toFixed(0)}m
          </text>
        </g>

        {/* X-axis labels */}
        <g className={styles.axisLabels}>
          <text x={50} y={height - 10} className={styles.axisLabel}>
            0 km
          </text>
          <text x={width - 20} y={height - 10} textAnchor="end" className={styles.axisLabel}>
            {stats?.totalDistance?.toFixed(1)} km
          </text>
        </g>
      </svg>

      {/* Stats */}
      {stats && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>↑ Gain</span>
            <span className={styles.statValue}>{stats.elevationGain.toFixed(0)}m</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>↓ Loss</span>
            <span className={styles.statValue}>{stats.elevationLoss.toFixed(0)}m</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Max</span>
            <span className={styles.statValue}>{stats.maxElev.toFixed(0)}m</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Min</span>
            <span className={styles.statValue}>{stats.minElev.toFixed(0)}m</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.elevationSwatch} />
          <span>Elevation</span>
        </div>
        {showPace && (
          <div className={styles.legendItem}>
            <span className={styles.paceSwatch} />
            <span>Pace</span>
          </div>
        )}
      </div>
    </div>
  );
}
