'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './planning.module.css';
import {
  getPlans,
  createPlan,
  generatePredictions,
  deletePlan,
  getSavedRaces,
  getPerformanceProfile,
  RacePlan,
  AidStationPrediction,
} from '../../lib/api';

interface SavedRace {
  id: string;
  name: string;
  date?: string;
  distanceKm?: number;
  country?: string;
}

interface PerformanceProfile {
  flatPaceMinKm?: number;
  climbingPaceMinKm?: number;
  descendingPaceMinKm?: number;
  fatigueFactor?: number;
  activitiesCount: number;
}

function formatPace(paceMinKm: number | undefined | null): string {
  if (!paceMinKm) return '-';
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

function formatDuration(minutes: number | undefined | null): string {
  if (!minutes) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function formatTime(isoString: string | undefined | null): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '-';
  }
}

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '-';
  }
}

function getStatusColor(status: AidStationPrediction['status']): string {
  switch (status) {
    case 'safe':
      return styles.statusSafe;
    case 'warning':
      return styles.statusWarning;
    case 'danger':
      return styles.statusDanger;
    case 'missed':
      return styles.statusMissed;
    default:
      return '';
  }
}

function getStatusIcon(status: AidStationPrediction['status']): string {
  switch (status) {
    case 'safe':
      return '🟢';
    case 'warning':
      return '🟡';
    case 'danger':
      return '🔴';
    case 'missed':
      return '❌';
    default:
      return '';
  }
}

export default function PlanningPage() {
  const [plans, setPlans] = useState<RacePlan[]>([]);
  const [races, setRaces] = useState<SavedRace[]>([]);
  const [performance, setPerformance] = useState<PerformanceProfile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RacePlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for new plan
  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  const [planName, setPlanName] = useState('');

  // Pace adjustment state
  const [showPaceSettings, setShowPaceSettings] = useState(false);
  const [basePaceMinutes, setBasePaceMinutes] = useState(6);
  const [basePaceSeconds, setBasePaceSeconds] = useState(30);
  const [nighttimeSlowdown, setNighttimeSlowdown] = useState(15);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [plansRes, racesRes, profileRes] = await Promise.all([
        getPlans(),
        getSavedRaces(),
        getPerformanceProfile(),
      ]);

      if (plansRes.success && plansRes.data) {
        setPlans(plansRes.data.plans);
      }

      if (racesRes.success && racesRes.data) {
        setRaces(racesRes.data.races);
      }

      if (profileRes.success && profileRes.data) {
        setPerformance(profileRes.data);
      }
    } catch (err) {
      setError('Failed to load planning data');
      console.error('Load data error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreatePlan = async () => {
    if (!selectedRaceId) {
      setError('Please select a race first');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await createPlan(selectedRaceId, {
        name: planName || undefined,
      });

      if (result.success && result.data) {
        // Generate predictions immediately
        setIsGenerating(true);
        const predResult = await generatePredictions(result.data.id);

        if (predResult.success && predResult.data) {
          setSelectedPlan(predResult.data);
          setPlans([predResult.data, ...plans]);
        } else {
          setSelectedPlan(result.data);
          setPlans([result.data, ...plans]);
        }

        setPlanName('');
        setSelectedRaceId('');
      } else {
        setError(result.error || 'Failed to create plan');
      }
    } catch (err) {
      setError('Failed to create plan');
      console.error('Create plan error:', err);
    } finally {
      setIsCreating(false);
      setIsGenerating(false);
    }
  };

  const handleRegeneratePredictions = async (planId: string) => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generatePredictions(planId);

      if (result.success && result.data) {
        setSelectedPlan(result.data);
        setPlans(plans.map((p) => (p.id === planId ? result.data! : p)));
      } else {
        setError(result.error || 'Failed to generate predictions');
      }
    } catch (err) {
      setError('Failed to generate predictions');
      console.error('Generate predictions error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      const result = await deletePlan(planId);
      if (result.success) {
        setPlans(plans.filter((p) => p.id !== planId));
        if (selectedPlan?.id === planId) {
          setSelectedPlan(null);
        }
      } else {
        setError('Failed to delete plan');
      }
    } catch (err) {
      setError('Failed to delete plan');
      console.error('Delete plan error:', err);
    }
  };

  const handleSelectPlan = (plan: RacePlan) => {
    setSelectedPlan(plan);
  };

  if (isLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading planning data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Race Planning</h1>
        <p className={styles.subtitle}>
          Create personalized race plans with predicted aid station arrival times
        </p>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className={styles.layout}>
        {/* Left Panel - Create Plan & Plan List */}
        <aside className={styles.sidebar}>
          {/* Performance Summary */}
          {performance && performance.activitiesCount > 0 && (
            <section className={styles.performanceCard}>
              <h3>Your Performance Profile</h3>
              <div className={styles.perfStats}>
                <div className={styles.perfStat}>
                  <span className={styles.perfLabel}>Flat Pace</span>
                  <span className={styles.perfValue}>
                    {formatPace(performance.flatPaceMinKm)}
                  </span>
                </div>
                <div className={styles.perfStat}>
                  <span className={styles.perfLabel}>Climb Pace</span>
                  <span className={styles.perfValue}>
                    {formatPace(performance.climbingPaceMinKm)}
                  </span>
                </div>
                <div className={styles.perfStat}>
                  <span className={styles.perfLabel}>Activities</span>
                  <span className={styles.perfValue}>
                    {performance.activitiesCount}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Create New Plan */}
          <section className={styles.createSection}>
            <h3>Create New Plan</h3>
            <div className={styles.createForm}>
              <select
                value={selectedRaceId}
                onChange={(e) => setSelectedRaceId(e.target.value)}
                className={styles.raceSelect}
                disabled={isCreating}
              >
                <option value="">Select a race...</option>
                {races.map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.name} {race.distanceKm ? `(${race.distanceKm}km)` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Plan name (optional)"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className={styles.planNameInput}
                disabled={isCreating}
              />
              <button
                onClick={handleCreatePlan}
                disabled={!selectedRaceId || isCreating}
                className={styles.createButton}
              >
                {isCreating ? 'Creating...' : 'Create Plan'}
              </button>
            </div>
            {races.length === 0 && (
              <p className={styles.noRaces}>
                No saved races yet. <a href="/">Search for a race</a> first!
              </p>
            )}
          </section>

          {/* Existing Plans */}
          <section className={styles.plansListSection}>
            <h3>Your Plans ({plans.length})</h3>
            <div className={styles.plansList}>
              {plans.length > 0 ? (
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`${styles.planItem} ${selectedPlan?.id === plan.id ? styles.planItemActive : ''}`}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    <div className={styles.planItemHeader}>
                      <span className={styles.planItemName}>
                        {plan.name || 'Unnamed Plan'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlan(plan.id);
                        }}
                        className={styles.deleteButton}
                        title="Delete plan"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className={styles.planItemMeta}>
                      <span>{plan.race?.name || 'Unknown race'}</span>
                      {plan.predictedTotalMinutes && (
                        <span className={styles.planTime}>
                          {formatDuration(plan.predictedTotalMinutes)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.noPlans}>No plans created yet</p>
              )}
            </div>
          </section>
        </aside>

        {/* Main Content - Plan Details */}
        <section className={styles.planDetails}>
          {selectedPlan ? (
            <>
              <div className={styles.planHeader}>
                <h2>{selectedPlan.name || 'Unnamed Plan'}</h2>
                <div className={styles.planActions}>
                  <button
                    onClick={() => handleRegeneratePredictions(selectedPlan.id)}
                    disabled={isGenerating}
                    className={styles.regenerateButton}
                  >
                    {isGenerating ? 'Generating...' : '🔄 Regenerate Predictions'}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className={styles.exportButton}
                  >
                    📄 Export PDF
                  </button>
                </div>
              </div>

              <div className={styles.planSummary}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Race</span>
                  <span className={styles.summaryValue}>
                    {selectedPlan.race?.name || 'Unknown'}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Distance</span>
                  <span className={styles.summaryValue}>
                    {selectedPlan.race?.distanceKm
                      ? `${selectedPlan.race.distanceKm} km`
                      : '-'}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Predicted Finish</span>
                  <span className={styles.summaryValue}>
                    {formatDuration(selectedPlan.predictedTotalMinutes)}
                  </span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Finish Time</span>
                  <span className={styles.summaryValue}>
                    {formatTime(selectedPlan.predictedFinishTime)}
                  </span>
                </div>
              </div>

              {/* Pace Settings Panel */}
              <div className={styles.paceSettingsSection}>
                <button
                  onClick={() => setShowPaceSettings(!showPaceSettings)}
                  className={styles.paceSettingsToggle}
                >
                  ⚙️ {showPaceSettings ? 'Hide' : 'Show'} Pace Settings
                </button>

                {showPaceSettings && (
                  <div className={styles.paceSettingsPanel}>
                    <div className={styles.paceSettingRow}>
                      <label className={styles.paceLabel}>
                        Base Pace
                        <span className={styles.paceHint}>Your flat terrain pace</span>
                      </label>
                      <div className={styles.paceInputGroup}>
                        <input
                          type="number"
                          min={3}
                          max={15}
                          value={basePaceMinutes}
                          onChange={(e) => setBasePaceMinutes(parseInt(e.target.value) || 6)}
                          className={styles.paceInput}
                        />
                        <span className={styles.paceColon}>:</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={basePaceSeconds}
                          onChange={(e) => setBasePaceSeconds(parseInt(e.target.value) || 0)}
                          className={styles.paceInput}
                        />
                        <span className={styles.paceUnit}>/km</span>
                      </div>
                    </div>

                    <div className={styles.paceSettingRow}>
                      <label className={styles.paceLabel}>
                        Nighttime Slowdown
                        <span className={styles.paceHint}>Additional slowdown after dark</span>
                      </label>
                      <div className={styles.sliderGroup}>
                        <input
                          type="range"
                          min={0}
                          max={30}
                          value={nighttimeSlowdown}
                          onChange={(e) => setNighttimeSlowdown(parseInt(e.target.value))}
                          className={styles.slider}
                        />
                        <span className={styles.sliderValue}>{nighttimeSlowdown}%</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRegeneratePredictions(selectedPlan.id)}
                      disabled={isGenerating}
                      className={styles.applyPaceButton}
                    >
                      {isGenerating ? 'Applying...' : '✓ Apply Settings'}
                    </button>
                  </div>
                )}
              </div>

              {/* Aid Station Timeline */}
              {selectedPlan.aidStationPredictions &&
              selectedPlan.aidStationPredictions.length > 0 ? (
                <div className={styles.timeline}>
                  <h3>Aid Station Timeline</h3>
                  <div className={styles.timelineTable}>
                    <div className={styles.timelineHeader}>
                      <span>Status</span>
                      <span>Station</span>
                      <span>Distance</span>
                      <span>Arrival</span>
                      <span>Elapsed</span>
                      <span>Cutoff</span>
                      <span>Buffer</span>
                      <span>Pace</span>
                    </div>
                    {selectedPlan.aidStationPredictions.map((station, index) => (
                      <div
                        key={station.aidStationId || index}
                        className={`${styles.timelineRow} ${getStatusColor(station.status)}`}
                        data-testid={`prediction-row-${index}`}
                      >
                        <span className={styles.statusCell}>
                          {getStatusIcon(station.status)}
                        </span>
                        <span className={styles.stationName}>
                          {station.aidStationName}
                        </span>
                        <span>{station.distanceKm.toFixed(1)} km</span>
                        <span>{formatTime(station.predictedArrivalTime)}</span>
                        <span>{formatDuration(station.predictedArrivalMinutes)}</span>
                        <span>
                          {station.cutoffHoursFromStart
                            ? `${station.cutoffHoursFromStart}h`
                            : '-'}
                        </span>
                        <span
                          className={
                            station.bufferMinutes !== undefined &&
                            station.bufferMinutes < 30
                              ? styles.bufferLow
                              : ''
                          }
                        >
                          {station.bufferMinutes !== undefined
                            ? `${station.bufferMinutes}m`
                            : '-'}
                        </span>
                        <span>
                          {formatPace(station.pacePredictions.segmentPaceMinKm)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className={styles.legend}>
                    <div className={styles.legendItem}>
                      <span>🟢</span> Safe (&gt;30m buffer)
                    </div>
                    <div className={styles.legendItem}>
                      <span>🟡</span> Warning (15-30m buffer)
                    </div>
                    <div className={styles.legendItem}>
                      <span>🔴</span> Danger (&lt;15m buffer)
                    </div>
                    <div className={styles.legendItem}>
                      <span>❌</span> Missed cutoff
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.noPredictions}>
                  <p>No predictions generated yet</p>
                  <button
                    onClick={() => handleRegeneratePredictions(selectedPlan.id)}
                    disabled={isGenerating}
                    className={styles.generateButton}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Predictions'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.noPlanSelected}>
              <div className={styles.emptyIcon}>📋</div>
              <h3>No Plan Selected</h3>
              <p>
                Select an existing plan from the list or create a new one to see
                your predicted race timeline.
              </p>
            </div>
          )}
        </section>
      </div>

    </main>
  );
}
