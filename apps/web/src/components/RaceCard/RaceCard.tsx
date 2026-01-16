/**
 * RaceCard Component
 *
 * Displays an overview of race information in a card format.
 */

import React from 'react';
import { RaceData } from '@/lib/types';
import styles from './RaceCard.module.css';

interface RaceCardProps {
  race: RaceData;
}

export function RaceCard({ race }: RaceCardProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Date TBD';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (time?: string) => {
    if (!time) return 'Start time TBD';
    return `${time} start`;
  };

  const formatDistance = (km?: number) => {
    if (!km) return '--';
    const miles = km * 0.621371;
    return `${km.toFixed(1)} km (${miles.toFixed(1)} mi)`;
  };

  const formatElevation = (meters?: number) => {
    if (!meters) return '--';
    const feet = meters * 3.28084;
    return `${meters.toLocaleString()} m (${feet.toLocaleString(undefined, { maximumFractionDigits: 0 })} ft)`;
  };

  const formatCutoff = (hours?: number) => {
    if (!hours) return '--';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h} hours`;
    return `${h}h ${m}m`;
  };

  return (
    <div className={styles.card} data-testid="race-card">
      <div className={styles.header}>
        <h2 className={styles.title}>{race.name}</h2>
        {race.websiteUrl && (
          <a
            href={race.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Official Website ↗
          </a>
        )}
      </div>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          📅 {formatDate(race.date)}
        </span>
        <span className={styles.metaItem}>
          📍 {race.location || 'Location TBD'}{race.country ? `, ${race.country}` : ''}
        </span>
        <span className={styles.metaItem}>
          🕐 {formatTime(race.startTime)}
        </span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Distance</span>
          <span className={styles.statValue}>{formatDistance(race.distanceKm)}</span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Elevation Gain</span>
          <span className={styles.statValue}>{formatElevation(race.elevationGainM)}</span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Elevation Loss</span>
          <span className={styles.statValue}>{formatElevation(race.elevationLossM)}</span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Cutoff Time</span>
          <span className={styles.statValue}>{formatCutoff(race.overallCutoffHours)}</span>
        </div>
      </div>

      {race.description && (
        <p className={styles.description}>{race.description}</p>
      )}

      {race.aidStations && race.aidStations.length > 0 && (
        <div className={styles.aidStationSummary}>
          <span className={styles.aidStationCount}>
            🏕️ {race.aidStations.length} Aid Stations
          </span>
        </div>
      )}
    </div>
  );
}

export default RaceCard;
