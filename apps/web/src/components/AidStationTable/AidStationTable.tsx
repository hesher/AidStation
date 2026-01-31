/**
 * AidStationTable Component
 *
 * Displays aid station information in a detailed table format with editing capabilities.
 */

import React, { useCallback, useMemo } from 'react';
import { AidStation, WaypointType } from '@/lib/types';
import { SmartDurationInput, SmartDurationInputValue } from '@/components/SmartDurationInput';
import { addMinutes, isValid } from 'date-fns';
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

interface AidStationTableProps {
  aidStations: AidStation[];
  onStationClick?: (station: AidStation, index: number) => void;
  onAidStationsChange?: (aidStations: AidStation[]) => void;
  /** Callback when user starts editing a station - used to focus map on that station */
  onStationFocus?: (station: AidStation, index: number) => void;
  editable?: boolean;
  /** When true, distance and elevation fields are calculated from GPX course data and cannot be manually edited */
  hasCourseData?: boolean;
  /** Race total distance in km - used to show Finish row */
  raceDistanceKm?: number | null;
  /** Elevation at race start in meters */
  startElevationM?: number | null;
  /** Callback when start elevation changes */
  onStartElevationChange?: (elevation: number | null) => void;
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
  /** Race start time - used for SmartDurationInput calculations */
  raceStartTime?: Date | null;
  /** Cutoff hours for first aid station (from start) */
  startCutoffHours?: number | null;
  /** Callback when start cutoff hours changes */
  onStartCutoffChange?: (hours: number | null) => void;
}

export function AidStationTable({
  aidStations,
  onStationClick,
  onAidStationsChange,
  onStationFocus,
  editable = false,
  hasCourseData = false,
  raceDistanceKm,
  startElevationM,
  onStartElevationChange,
  finishElevationM,
  totalElevationGainM,
  totalElevationLossM,
  overallCutoffHours,
  onOverallCutoffChange,
  raceStartTime,
  startCutoffHours,
  onStartCutoffChange,
}: AidStationTableProps) {

  // Use the provided race start time, or null if not provided/invalid
  // The SmartDurationInput will handle the null case appropriately
  const effectiveRaceStartTime = useMemo(() => {
    if (raceStartTime && isValid(raceStartTime)) return raceStartTime;
    return null;
  }, [raceStartTime]);

  const formatDistance = (km?: number | null) => {
    if (km === undefined || km === null) return '--';
    return `${km.toFixed(1)} km`;
  };

  const formatElevation = (m?: number | null) => {
    if (m === undefined || m === null) return '--';
    return `${Math.round(m)} m`;
  };

  const formatCutoff = (
    time?: string | null,
    hours?: number | null,
    dayOffset?: number | null
  ) => {
    if (time) return time;
    if (hours !== undefined && hours !== null) {
      const effectiveDayOffset = dayOffset ?? Math.floor(hours / 24);
      const hoursInDay = hours - effectiveDayOffset * 24;
      const h = Math.floor(hoursInDay);
      const m = Math.round((hoursInDay - h) * 60);
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      if (hours >= 24) {
        return `Day ${effectiveDayOffset + 1}, ${timeStr}`;
      }
      return timeStr;
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
      if (!editable && onStationClick) {
        onStationClick(station, index);
      }
    },
    [editable, onStationClick]
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

  const handleStationChange = useCallback(
    (index: number, field: keyof AidStation, value: string | number | boolean | null) => {
      if (!onAidStationsChange) return;
      const updated = [...aidStations];
      updated[index] = { ...updated[index], [field]: value };
      const recalculated = recalculateDistancesFromPrev(updated);
      onAidStationsChange(recalculated);
    },
    [aidStations, onAidStationsChange, recalculateDistancesFromPrev]
  );

  const handleStationChangeMultiple = useCallback(
    (index: number, changes: Partial<AidStation>) => {
      if (!onAidStationsChange) return;
      const updated = [...aidStations];
      updated[index] = { ...updated[index], ...changes };
      const recalculated = recalculateDistancesFromPrev(updated);
      onAidStationsChange(recalculated);
    },
    [aidStations, onAidStationsChange, recalculateDistancesFromPrev]
  );

  // Focus map on a station when user starts editing (on input focus, not on every change)
  const handleInputFocus = useCallback(
    (station: AidStation, index: number) => {
      if (onStationFocus) {
        onStationFocus(station, index);
      }
    },
    [onStationFocus]
  );

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


  const parseNumber = (value: string): number | null => {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };


  const renderRow = (station: AidStation, index: number) => {
    // Fields that are auto-calculated from GPX course data
    const courseCalculatedFields = hasCourseData;

    if (editable) {
      return (
        <tr
          key={`${station.name}-${index}`}
          className={`${styles.row} ${styles.editingRow}`}
          data-testid={`aid-station-row-${index}`}
        >
          <td className={styles.tdStation}>
            <span className={styles.stationNumber}>{index + 1}</span>
            <input
              type="text"
              value={station.name}
              onChange={(e) => handleStationChange(index, 'name', e.target.value)}
              onFocus={() => handleInputFocus(station, index)}
              className={styles.editInput}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
          <td className={styles.tdNumber}>
            <input
              type="number"
              value={station.distanceKm ?? ''}
              onChange={(e) =>
                handleStationChange(index, 'distanceKm', parseNumber(e.target.value))
              }
              onFocus={() => handleInputFocus(station, index)}
              className={styles.editInputNumber}
              step="0.1"
              onClick={(e) => e.stopPropagation()}
              placeholder="km"
              title="Distance from start (editable)"
            />
          </td>
          <td className={styles.tdNumber}>
            <span className={styles.calculatedValue} title="Auto-calculated from distance changes">
              {formatDistance(station.distanceFromPrevKm)}
              <span className={styles.calculatedIcon}>🔄</span>
            </span>
          </td>
          <td className={styles.tdNumber}>
            {courseCalculatedFields ? (
              <span className={styles.calculatedValue} title="Calculated from GPX course">
                {formatElevation(station.elevationM)}
                <span className={styles.calculatedIcon}>📍</span>
              </span>
            ) : (
              <input
                type="number"
                value={station.elevationM ?? ''}
                onChange={(e) =>
                  handleStationChange(index, 'elevationM', parseNumber(e.target.value))
                }
                onFocus={() => handleInputFocus(station, index)}
                className={styles.editInputNumber}
                onClick={(e) => e.stopPropagation()}
                placeholder="m"
              />
            )}
          </td>
          <td className={`${styles.tdNumber} ${styles.gain}`}>
            {courseCalculatedFields ? (
              <span className={styles.calculatedValue} title="Calculated from GPX course">
                {station.elevationGainFromPrevM !== undefined
                  ? `+${Math.round(station.elevationGainFromPrevM)}`
                  : '--'}
                <span className={styles.calculatedIcon}>📍</span>
              </span>
            ) : (
              <input
                type="number"
                value={station.elevationGainFromPrevM ?? ''}
                onChange={(e) =>
                  handleStationChange(index, 'elevationGainFromPrevM', parseNumber(e.target.value))
                }
                onFocus={() => handleInputFocus(station, index)}
                className={styles.editInputNumber}
                onClick={(e) => e.stopPropagation()}
                placeholder="m"
              />
            )}
          </td>
          <td className={`${styles.tdNumber} ${styles.loss}`}>
            {courseCalculatedFields ? (
              <span className={styles.calculatedValue} title="Calculated from GPX course">
                {station.elevationLossFromPrevM !== undefined
                  ? `-${Math.round(station.elevationLossFromPrevM)}`
                  : '--'}
                <span className={styles.calculatedIcon}>📍</span>
              </span>
            ) : (
              <input
                type="number"
                value={station.elevationLossFromPrevM ?? ''}
                onChange={(e) =>
                  handleStationChange(index, 'elevationLossFromPrevM', parseNumber(e.target.value))
                }
                onFocus={() => handleInputFocus(station, index)}
                className={styles.editInputNumber}
                onClick={(e) => e.stopPropagation()}
                placeholder="m"
              />
            )}
          </td>
          <td className={styles.tdServices}>
            <ServiceBadge
              available={station.hasDropBag}
              label="Drop"
              editable
              onClick={() =>
                handleStationChange(index, 'hasDropBag', !station.hasDropBag)
              }
            />
            <ServiceBadge
              available={station.hasCrew}
              label="Crew"
              editable
              onClick={() =>
                handleStationChange(index, 'hasCrew', !station.hasCrew)
              }
            />
            <ServiceBadge
              available={station.hasPacer}
              label="Pacer"
              editable
              onClick={() =>
                handleStationChange(index, 'hasPacer', !station.hasPacer)
              }
            />
          </td>
          <td 
            className={styles.tdCutoff} 
            onClick={(e) => e.stopPropagation()}
            onFocus={() => handleInputFocus(station, index)}
          >
            <SmartDurationInput
              raceStartTime={effectiveRaceStartTime}
              value={{
                durationMinutes: station.cutoffHoursFromStart != null
                  ? station.cutoffHoursFromStart * 60
                  : null,
                targetDate: station.cutoffHoursFromStart != null && effectiveRaceStartTime
                  ? addMinutes(effectiveRaceStartTime, station.cutoffHoursFromStart * 60)
                  : null,
              }}
              onChange={(val: SmartDurationInputValue) => {
                if (val.durationMinutes != null) {
                  const hours = val.durationMinutes / 60;
                  handleStationChangeMultiple(index, {
                    cutoffHoursFromStart: hours,
                    cutoffDayOffset: Math.floor(hours / 24),
                  });
                } else {
                  handleStationChangeMultiple(index, {
                    cutoffHoursFromStart: null,
                    cutoffDayOffset: null,
                  });
                }
              }}
              placeholder="e.g., 33h, Day 2 08:00"
            />
          </td>
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
        </tr>
      );
    }

    return (
      <tr
        key={`${station.name}-${index}`}
        className={styles.row}
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
          {formatCutoff(station.cutoffTime, station.cutoffHoursFromStart, station.cutoffDayOffset)}
        </td>
      </tr>
    );
  };

  const renderStartRow = () => {
    const courseCalculatedFields = hasCourseData;

    if (editable && (onStartElevationChange || onStartCutoffChange)) {
      return (
        <tr
          key="start"
          className={`${styles.row} ${styles.startRow} ${styles.editingRow}`}
          data-testid="aid-station-row-start"
        >
          <td className={styles.tdStation}>
            <span className={`${styles.stationNumber} ${styles.startMarker}`}>S</span>
            <span className={styles.stationName}>Start</span>
          </td>
          <td className={styles.tdNumber}>{formatDistance(0)}</td>
          <td className={styles.tdNumber}>--</td>
          <td className={styles.tdNumber}>
            {courseCalculatedFields ? (
              <span className={styles.calculatedValue} title="Calculated from GPX course">
                {formatElevation(startElevationM)}
                <span className={styles.calculatedIcon}>📍</span>
              </span>
            ) : (
              <input
                type="number"
                value={startElevationM ?? ''}
                onChange={(e) => onStartElevationChange?.(parseNumber(e.target.value))}
                className={styles.editInputNumber}
                placeholder="m"
              />
            )}
          </td>
          <td className={`${styles.tdNumber} ${styles.gain}`}>--</td>
          <td className={`${styles.tdNumber} ${styles.loss}`}>--</td>
          <td className={styles.tdServices}>--</td>
          <td className={styles.tdCutoff}>
            <SmartDurationInput
              raceStartTime={effectiveRaceStartTime}
              value={{
                durationMinutes: startCutoffHours != null ? startCutoffHours * 60 : null,
                targetDate: startCutoffHours != null && effectiveRaceStartTime
                  ? addMinutes(effectiveRaceStartTime, startCutoffHours * 60)
                  : null,
              }}
              onChange={(val: SmartDurationInputValue) => {
                if (val.durationMinutes != null) {
                  onStartCutoffChange?.(val.durationMinutes / 60);
                } else {
                  onStartCutoffChange?.(null);
                }
              }}
              placeholder="e.g., 33h, Day 2 08:00"
            />
          </td>
          <td className={styles.tdActions}></td>
        </tr>
      );
    }
    
    return (
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
        <td className={styles.tdCutoff}>
          {formatCutoff(null, startCutoffHours)}
        </td>
      </tr>
    );
  };

  const renderFinishRow = () => {
    const lastStation = aidStations[aidStations.length - 1];
    const distanceFromPrev = raceDistanceKm && lastStation?.distanceKm
      ? raceDistanceKm - lastStation.distanceKm
      : raceDistanceKm;

    const sumOfGains = aidStations.reduce((sum, s) => sum + (s.elevationGainFromPrevM ?? 0), 0);
    const sumOfLosses = aidStations.reduce((sum, s) => sum + (s.elevationLossFromPrevM ?? 0), 0);
    const finishGain = totalElevationGainM ? totalElevationGainM - sumOfGains : undefined;
    const finishLoss = totalElevationLossM ? totalElevationLossM - sumOfLosses : undefined;

    if (editable && onOverallCutoffChange) {
      return (
        <tr
          key="finish"
          className={`${styles.row} ${styles.finishRow} ${styles.editingRow}`}
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
          <td className={styles.tdCutoff}>
            <SmartDurationInput
              raceStartTime={effectiveRaceStartTime}
              value={{
                durationMinutes: overallCutoffHours != null ? overallCutoffHours * 60 : null,
                targetDate: overallCutoffHours != null && effectiveRaceStartTime
                  ? addMinutes(effectiveRaceStartTime, overallCutoffHours * 60)
                  : null,
              }}
              onChange={(val: SmartDurationInputValue) => {
                if (val.durationMinutes != null) {
                  onOverallCutoffChange(val.durationMinutes / 60);
                } else {
                  onOverallCutoffChange(null);
                }
              }}
              placeholder="e.g., 33h, Day 2 08:00"
            />
          </td>
          <td className={styles.tdActions}></td>
        </tr>
      );
    }

    return (
      <tr
        key="finish"
        className={`${styles.row} ${styles.finishRow}`}
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
          All changes are saved automatically.
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
            {aidStations.map((station, index) => renderRow(station, index))}
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
