/**
 * SmartDurationInput Component
 *
 * A smart input field that uses NLP-like parsing to interpret race timing inputs.
 * Converts between duration formats (hours/minutes from start) and wall clock times.
 *
 * Supports:
 * - "33" or "33h" → 33 hours elapsed
 * - "33:30" → 33 hours, 30 minutes elapsed
 * - "Fri 14:00" → Next Friday at 14:00 relative to race start
 * - "Day 2 08:00" → Day 2 at 08:00 (Day 1 = race start day)
 * - "14:00" → Next occurrence of 14:00 after race start
 */

'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  parseRaceTime,
  formatDuration,
  formatDate,
  durationToInput,
  ParsedRaceTime,
} from '@/lib/parseRaceTime';
import { addMinutes } from 'date-fns';
import styles from './SmartDurationInput.module.css';

export interface SmartDurationInputValue {
  durationMinutes: number | null;
  targetDate: Date | null;
}

export interface SmartDurationInputProps {
  raceStartTime: Date | null;
  value: SmartDurationInputValue | null;
  onChange: (value: SmartDurationInputValue) => void;
  onEnter?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export function SmartDurationInput({
  raceStartTime,
  value,
  onChange,
  onEnter,
  placeholder = 'e.g., 33h, 33:30, Day 2 08:00',
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: SmartDurationInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [parsedResult, setParsedResult] = useState<ParsedRaceTime | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = useMemo(() => {
    if (!value || value.durationMinutes === null) {
      return { primary: '--', secondary: null };
    }

    const duration = formatDuration(value.durationMinutes);
    const date = value.targetDate ? formatDate(value.targetDate) : null;

    return {
      primary: duration,
      secondary: date,
    };
  }, [value]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    if (value?.durationMinutes !== null && value?.durationMinutes !== undefined) {
      const input = durationToInput(value.durationMinutes);
      setInputValue(input);
      if (raceStartTime) {
        setParsedResult(parseRaceTime(input, raceStartTime));
      } else {
        // Create a temporary date just for parsing validation, but don't use it for display
        const tempDate = new Date();
        tempDate.setHours(6, 0, 0, 0);
        setParsedResult(parseRaceTime(input, tempDate));
      }
    } else {
      setInputValue('');
      setParsedResult(null);
    }
  }, [value, raceStartTime]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);

    if (parsedResult?.isValid && parsedResult.durationMinutes !== null) {
      onChange({
        durationMinutes: parsedResult.durationMinutes,
        targetDate: raceStartTime ? parsedResult.targetDate : null,
      });
    } else if (!inputValue.trim()) {
      onChange({
        durationMinutes: null,
        targetDate: null,
      });
    }

    setInputValue('');
    setParsedResult(null);
  }, [parsedResult, inputValue, onChange, raceStartTime]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);

      if (newValue.trim()) {
        // Use race start time if available, otherwise use a temporary date for parsing validation
        const parseDate = raceStartTime || (() => {
          const temp = new Date();
          temp.setHours(6, 0, 0, 0);
          return temp;
        })();
        const result = parseRaceTime(newValue, parseDate);
        setParsedResult(result);
      } else {
        setParsedResult(null);
      }
    },
    [raceStartTime]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (parsedResult?.isValid && parsedResult.durationMinutes !== null) {
          onChange({
            durationMinutes: parsedResult.durationMinutes,
            targetDate: raceStartTime ? parsedResult.targetDate : null,
          });
          setIsEditing(false);
          setInputValue('');
          setParsedResult(null);
          inputRef.current?.blur();
          onEnter?.();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsEditing(false);
        setInputValue('');
        setParsedResult(null);
        inputRef.current?.blur();
      }
    },
    [parsedResult, onChange, raceStartTime, onEnter]
  );

  const handleDisplayClick = useCallback(() => {
    if (!disabled) {
      setIsEditing(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [disabled]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const renderPreview = () => {
    if (!parsedResult) return null;

    if (!parsedResult.isValid) {
      return (
        <div className={`${styles.preview} ${styles.previewError}`}>
          <span className={styles.previewIcon}>⚠️</span>
          <span>Cannot parse input</span>
        </div>
      );
    }

    // If no race start time is set, show a message instead of the calculated date
    if (!raceStartTime) {
      return (
        <div className={`${styles.preview} ${styles.previewValid}`}>
          <span className={styles.previewIcon}>⏱️</span>
          <span className={styles.previewText}>{parsedResult.displayDuration}</span>
          <span className={styles.previewHint}>(set race date to see time)</span>
        </div>
      );
    }

    if (parsedResult.type === 'duration') {
      return (
        <div className={`${styles.preview} ${styles.previewValid}`}>
          <span className={styles.previewIcon}>📅</span>
          <span className={styles.previewText}>{parsedResult.displayDate}</span>
        </div>
      );
    }

    return (
      <div className={`${styles.preview} ${styles.previewValid}`}>
        <span className={styles.previewIcon}>⏱️</span>
        <span className={styles.previewText}>{parsedResult.displayDuration} elapsed</span>
      </div>
    );
  };

  const getFormatTemplate = () => {
    if (!parsedResult?.isValid) return null;
    return parsedResult.formatTemplate;
  };

  if (isEditing) {
    return (
      <div className={`${styles.container} ${styles.editing} ${className || ''}`}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            id={id}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={`${styles.input} ${parsedResult && !parsedResult.isValid ? styles.inputError : ''}`}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            aria-invalid={parsedResult ? !parsedResult.isValid : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {parsedResult?.isValid && (
              <span className={styles.formatBadge}>{getFormatTemplate()}</span>
            )}
        </div>
        {renderPreview()}
      </div>
    );
  }

  return (
    <div
      className={`${styles.container} ${styles.display} ${disabled ? styles.disabled : ''} ${className || ''}`}
      onClick={handleDisplayClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleDisplayClick();
        }
      }}
      aria-label={ariaLabel || 'Click to edit duration'}
    >
      <div className={styles.displayContent}>
        <span className={styles.displayPrimary}>{displayValue.primary}</span>
        {displayValue.secondary && (
          <span className={styles.displaySecondary}>{displayValue.secondary}</span>
        )}
      </div>
      {!disabled && <span className={styles.editIcon}>✏️</span>}
    </div>
  );
}

export default SmartDurationInput;
