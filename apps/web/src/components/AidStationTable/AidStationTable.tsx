/**
 * AidStationTable Component
 *
 * Displays aid station information in a detailed table format with editing capabilities.
 */

import React, { useState, useCallback } from 'react';
import { AidStation } from '@/lib/types';
import styles from './AidStationTable.module.css';

interface AidStationTableProps {
  aidStations: AidStation[];
  onStationClick?: (station: AidStation, index: number) => void;
  onAidStationsChange?: (aidStations: AidStation[]) => void;
  editable?: boolean;
  /** When true, distance and elevation fields are calculated from GPX course data and cannot be manually edited */
  hasCourseData?: boolean;
}

export function AidStationTable({
  aidStations,
  onStationClick,
  onAidStationsChange,
  editable = false,
  hasCourseData = false,
}: AidStationTableProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingStation, setEditingStation] = useState<AidStation | null>(null);

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

  const ServiceBadge = ({
    available,
    label,
    onClick,
    editable: badgeEditable,
  }: {
    available?: boolean | null;
    label: string;
    onClick?: () => void;
    editable?: boolean;
  }) => (
    <span
      className={`${styles.badge} ${available ? styles.badgeActive : styles.badgeInactive} ${badgeEditable ? styles.badgeClickable : ''}`}
      onClick={(e) => {
        if (badgeEditable && onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      {label}
    </span>
  );

  const handleRowClick = useCallback(
    (station: AidStation, index: number) => {
      if (editable && editingRow === null) {
        setEditingRow(index);
        setEditingStation({ ...station });
      } else if (!editable && onStationClick) {
        onStationClick(station, index);
      }
    },
    [editable, editingRow, onStationClick]
  );

  const handleSaveEdit = useCallback(() => {
    if (editingRow !== null && editingStation && onAidStationsChange) {
      const updated = [...aidStations];
      updated[editingRow] = editingStation;
      onAidStationsChange(updated);
    }
    setEditingRow(null);
    setEditingStation(null);
  }, [editingRow, editingStation, aidStations, onAidStationsChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingRow(null);
    setEditingStation(null);
  }, []);

  const handleDeleteStation = useCallback(
    (index: number) => {
      if (onAidStationsChange) {
        const updated = aidStations.filter((_, i) => i !== index);
        onAidStationsChange(updated);
      }
    },
    [aidStations, onAidStationsChange]
  );

  const handleAddStation = useCallback(() => {
    const lastStation = aidStations[aidStations.length - 1];
    const newStation: AidStation = {
      name: `Aid Station ${aidStations.length + 1}`,
      distanceKm: lastStation?.distanceKm ? lastStation.distanceKm + 10 : 10,
      distanceFromPrevKm: 10,
      elevationM: null,
      hasDropBag: false,
      hasCrew: false,
      hasPacer: false,
      cutoffTime: null,
      cutoffHoursFromStart: null,
    };

    if (onAidStationsChange) {
      onAidStationsChange([...aidStations, newStation]);
    }
  }, [aidStations, onAidStationsChange]);

  const handleEditingChange = useCallback(
    (field: keyof AidStation, value: string | number | boolean | null) => {
      if (!editingStation) return;
      setEditingStation({ ...editingStation, [field]: value });
    },
    [editingStation]
  );

  const parseNumber = (value: string): number | null => {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const renderEditRow = (index: number) => {
    if (!editingStation) return null;

    // Fields that are auto-calculated from GPX course data
    const courseCalculatedFields = hasCourseData;

    return (
      <tr
        key={`editing-${index}`}
        className={`${styles.row} ${styles.editingRow}`}
        data-testid={`aid-station-row-editing-${index}`}
      >
        <td className={styles.tdStation}>
          <span className={styles.stationNumber}>{index + 1}</span>
          <input
            type="text"
            value={editingStation.name}
            onChange={(e) => handleEditingChange('name', e.target.value)}
            className={styles.editInput}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className={styles.tdNumber}>
          {courseCalculatedFields ? (
            <span className={styles.calculatedValue} title="Calculated from GPX course">
              {formatDistance(editingStation.distanceKm)}
              <span className={styles.calculatedIcon}>📍</span>
            </span>
          ) : (
            <input
              type="number"
              value={editingStation.distanceKm ?? ''}
              onChange={(e) =>
                handleEditingChange('distanceKm', parseNumber(e.target.value))
              }
              className={styles.editInputNumber}
              step="0.1"
              onClick={(e) => e.stopPropagation()}
              placeholder="km"
            />
          )}
        </td>
        <td className={styles.tdNumber}>
          {courseCalculatedFields ? (
            <span className={styles.calculatedValue} title="Calculated from GPX course">
              {formatDistance(editingStation.distanceFromPrevKm)}
              <span className={styles.calculatedIcon}>📍</span>
            </span>
          ) : (
            <input
              type="number"
              value={editingStation.distanceFromPrevKm ?? ''}
              onChange={(e) =>
                handleEditingChange('distanceFromPrevKm', parseNumber(e.target.value))
              }
              className={styles.editInputNumber}
              step="0.1"
              onClick={(e) => e.stopPropagation()}
              placeholder="km"
            />
          )}
        </td>
        <td className={styles.tdNumber}>
          {courseCalculatedFields ? (
            <span className={styles.calculatedValue} title="Calculated from GPX course">
              {formatElevation(editingStation.elevationM)}
              <span className={styles.calculatedIcon}>📍</span>
            </span>
          ) : (
            <input
              type="number"
              value={editingStation.elevationM ?? ''}
              onChange={(e) =>
                handleEditingChange('elevationM', parseNumber(e.target.value))
              }
              className={styles.editInputNumber}
              onClick={(e) => e.stopPropagation()}
              placeholder="m"
            />
          )}
        </td>
        <td className={`${styles.tdNumber} ${styles.gain}`}>
          {courseCalculatedFields ? (
            <span className={styles.calculatedValue} title="Calculated from GPX course">
              {editingStation.elevationGainFromPrevM !== undefined
                ? `+${Math.round(editingStation.elevationGainFromPrevM)}`
                : '--'}
              <span className={styles.calculatedIcon}>📍</span>
            </span>
          ) : (
            <input
              type="number"
              value={editingStation.elevationGainFromPrevM ?? ''}
              onChange={(e) =>
                handleEditingChange('elevationGainFromPrevM', parseNumber(e.target.value))
              }
              className={styles.editInputNumber}
              onClick={(e) => e.stopPropagation()}
              placeholder="m"
            />
          )}
        </td>
        <td className={`${styles.tdNumber} ${styles.loss}`}>
          {courseCalculatedFields ? (
            <span className={styles.calculatedValue} title="Calculated from GPX course">
              {editingStation.elevationLossFromPrevM !== undefined
                ? `-${Math.round(editingStation.elevationLossFromPrevM)}`
                : '--'}
              <span className={styles.calculatedIcon}>📍</span>
            </span>
          ) : (
            <input
              type="number"
              value={editingStation.elevationLossFromPrevM ?? ''}
              onChange={(e) =>
                handleEditingChange('elevationLossFromPrevM', parseNumber(e.target.value))
              }
              className={styles.editInputNumber}
              onClick={(e) => e.stopPropagation()}
              placeholder="m"
            />
          )}
        </td>
        <td className={styles.tdServices}>
          <ServiceBadge
            available={editingStation.hasDropBag}
            label="Drop"
            editable
            onClick={() =>
              handleEditingChange('hasDropBag', !editingStation.hasDropBag)
            }
          />
          <ServiceBadge
            available={editingStation.hasCrew}
            label="Crew"
            editable
            onClick={() =>
              handleEditingChange('hasCrew', !editingStation.hasCrew)
            }
          />
          <ServiceBadge
            available={editingStation.hasPacer}
            label="Pacer"
            editable
            onClick={() =>
              handleEditingChange('hasPacer', !editingStation.hasPacer)
            }
          />
        </td>
        <td className={styles.tdNumber}>
          <input
            type="number"
            value={editingStation.cutoffHoursFromStart ?? ''}
            onChange={(e) =>
              handleEditingChange('cutoffHoursFromStart', parseNumber(e.target.value))
            }
            className={styles.editInputNumber}
            step="0.5"
            onClick={(e) => e.stopPropagation()}
            placeholder="hours"
          />
        </td>
        <td className={styles.tdActions}>
          <button
            className={styles.saveButton}
            onClick={(e) => {
              e.stopPropagation();
              handleSaveEdit();
            }}
            title="Save changes"
          >
            ✓
          </button>
          <button
            className={styles.cancelButton}
            onClick={(e) => {
              e.stopPropagation();
              handleCancelEdit();
            }}
            title="Cancel editing"
          >
            ✕
          </button>
        </td>
      </tr>
    );
  };

  const renderReadRow = (station: AidStation, index: number) => (
    <tr
      key={`${station.name}-${index}`}
      className={`${styles.row} ${editable ? styles.editableRow : ''}`}
      onClick={() => handleRowClick(station, index)}
      data-testid={`aid-station-row-${index}`}
    >
      <td className={styles.tdStation}>
        <span className={styles.stationNumber}>{index + 1}</span>
        <span className={styles.stationName}>{station.name}</span>
      </td>
      <td className={styles.tdNumber}>{formatDistance(station.distanceKm)}</td>
      <td className={styles.tdNumber}>
        {formatDistance(station.distanceFromPrevKm)}
      </td>
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
      {editable && (
        <td className={styles.tdActions}>
          <button
            className={styles.deleteButton}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteStation(index);
            }}
            title="Delete aid station"
          >
            🗑
          </button>
        </td>
      )}
    </tr>
  );

  return (
    <div className={styles.container} data-testid="aid-station-table">
      <div className={styles.titleRow}>
        <h3 className={styles.title}>Aid Stations</h3>
        {editable && (
          <button
            className={styles.addButton}
            onClick={handleAddStation}
            title="Add new aid station"
          >
            + Add Station
          </button>
        )}
      </div>

      {editable && (
        <p className={styles.editHint}>
          Click on a row to edit. Click the ✓ to save or ✕ to cancel.
        </p>
      )}

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
              {editable && <th className={styles.thActions}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {aidStations.map((station, index) =>
              editingRow === index
                ? renderEditRow(index)
                : renderReadRow(station, index)
            )}
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
