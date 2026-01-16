/**
 * AidStationTable Component
 *
 * Displays aid station information in a detailed table format.
 */

import React from 'react';
import { AidStation } from '@/lib/types';
import styles from './AidStationTable.module.css';

interface AidStationTableProps {
  aidStations: AidStation[];
  onStationClick?: (station: AidStation, index: number) => void;
}

export function AidStationTable({ aidStations, onStationClick }: AidStationTableProps) {
  const formatDistance = (km?: number | null) => {
    if (km === undefined || km === null) return '--';
    return `${km.toFixed(1)} km`;
  };

  const formatElevation = (m?: number | null) => {
    if (m === undefined || m === null) return '--';
    return `${Math.round(m)} m`;
  };

  const formatCutoff = (time?: string | null, hours?: number | null) => {
    if (time) return time;
    if (hours !== undefined && hours !== null) {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      if (m === 0) return `${h}:00`;
      return `${h}:${m.toString().padStart(2, '0')}`;
    }
    return '--';
  };

  const ServiceBadge = ({ available, label }: { available?: boolean | null; label: string }) => (
    <span className={`${styles.badge} ${available ? styles.badgeActive : styles.badgeInactive}`}>
      {label}
    </span>
  );

  return (
    <div className={styles.container} data-testid="aid-station-table">
      <h3 className={styles.title}>Aid Stations</h3>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thStation}>Station</th>
              <th className={styles.thNumber}>Distance</th>
              <th className={styles.thNumber}>From Prev</th>
              <th className={styles.thNumber}>Elevation</th>
              <th className={styles.thNumber}>Gain ↑</th>
              <th className={styles.thNumber}>Loss ↓</th>
              <th className={styles.thServices}>Services</th>
              <th className={styles.thNumber}>Cutoff</th>
            </tr>
          </thead>
          <tbody>
            {aidStations.map((station, index) => (
              <tr
                key={`${station.name}-${index}`}
                className={styles.row}
                onClick={() => onStationClick?.(station, index)}
                data-testid={`aid-station-row-${index}`}
              >
                <td className={styles.tdStation}>
                  <span className={styles.stationNumber}>{index + 1}</span>
                  <span className={styles.stationName}>{station.name}</span>
                </td>
                <td className={styles.tdNumber}>{formatDistance(station.distanceKm)}</td>
                <td className={styles.tdNumber}>{formatDistance(station.distanceFromPrevKm)}</td>
                <td className={styles.tdNumber}>{formatElevation(station.elevationM)}</td>
                <td className={`${styles.tdNumber} ${styles.gain}`}>
                  {station.elevationGainFromPrevM !== undefined
                    ? `+${Math.round(station.elevationGainFromPrevM)}`
                    : '--'}
                </td>
                <td className={`${styles.tdNumber} ${styles.loss}`}>
                  {station.elevationLossFromPrevM !== undefined
                    ? `-${Math.round(station.elevationLossFromPrevM)}`
                    : '--'}
                </td>
                <td className={styles.tdServices}>
                  <ServiceBadge available={station.hasDropBag} label="Drop" />
                  <ServiceBadge available={station.hasCrew} label="Crew" />
                  <ServiceBadge available={station.hasPacer} label="Pacer" />
                </td>
                <td className={styles.tdNumber}>
                  {formatCutoff(station.cutoffTime, station.cutoffHoursFromStart)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>
          Service available
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.badge} ${styles.badgeInactive}`}>Inactive</span>
          Not available
        </span>
      </div>
    </div>
  );
}

export default AidStationTable;
