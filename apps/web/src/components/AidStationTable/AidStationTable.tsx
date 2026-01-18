/**
 * AidStationTable Component
 *
 * Displays aid station information in a detailed table format with editing capabilities.
 */

import React, { useState, useCallback } from 'react';
import { AidStation, WaypointType } from '@/lib/types';
import styles from './AidStationTable.module.css';

// Waypoint type configuration for icons and labels
const WAYPOINT_CONFIG: Record<WaypointType, { icon: string; label: string; color: string }> = {
  aid_station: { icon: '🏕️', label: 'Aid Station', color: '#22c55e' },
  water_stop: { icon: '💧', label: 'Water Stop', color: '#3b82f6' },
  viewpoint: { icon: '👀', label: 'Viewpoint', color: '#a855f7' },
  toilet: { icon: '🚻', label: 'Toilet', color: '#64748b' },
  milestone: { icon: '📍', label: 'Milestone', color: '#f59e0b' },
  custom: { icon: '⭐', label: 'Custom', color: '#ec4899' },
};

const WAYPOINT_OPTIONS: WaypointType[] = [
  'aid_station',
  'water_stop',
  'viewpoint',
  'toilet',
  'milestone',
  'custom',
];

interface AidStationTableProps {
  aidStations: AidStation[];
  onStationClick?: (station: AidStation, index: number) => void;
  onAidStationsChange?: (aidStations: AidStation[]) => void;
  editable?: boolean;
  /** When true, distance and elevation fields are calculated from GPX course data and cannot be manually edited */
  hasCourseData?: boolean;
  /** Race total distance in km - used to show Finish row */
  raceDistanceKm?: number | null;
  /** Elevation at race start in meters */
  startElevationM?: number | null;
  /** Elevation at race finish in meters */
  finishElevationM?: number | null;
  /** Total race elevation gain */
  totalElevationGainM?: number | null;
  /** Total race elevation loss */
  totalElevationLossM?: number | null;
  /** Overall race cutoff time in hours */
  overallCutoffHours?: number | null;
  /** Callback when overall cutoff hours changes */
  onOverallCutoffChange?: (hours: number | null) => void;
}

export function AidStationTable({
  aidStations,
  onStationClick,
  onAidStationsChange,
  editable = false,
  hasCourseData = false,
  raceDistanceKm,
  startElevationM,
  finishElevationM,
  totalElevationGainM,
  totalElevationLossM,
  overallCutoffHours,
  onOverallCutoffChange,
}: AidStationTableProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingStation, setEditingStation] = useState<AidStation | null>(null);
  const [editingFinish, setEditingFinish] = useState(false);
  const [editingFinishCutoff, setEditingFinishCutoff] = useState<number | null>(null);

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

  const WaypointTypeBadge = ({ type }: { type?: WaypointType }) => {
    const waypointType = type || 'aid_station';
    const config = WAYPOINT_CONFIG[waypointType];
    return (
      <span
        className={styles.waypointBadge}
        style={{ backgroundColor: `${config.color}22`, borderColor: config.color }}
        title={config.label}
      >
        <span className={styles.waypointIcon}>{config.icon}</span>
      </span>
    );
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

  /**
   * Recalculate distanceFromPrevKm for all stations based on their distanceKm values.
   * This ensures that when a user edits a station's distance from start,
   * the "from previous" column updates automatically.
   */
  const recalculateDistancesFromPrev = useCallback((stations: AidStation[]): AidStation[] => {
    return stations.map((station, index) => {
      if (index === 0) {
        // First station: distance from prev equals distance from start
        return {
          ...station,
          distanceFromPrevKm: station.distanceKm ?? null,
        };
      } else {
        // Subsequent stations: calculate from previous station
        const prevStation = stations[index - 1];
        const prevDistance = prevStation.distanceKm ?? 0;
        const currentDistance = station.distanceKm ?? 0;
        return {
          ...station,
          distanceFromPrevKm: currentDistance > 0 ? currentDistance - prevDistance : null,
        };
      }
    });
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingRow !== null && editingStation && onAidStationsChange) {
      const updated = [...aidStations];
      updated[editingRow] = editingStation;
      // Recalculate distanceFromPrevKm for all stations after the edit
      const recalculated = recalculateDistancesFromPrev(updated);
      onAidStationsChange(recalculated);
    }
    setEditingRow(null);
    setEditingStation(null);
  }, [editingRow, editingStation, aidStations, onAidStationsChange, recalculateDistancesFromPrev]);

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
            title="Distance from start (editable)"
          />
        </td>
        <td className={styles.tdNumber}>
          <span className={styles.calculatedValue} title="Auto-calculated from distance changes">
            {formatDistance(editingStation.distanceFromPrevKm)}
            <span className={styles.calculatedIcon}>🔄</span>
          </span>
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
        <WaypointTypeBadge type={station.waypointType} />
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

  const renderStartRow = () => (
    <tr
      key="start"
      className={`${styles.row} ${styles.startRow}`}
      data-testid="aid-station-row-start"
    >
      <td className={styles.tdStation}>
        <span className={`${styles.stationNumber} ${styles.startMarker}`}>S</span>
        <span className={styles.stationName}>Start</span>
      </td>
      <td className={styles.tdNumber}>{formatDistance(0)}</td>
      <td className={styles.tdNumber}>--</td>
      <td className={styles.tdNumber}>{formatElevation(startElevationM)}</td>
      <td className={`${styles.tdNumber} ${styles.gain}`}>--</td>
      <td className={`${styles.tdNumber} ${styles.loss}`}>--</td>
      <td className={styles.tdServices}>--</td>
      <td className={styles.tdNumber}>--</td>
      {editable && <td className={styles.tdActions}></td>}
    </tr>
  );

  const handleFinishClick = useCallback(() => {
    if (editable && onOverallCutoffChange && editingRow === null) {
      setEditingFinish(true);
      setEditingFinishCutoff(overallCutoffHours ?? null);
    }
  }, [editable, onOverallCutoffChange, editingRow, overallCutoffHours]);

  const handleSaveFinishEdit = useCallback(() => {
    if (onOverallCutoffChange) {
      onOverallCutoffChange(editingFinishCutoff);
    }
    setEditingFinish(false);
    setEditingFinishCutoff(null);
  }, [editingFinishCutoff, onOverallCutoffChange]);

  const handleCancelFinishEdit = useCallback(() => {
    setEditingFinish(false);
    setEditingFinishCutoff(null);
  }, []);

  const renderFinishRow = () => {
    const lastStation = aidStations[aidStations.length - 1];
    const distanceFromPrev = raceDistanceKm && lastStation?.distanceKm
      ? raceDistanceKm - lastStation.distanceKm
      : raceDistanceKm;

    // Calculate gain/loss from last station to finish
    // For total race: we have totalElevationGainM/LossM
    // Sum of all aid station gains should equal roughly total race gain
    // Finish gain = total - sum of all aid station gains (approximation)
    const sumOfGains = aidStations.reduce((sum, s) => sum + (s.elevationGainFromPrevM ?? 0), 0);
    const sumOfLosses = aidStations.reduce((sum, s) => sum + (s.elevationLossFromPrevM ?? 0), 0);
    const finishGain = totalElevationGainM ? totalElevationGainM - sumOfGains : undefined;
    const finishLoss = totalElevationLossM ? totalElevationLossM - sumOfLosses : undefined;

    if (editingFinish) {
      return (
        <tr
          key="finish-editing"
          className={`${styles.row} ${styles.finishRow} ${styles.editingRow}`}
          data-testid="aid-station-row-finish-editing"
        >
          <td className={styles.tdStation}>
            <span className={`${styles.stationNumber} ${styles.finishMarker}`}>F</span>
            <span className={styles.stationName}>Finish</span>
          </td>
          <td className={styles.tdNumber}>{formatDistance(raceDistanceKm)}</td>
          <td className={styles.tdNumber}>{formatDistance(distanceFromPrev)}</td>
          <td className={styles.tdNumber}>{formatElevation(finishElevationM)}</td>
          <td className={`${styles.tdNumber} ${styles.gain}`}>
            {finishGain !== undefined && finishGain > 0 ? `+${Math.round(finishGain)}` : '--'}
          </td>
          <td className={`${styles.tdNumber} ${styles.loss}`}>
            {finishLoss !== undefined && finishLoss > 0 ? `-${Math.round(finishLoss)}` : '--'}
          </td>
          <td className={styles.tdServices}>--</td>
          <td className={styles.tdNumber}>
            <input
              type="number"
              value={editingFinishCutoff ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setEditingFinishCutoff(val === '' ? null : parseFloat(val));
              }}
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
                handleSaveFinishEdit();
              }}
              title="Save changes"
            >
              ✓
            </button>
            <button
              className={styles.cancelButton}
              onClick={(e) => {
                e.stopPropagation();
                handleCancelFinishEdit();
              }}
              title="Cancel editing"
            >
              ✕
            </button>
          </td>
        </tr>
      );
    }

    return (
      <tr
        key="finish"
        className={`${styles.row} ${styles.finishRow} ${editable && onOverallCutoffChange ? styles.editableRow : ''}`}
        onClick={handleFinishClick}
        data-testid="aid-station-row-finish"
      >
        <td className={styles.tdStation}>
          <span className={`${styles.stationNumber} ${styles.finishMarker}`}>F</span>
          <span className={styles.stationName}>Finish</span>
        </td>
        <td className={styles.tdNumber}>{formatDistance(raceDistanceKm)}</td>
        <td className={styles.tdNumber}>{formatDistance(distanceFromPrev)}</td>
        <td className={styles.tdNumber}>{formatElevation(finishElevationM)}</td>
        <td className={`${styles.tdNumber} ${styles.gain}`}>
          {finishGain !== undefined && finishGain > 0 ? `+${Math.round(finishGain)}` : '--'}
        </td>
        <td className={`${styles.tdNumber} ${styles.loss}`}>
          {finishLoss !== undefined && finishLoss > 0 ? `-${Math.round(finishLoss)}` : '--'}
        </td>
        <td className={styles.tdServices}>--</td>
        <td className={styles.tdNumber}>
          {formatCutoff(null, overallCutoffHours)}
        </td>
        {editable && <td className={styles.tdActions}></td>}
      </tr>
    );
  };

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
            {renderStartRow()}
            {aidStations.map((station, index) =>
              editingRow === index
                ? renderEditRow(index)
                : renderReadRow(station, index)
            )}
            {raceDistanceKm && renderFinishRow()}
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
