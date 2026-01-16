/**
 * Race Settings Panel Component
 *
 * Panel for managing race settings including visibility and save status.
 */

'use client';

import { useState, useCallback } from 'react';
import styles from './RaceSettingsPanel.module.css';
import { RaceData } from '@/lib/types';

interface RaceSettingsPanelProps {
  race: RaceData;
  onVisibilityChange: (isPublic: boolean) => void;
  onSave: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  autoSaveEnabled?: boolean;
  onAutoSaveToggle?: (enabled: boolean) => void;
  lastSaveTime?: Date | null;
}

export function RaceSettingsPanel({
  race,
  onVisibilityChange,
  onSave,
  isSaving = false,
  hasUnsavedChanges = false,
  autoSaveEnabled = true,
  onAutoSaveToggle,
  lastSaveTime,
}: RaceSettingsPanelProps) {
  const [isPublic, setIsPublic] = useState(race.isPublic ?? false);

  // Race needs saving if it has unsaved changes OR if it has never been saved (no ID)
  const needsSave = hasUnsavedChanges || !race.id;

  const handleToggleVisibility = useCallback(() => {
    const newValue = !isPublic;
    setIsPublic(newValue);
    onVisibilityChange(newValue);
  }, [isPublic, onVisibilityChange]);

  const handleAutoSaveToggle = useCallback(() => {
    onAutoSaveToggle?.(!autoSaveEnabled);
  }, [autoSaveEnabled, onAutoSaveToggle]);

  // Format last save time
  const formatLastSaveTime = (date: Date | null | undefined) => {
    if (!date) return null;
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className={styles.panel} data-testid="race-settings-panel">
      <div className={styles.header}>
        <h3 className={styles.title}>Race Settings</h3>
        {hasUnsavedChanges && (
          <span className={styles.unsavedBadge} data-testid="unsaved-badge">
            Unsaved
          </span>
        )}
      </div>

      <div className={styles.settings}>
        {/* Visibility Toggle */}
        <div className={styles.settingRow}>
          <div className={styles.settingInfo}>
            <span className={styles.settingLabel}>Race Visibility</span>
            <span className={styles.settingDescription}>
              {isPublic
                ? 'This race is visible to all users'
                : 'Only you can see this race'}
            </span>
          </div>

          <button
            className={`${styles.toggleButton} ${isPublic ? styles.togglePublic : styles.togglePrivate}`}
            onClick={handleToggleVisibility}
            aria-pressed={isPublic}
            data-testid="visibility-toggle"
          >
            <span className={styles.toggleIcon}>
              {isPublic ? '🌍' : '🔒'}
            </span>
            <span className={styles.toggleText}>
              {isPublic ? 'Public' : 'Private'}
            </span>
          </button>
        </div>

        {/* Auto-Save Toggle */}
        {race.id && onAutoSaveToggle && (
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <span className={styles.settingLabel}>Auto-Save</span>
              <span className={styles.settingDescription}>
                {autoSaveEnabled
                  ? 'Changes are saved automatically'
                  : 'Save changes manually'}
              </span>
            </div>

            <button
              className={`${styles.toggleButton} ${autoSaveEnabled ? styles.togglePublic : styles.togglePrivate}`}
              onClick={handleAutoSaveToggle}
              aria-pressed={autoSaveEnabled}
              data-testid="autosave-toggle"
            >
              <span className={styles.toggleIcon}>
                {autoSaveEnabled ? '✓' : '✗'}
              </span>
              <span className={styles.toggleText}>
                {autoSaveEnabled ? 'On' : 'Off'}
              </span>
            </button>
          </div>
        )}

        {/* Save Button */}
        <div className={styles.actions}>
          <button
            className={`${styles.saveButton} ${needsSave ? styles.saveButtonActive : ''}`}
            onClick={onSave}
            disabled={isSaving || !needsSave}
            data-testid="save-race-button"
          >
            {isSaving ? (
              <>
                <span className={styles.spinner} />
                Saving...
              </>
            ) : (
              <>
                💾 {race.id ? 'Save Race' : 'Save New Race'}
              </>
            )}
          </button>
        </div>

        {/* Last Save Time Indicator */}
        {lastSaveTime && (
          <div className={styles.lastSaveTime} data-testid="last-save-time">
            <span className={styles.lastSaveIcon}>✓</span>
            <span>Saved {formatLastSaveTime(lastSaveTime)}</span>
          </div>
        )}
      </div>

      {/* Race ID (for debugging/reference) */}
      {race.id && (
        <div className={styles.raceId}>
          <span className={styles.raceIdLabel}>Race ID:</span>
          <code className={styles.raceIdValue}>{race.id.substring(0, 8)}...</code>
        </div>
      )}
    </div>
  );
}
