/**
 * PerformanceSegmentsTable Component
 *
 * Displays terrain segments breakdown for an activity in a detailed table format.
 * Shows climb/descent/flat sections with pace, elevation, and grade-adjusted pace data.
 */

import React from 'react';
import { TerrainSegmentsData, TerrainSegment } from '@/lib/api';
import styles from './PerformanceSegmentsTable.module.css';

interface PerformanceSegmentsTableProps {
  data: TerrainSegmentsData;
  onClose?: () => void;
}

function formatPace(paceMinKm: number | undefined | null): string {
  if (!paceMinKm || paceMinKm <= 0) return '--';
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDistance(km: number | undefined | null): string {
  if (km === undefined || km === null) return '--';
  return km.toFixed(2);
}

function formatElevationPositive(m: number | undefined | null): string {
  if (m === undefined || m === null) return '--';
  const rounded = Math.round(m);
  return `+${rounded}`;
}

function formatElevationNegative(m: number | undefined | null): string {
  if (m === undefined || m === null) return '--';
  const rounded = Math.round(m);
  return `-${rounded}`;
}

function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function getTerrainEmoji(type: TerrainSegment['terrainType']): string {
  switch (type) {
    case 'climb':
      return '🏔️';
    case 'descent':
      return '⬇️';
    case 'flat':
      return '➡️';
    case 'rolling_hills':
      return '🌊';
    default:
      return '';
  }
}

function getTerrainLabel(type: TerrainSegment['terrainType']): string {
  switch (type) {
    case 'climb':
      return 'Climb';
    case 'descent':
      return 'Descent';
    case 'flat':
      return 'Flat';
    case 'rolling_hills':
      return 'Rolling';
    default:
      return type;
  }
}

export function PerformanceSegmentsTable({
  data,
  onClose,
}: PerformanceSegmentsTableProps) {
  const { segments, summary, totalDistanceKm, totalElevationGainM, totalElevationLossM, totalTimeSeconds } = data;

  return (
    <div className={styles.container} data-testid="performance-segments-table">
      <div className={styles.titleRow}>
        <h3 className={styles.title}>Terrain Segments Breakdown</h3>
        {onClose && (
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>

      <div className={styles.overallStats}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Distance</span>
          <span className={styles.statValue}>{formatDistance(totalDistanceKm)} km</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Elevation Gain</span>
          <span className={styles.statValue}>+{Math.round(totalElevationGainM || 0)} m</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Elevation Loss</span>
          <span className={styles.statValue}>-{Math.round(totalElevationLossM || 0)} m</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Total Time</span>
          <span className={styles.statValue}>{formatDuration(totalTimeSeconds)}</span>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thNumber}>#</th>
              <th className={styles.thType}>Type</th>
              <th className={styles.thGrade}>Grade</th>
              <th className={styles.thNumber}>Distance</th>
              <th className={styles.thNumber}>Ascent</th>
              <th className={styles.thNumber}>Descent</th>
              <th className={styles.thNumber}>Pace</th>
              <th className={styles.thNumber}>GAP</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr
                key={segment.segmentIndex}
                className={`${styles.row} ${styles[`row${segment.terrainType.charAt(0).toUpperCase() + segment.terrainType.slice(1)}`]}`}
                data-testid={`segment-row-${segment.segmentIndex}`}
              >
                <td className={styles.tdNumber}>{segment.segmentIndex + 1}</td>
                <td className={styles.tdType}>
                  <span className={styles.terrainEmoji}>{getTerrainEmoji(segment.terrainType)}</span>
                  <span className={styles.terrainLabel}>{getTerrainLabel(segment.terrainType)}</span>
                </td>
                <td className={styles.tdGrade}>
                  <span className={`${styles.gradeBadge} ${styles[`grade${segment.gradeCategory.charAt(0).toUpperCase() + segment.gradeCategory.slice(1)}`]}`}>
                    {segment.gradeCategory}
                  </span>
                </td>
                <td className={styles.tdNumber}>{formatDistance(segment.distanceKm)} km</td>
                <td className={`${styles.tdNumber} ${styles.gain}`}>
                  {formatElevationPositive(segment.totalAscentM)} m
                </td>
                <td className={`${styles.tdNumber} ${styles.loss}`}>
                  {formatElevationNegative(segment.totalDescentM)} m
                </td>
                <td className={styles.tdNumber}>{formatPace(segment.paceMinKm)} /km</td>
                <td className={styles.tdNumber}>{formatPace(segment.gradeAdjustedPaceMinKm)} /km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.summarySection}>
        <h4 className={styles.summaryTitle}>Summary by Terrain Type</h4>
        <div className={styles.summaryGrid}>
          <div className={`${styles.summaryCard} ${styles.summaryClimb}`}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryEmoji}>🏔️</span>
              <span className={styles.summaryType}>Climbing</span>
            </div>
            <div className={styles.summaryStats}>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Segments</span>
                <span className={styles.summaryStatValue}>{summary.climb.segmentCount}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Distance</span>
                <span className={styles.summaryStatValue}>{formatDistance(summary.climb.totalDistanceKm)} km</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Elevation</span>
                <span className={styles.summaryStatValue}>+{Math.round(summary.climb.totalElevationM || 0)} m</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Time</span>
                <span className={styles.summaryStatValue}>{formatDuration(summary.climb.totalTimeSeconds)}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Avg Pace</span>
                <span className={styles.summaryStatValue}>{formatPace(summary.climb.averagePaceMinKm)} /km</span>
              </div>
            </div>
          </div>

          <div className={`${styles.summaryCard} ${styles.summaryDescent}`}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryEmoji}>⬇️</span>
              <span className={styles.summaryType}>Descending</span>
            </div>
            <div className={styles.summaryStats}>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Segments</span>
                <span className={styles.summaryStatValue}>{summary.descent.segmentCount}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Distance</span>
                <span className={styles.summaryStatValue}>{formatDistance(summary.descent.totalDistanceKm)} km</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Elevation</span>
                <span className={styles.summaryStatValue}>-{Math.round(summary.descent.totalElevationM || 0)} m</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Time</span>
                <span className={styles.summaryStatValue}>{formatDuration(summary.descent.totalTimeSeconds)}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Avg Pace</span>
                <span className={styles.summaryStatValue}>{formatPace(summary.descent.averagePaceMinKm)} /km</span>
              </div>
            </div>
          </div>

          <div className={`${styles.summaryCard} ${styles.summaryFlat}`}>
            <div className={styles.summaryHeader}>
              <span className={styles.summaryEmoji}>➡️</span>
              <span className={styles.summaryType}>Flat</span>
            </div>
            <div className={styles.summaryStats}>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Segments</span>
                <span className={styles.summaryStatValue}>{summary.flat.segmentCount}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Distance</span>
                <span className={styles.summaryStatValue}>{formatDistance(summary.flat.totalDistanceKm)} km</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Elevation</span>
                <span className={styles.summaryStatValue}>~0 m</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Time</span>
                <span className={styles.summaryStatValue}>{formatDuration(summary.flat.totalTimeSeconds)}</span>
              </div>
              <div className={styles.summaryStat}>
                <span className={styles.summaryStatLabel}>Avg Pace</span>
                <span className={styles.summaryStatValue}>{formatPace(summary.flat.averagePaceMinKm)} /km</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendTitle}>Legend:</span>
        <span className={styles.legendItem}>
          <span className={`${styles.gradeBadge} ${styles.gradeEasy}`}>easy</span>
          0-5%
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.gradeBadge} ${styles.gradeModerate}`}>moderate</span>
          5-10%
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.gradeBadge} ${styles.gradeSteep}`}>steep</span>
          10-15%
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.gradeBadge} ${styles.gradeExtreme}`}>extreme</span>
          &gt;15%
        </span>
      </div>
    </div>
  );
}

export default PerformanceSegmentsTable;
