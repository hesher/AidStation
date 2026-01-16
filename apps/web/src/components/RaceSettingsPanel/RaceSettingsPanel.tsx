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
}

export function RaceSettingsPanel({
  race,
  onVisibilityChange,
  onSave,
  isSaving = false,
  hasUnsavedChanges = false,
}: RaceSettingsPanelProps) {
  const [isPublic, setIsPublic] = useState(race.isPublic ?? false);

  const handleToggleVisibility = useCallback(() => {
    const newValue = !isPublic;
    setIsPublic(newValue);
    onVisibilityChange(newValue);
  }, [isPublic, onVisibilityChange]);

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

        {/* Save Button */}
        <div className={styles.actions}>
          <button
            className={`${styles.saveButton} ${hasUnsavedChanges ? styles.saveButtonActive : ''}`}
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            data-testid="save-race-button"
          >
            {isSaving ? (
              <>
                <span className={styles.spinner} />
                Saving...
              </>
            ) : (
              <>
                💾 Save Race
              </>
            )}
          </button>
        </div>
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
