/**
 * AIUpdatePanel Component
 *
 * Provides a UI for AI-powered race updates using natural language instructions.
 * Examples: "Add a milestone every 5 km", "Add a water stop at 15 km"
 */

import React, { useState, useCallback } from 'react';
import styles from './AIUpdatePanel.module.css';
import { updateRaceWithAI, WaypointUpdate } from '@/lib/api';
import { AidStation } from '@/lib/types';

interface AIUpdatePanelProps {
  raceId: string;
  onUpdateComplete?: (updatedAidStations: AidStation[]) => void;
}

export function AIUpdatePanel({ raceId, onUpdateComplete }: AIUpdatePanelProps) {
  const [instruction, setInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; updates: WaypointUpdate[] } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!instruction.trim() || !raceId) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateRaceWithAI(raceId, instruction.trim());

      if (result.success && result.data) {
        setSuccess({
          message: result.data.message,
          updates: result.data.waypointUpdates,
        });
        setInstruction('');

        if (result.data.updatedAidStations && onUpdateComplete) {
          onUpdateComplete(result.data.updatedAidStations as AidStation[]);
        }
      } else {
        setError(result.error || 'Failed to update race');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [instruction, raceId, onUpdateComplete]);

  const exampleInstructions = [
    'Add a milestone every 5 km',
    'Add a water stop at 15 km',
    'Add a viewpoint at the summit',
    'Mark every 10 km as a milestone',
  ];

  const handleExampleClick = useCallback((example: string) => {
    setInstruction(example);
    setError(null);
    setSuccess(null);
  }, []);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'add':
        return '➕';
      case 'update':
        return '✏️';
      case 'remove':
        return '🗑️';
      default:
        return '•';
    }
  };

  const getWaypointTypeLabel = (type?: string) => {
    switch (type) {
      case 'aid_station':
        return 'Aid Station';
      case 'water_stop':
        return 'Water Stop';
      case 'viewpoint':
        return 'Viewpoint';
      case 'toilet':
        return 'Toilet';
      case 'milestone':
        return 'Milestone';
      case 'custom':
        return 'Custom';
      default:
        return type || 'Waypoint';
    }
  };

  return (
    <div className={styles.container} data-testid="ai-update-panel">
      <button
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={styles.toggleIcon}>✨</span>
        <span className={styles.toggleText}>AI Race Update</span>
        <span className={`${styles.chevron} ${isExpanded ? styles.chevronUp : ''}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className={styles.content}>
          <p className={styles.description}>
            Use natural language to update your race. Describe what you want to add, modify, or remove.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                value={instruction}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                placeholder="e.g., Add a milestone every 5 km"
                className={styles.input}
                disabled={isLoading}
                data-testid="ai-instruction-input"
              />
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isLoading || !instruction.trim()}
                data-testid="ai-submit-button"
              >
                {isLoading ? (
                  <span className={styles.loadingSpinner}></span>
                ) : (
                  '🚀 Apply'
                )}
              </button>
            </div>
          </form>

          <div className={styles.examples}>
            <span className={styles.examplesLabel}>Examples:</span>
            <div className={styles.exampleButtons}>
              {exampleInstructions.map((example) => (
                <button
                  key={example}
                  onClick={() => handleExampleClick(example)}
                  className={styles.exampleButton}
                  disabled={isLoading}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className={styles.loadingState} data-testid="ai-loading-state">
              <div className={styles.loadingSpinnerLarge}></div>
              <p className={styles.loadingText}>AI is processing your request...</p>
            </div>
          )}

          {error && (
            <div className={styles.error} data-testid="ai-error-message">
              <span className={styles.errorIcon}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className={styles.success} data-testid="ai-success-message">
              <div className={styles.successHeader}>
                <span className={styles.successIcon}>✅</span>
                <span className={styles.successMessage}>{success.message}</span>
              </div>
              {success.updates.length > 0 && (
                <ul className={styles.updatesList}>
                  {success.updates.map((update, index) => (
                    <li key={index} className={styles.updateItem}>
                      <span className={styles.updateAction}>
                        {getActionIcon(update.action)}
                      </span>
                      <span className={styles.updateDetails}>
                        <strong>{update.name}</strong>
                        {update.distanceKm !== null && (
                          <span className={styles.updateDistance}>
                            @ {update.distanceKm.toFixed(1)} km
                          </span>
                        )}
                        <span className={`${styles.waypointType} ${styles[`type${update.waypointType?.replace('_', '') || 'milestone'}`]}`}>
                          {getWaypointTypeLabel(update.waypointType)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AIUpdatePanel;
