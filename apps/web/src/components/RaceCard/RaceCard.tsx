/**
 * RaceCard Component
 *
 * Displays an overview of race information in a card format.
 */

import React, { memo, useState, useCallback } from 'react';
import { RaceData } from '@/lib/types';
import styles from './RaceCard.module.css';

interface RaceCardProps {
  race: RaceData;
  editable?: boolean;
  onDateChange?: (date: string) => void;
  onStartTimeChange?: (startTime: string) => void;
}

function RaceCardComponent({ race, editable = false, onDateChange, onStartTimeChange }: RaceCardProps) {
  const [editingDate, setEditingDate] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [tempDate, setTempDate] = useState(race.date || '');
  const [tempTime, setTempTime] = useState(race.startTime || '06:00');

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

  const handleDateClick = useCallback(() => {
    if (editable && onDateChange) {
      setTempDate(race.date || '');
      setEditingDate(true);
    }
  }, [editable, onDateChange, race.date]);

  const handleTimeClick = useCallback(() => {
    if (editable && onStartTimeChange) {
      setTempTime(race.startTime || '06:00');
      setEditingTime(true);
    }
  }, [editable, onStartTimeChange, race.startTime]);

  const handleDateSave = useCallback(() => {
    if (tempDate && onDateChange) {
      onDateChange(tempDate);
    }
    setEditingDate(false);
  }, [tempDate, onDateChange]);

  const handleTimeSave = useCallback(() => {
    if (tempTime && onStartTimeChange) {
      onStartTimeChange(tempTime);
    }
    setEditingTime(false);
  }, [tempTime, onStartTimeChange]);

  const handleDateCancel = useCallback(() => {
    setEditingDate(false);
    setTempDate(race.date || '');
  }, [race.date]);

  const handleTimeCancel = useCallback(() => {
    setEditingTime(false);
    setTempTime(race.startTime || '06:00');
  }, [race.startTime]);

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
        <span
          className={`${styles.metaItem} ${editable && onDateChange ? styles.metaEditable : ''}`}
          onClick={handleDateClick}
          title={editable && onDateChange ? 'Click to edit date' : undefined}
        >
          {editingDate ? (
            <span className={styles.editGroup}>
              <input
                type="date"
                value={tempDate}
                onChange={(e) => setTempDate(e.target.value)}
                className={styles.editInput}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <button
                className={styles.editSave}
                onClick={(e) => { e.stopPropagation(); handleDateSave(); }}
                title="Save"
              >
                ✓
              </button>
              <button
                className={styles.editCancel}
                onClick={(e) => { e.stopPropagation(); handleDateCancel(); }}
                title="Cancel"
              >
                ✕
              </button>
            </span>
          ) : (
            <>
              📅 {formatDate(race.date)}
              {editable && onDateChange && <span className={styles.editHint}>✏️</span>}
            </>
          )}
        </span>
        <span className={styles.metaItem}>
          📍 {race.location || 'Location TBD'}{race.country ? `, ${race.country}` : ''}
        </span>
        <span
          className={`${styles.metaItem} ${editable && onStartTimeChange ? styles.metaEditable : ''}`}
          onClick={handleTimeClick}
          title={editable && onStartTimeChange ? 'Click to edit start time' : undefined}
        >
          {editingTime ? (
            <span className={styles.editGroup}>
              <input
                type="time"
                value={tempTime}
                onChange={(e) => setTempTime(e.target.value)}
                className={styles.editInput}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              <button
                className={styles.editSave}
                onClick={(e) => { e.stopPropagation(); handleTimeSave(); }}
                title="Save"
              >
                ✓
              </button>
              <button
                className={styles.editCancel}
                onClick={(e) => { e.stopPropagation(); handleTimeCancel(); }}
                title="Cancel"
              >
                ✕
              </button>
            </span>
          ) : (
            <>
              🕐 {formatTime(race.startTime)}
              {editable && onStartTimeChange && <span className={styles.editHint}>✏️</span>}
            </>
          )}
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

// Memoize to prevent re-renders when race data hasn't changed
export const RaceCard = memo(RaceCardComponent, (prevProps, nextProps) => {
  // Return true if props are equal (should NOT re-render)
  const prevRace = prevProps.race;
  const nextRace = nextProps.race;

  // Compare key race properties
  return (
    prevRace.id === nextRace.id &&
    prevRace.name === nextRace.name &&
    prevRace.date === nextRace.date &&
    prevRace.startTime === nextRace.startTime &&
    prevRace.distanceKm === nextRace.distanceKm &&
    prevRace.elevationGainM === nextRace.elevationGainM &&
    prevRace.elevationLossM === nextRace.elevationLossM &&
    prevRace.overallCutoffHours === nextRace.overallCutoffHours &&
    prevRace.aidStations?.length === nextRace.aidStations?.length
  );
});

export default RaceCard;
