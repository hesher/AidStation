/**
 * Parse Race Time Utility
 *
 * Parses natural language time inputs for race timing, converting between:
 * - Duration formats (hours, minutes from race start)
 * - Wall clock time formats (specific day/time)
 *
 * Supports various input formats:
 * - "33" or "33h" → 33 hours elapsed
 * - "33:30" → 33 hours, 30 minutes elapsed
 * - "Fri 14:00" → Next Friday at 14:00 relative to race start
 * - "Day 2 08:00" → Day 2 at 08:00 (Day 1 = race start day)
 * - "14:00" → Next occurrence of 14:00 after race start
 */

import {
  addHours,
  addMinutes,
  addDays,
  differenceInMinutes,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  format,
  startOfDay,
  isAfter,
  isBefore,
} from 'date-fns';

export type ParsedTimeType = 'duration' | 'wallclock' | 'invalid';

export type InputFormatType = 
  | 'hours' 
  | 'hours_minutes' 
  | 'day_time' 
  | 'weekday_time' 
  | 'date_time' 
  | 'time_only' 
  | 'unknown';

export interface ParsedRaceTime {
  type: ParsedTimeType;
  isValid: boolean;
  durationMinutes: number | null;
  targetDate: Date | null;
  displayDuration: string | null;
  displayDate: string | null;
  inputFormat: InputFormatType;
  formatTemplate: string | null;
  originalInput: string;
}

const DAY_NAMES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/**
 * Creates an invalid parse result
 */
function createInvalidResult(input: string): ParsedRaceTime {
  return {
    type: 'invalid',
    isValid: false,
    durationMinutes: null,
    targetDate: null,
    displayDuration: null,
    displayDate: null,
    inputFormat: 'unknown',
    formatTemplate: null,
    originalInput: input,
  };
}

/**
 * Normalizes time to midnight and returns a clean date
 */
function normalizeToMidnight(date: Date): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(date, 0), 0), 0), 0);
}

/**
 * Formats duration in minutes to a human-readable string
 */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 0) return '0h 00m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

/**
 * Formats a date to a human-readable string
 */
export function formatDate(date: Date): string {
  return format(date, 'MMM d, HH:mm');
}

/**
 * Parse hours-only input: "33" or "33h"
 */
function parseHoursOnly(input: string, raceStartTime: Date): ParsedRaceTime | null {
  const match = input.match(/^(\d+(?:\.\d+)?)\s*h?$/i);
  if (!match) return null;

  const hours = parseFloat(match[1]);
  if (isNaN(hours) || hours < 0) return null;

  const durationMinutes = hours * 60;
  const targetDate = addMinutes(raceStartTime, durationMinutes);

  return {
    type: 'duration',
    isValid: true,
    durationMinutes,
    targetDate,
    displayDuration: formatDuration(durationMinutes),
    displayDate: formatDate(targetDate),
    inputFormat: 'hours',
    formatTemplate: '33h',
    originalInput: input,
  };
}

/**
 * Parse hours:minutes format: "33:30" or "33h30m" or "33h 30m"
 */
function parseHoursMinutes(input: string, raceStartTime: Date): ParsedRaceTime | null {
  // Match "33:30" format
  let match = input.match(/^(\d+):(\d{1,2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || minutes < 0 || minutes >= 60) {
      return null;
    }

    const durationMinutes = hours * 60 + minutes;
    const targetDate = addMinutes(raceStartTime, durationMinutes);

    return {
      type: 'duration',
      isValid: true,
      durationMinutes,
      targetDate,
      displayDuration: formatDuration(durationMinutes),
      displayDate: formatDate(targetDate),
      inputFormat: 'hours_minutes',
      formatTemplate: '33:30',
      originalInput: input,
    };
  }

  // Match "33h30m" or "33h 30m" format
  match = input.match(/^(\d+)\s*h\s*(\d{1,2})\s*m?$/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || minutes < 0 || minutes >= 60) {
      return null;
    }

    const durationMinutes = hours * 60 + minutes;
    const targetDate = addMinutes(raceStartTime, durationMinutes);

    return {
      type: 'duration',
      isValid: true,
      durationMinutes,
      targetDate,
      displayDuration: formatDuration(durationMinutes),
      displayDate: formatDate(targetDate),
      inputFormat: 'hours_minutes',
      formatTemplate: '33h 30m',
      originalInput: input,
    };
  }

  return null;
}

/**
 * Parse DD/MM HH:MM format: "04/10 12:00" or "4/10 12:00"
 * Days are parsed as DD/MM (day/month)
 */
function parseDateTimeFormat(input: string, raceStartTime: Date): ParsedRaceTime | null {
  // Match "DD/MM HH:MM" or "D/M HH:MM" format
  const match = input.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const hours = parseInt(match[3], 10);
  const minutes = parseInt(match[4], 10);

  // Validate ranges
  if (
    isNaN(day) ||
    isNaN(month) ||
    isNaN(hours) ||
    isNaN(minutes) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return null;
  }

  // Get year from race start time
  let year = raceStartTime.getFullYear();

  // Create the target date (month is 0-indexed in JavaScript)
  let targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

  // If the target date is before race start, try next year
  if (targetDate < raceStartTime) {
    year += 1;
    targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  // Calculate duration from race start
  const durationMinutes = differenceInMinutes(targetDate, raceStartTime);

  // If still negative, something is wrong
  if (durationMinutes < 0) {
    return createInvalidResult(input);
  }

  return {
    type: 'wallclock',
    isValid: true,
    durationMinutes,
    targetDate,
    displayDuration: formatDuration(durationMinutes),
    displayDate: formatDate(targetDate),
    inputFormat: 'date_time',
    formatTemplate: 'DD/MM HH:MM',
    originalInput: input,
  };
}

/**
 * Parse Day X format: "Day 2 08:00" or "Day 2, 08:00" or "D2 08:00"
 */
function parseDayTime(input: string, raceStartTime: Date): ParsedRaceTime | null {
  const match = input.match(/^(?:day\s*|d)(\d+)[,\s]+(\d{1,2}):(\d{2})$/i);
  if (!match) return null;

  const dayNumber = parseInt(match[1], 10);
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);

  if (
    isNaN(dayNumber) ||
    isNaN(hours) ||
    isNaN(minutes) ||
    dayNumber < 1 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return null;
  }

  // Day 1 = race start day
  const daysToAdd = dayNumber - 1;
  const startOfRaceDay = normalizeToMidnight(raceStartTime);
  let targetDate = addDays(startOfRaceDay, daysToAdd);
  targetDate = setHours(targetDate, hours);
  targetDate = setMinutes(targetDate, minutes);

  // Calculate duration from race start
  const durationMinutes = differenceInMinutes(targetDate, raceStartTime);

  // If the calculated time is before race start, it's invalid
  if (durationMinutes < 0) {
    return createInvalidResult(input);
  }

  return {
    type: 'wallclock',
    isValid: true,
    durationMinutes,
    targetDate,
    displayDuration: formatDuration(durationMinutes),
    displayDate: formatDate(targetDate),
    inputFormat: 'day_time',
    formatTemplate: 'Day 3 13:00',
    originalInput: input,
  };
}

/**
 * Parse weekday format: "Fri 14:00" or "Friday 14:00"
 */
function parseWeekdayTime(input: string, raceStartTime: Date): ParsedRaceTime | null {
  const match = input.match(/^([a-zA-Z]+)[,\s]+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const dayName = match[1].toLowerCase();
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);

  if (!(dayName in DAY_NAMES)) return null;

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes >= 60) {
    return null;
  }

  const targetDayOfWeek = DAY_NAMES[dayName];
  const startDayOfWeek = getDay(raceStartTime);

  // Calculate days until target day of week
  let daysToAdd = targetDayOfWeek - startDayOfWeek;

  // If the target day is earlier in the week or same day, check time
  if (daysToAdd < 0) {
    daysToAdd += 7;
  } else if (daysToAdd === 0) {
    // Same day of week - check if time has passed
    const targetTimeOnStartDay = setMinutes(setHours(raceStartTime, hours), minutes);
    if (isBefore(targetTimeOnStartDay, raceStartTime) || daysToAdd === 0) {
      // If target time is before or at race start, move to next week
      const testDate = setMinutes(setHours(raceStartTime, hours), minutes);
      if (!isAfter(testDate, raceStartTime)) {
        daysToAdd += 7;
      }
    }
  }

  // Build target date
  const startOfRaceDay = normalizeToMidnight(raceStartTime);
  let targetDate = addDays(startOfRaceDay, daysToAdd);
  targetDate = setHours(targetDate, hours);
  targetDate = setMinutes(targetDate, minutes);

  // Calculate duration from race start
  const durationMinutes = differenceInMinutes(targetDate, raceStartTime);

  // If somehow the target is before race start, move to next week
  if (durationMinutes < 0) {
    targetDate = addDays(targetDate, 7);
    const newDurationMinutes = differenceInMinutes(targetDate, raceStartTime);

    return {
      type: 'wallclock',
      isValid: true,
      durationMinutes: newDurationMinutes,
      targetDate,
      displayDuration: formatDuration(newDurationMinutes),
      displayDate: formatDate(targetDate),
      inputFormat: 'weekday_time',
      formatTemplate: 'Fri 14:00',
      originalInput: input,
    };
  }

  return {
    type: 'wallclock',
    isValid: true,
    durationMinutes,
    targetDate,
    displayDuration: formatDuration(durationMinutes),
    displayDate: formatDate(targetDate),
    inputFormat: 'weekday_time',
    formatTemplate: 'Fri 14:00',
    originalInput: input,
  };
}

/**
 * Parse time-only format: "14:00"
 * Assumes next occurrence after race start
 */
function parseTimeOnly(input: string, raceStartTime: Date): ParsedRaceTime | null {
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes >= 60) {
    return null;
  }

  // Start from race start day
  const startOfRaceDay = normalizeToMidnight(raceStartTime);
  let targetDate = setMinutes(setHours(startOfRaceDay, hours), minutes);

  // If target time is at or before race start, move to next day
  if (!isAfter(targetDate, raceStartTime)) {
    targetDate = addDays(targetDate, 1);
  }

  const durationMinutes = differenceInMinutes(targetDate, raceStartTime);

  return {
    type: 'wallclock',
    isValid: true,
    durationMinutes,
    targetDate,
    displayDuration: formatDuration(durationMinutes),
    displayDate: formatDate(targetDate),
    inputFormat: 'time_only',
    formatTemplate: 'HH:MM',
    originalInput: input,
  };
}

/**
 * Main parsing function - tries all parsers in sequence
 */
export function parseRaceTime(input: string, raceStartTime: Date): ParsedRaceTime {
  // Normalize input
  const trimmed = input.trim();

  if (!trimmed) {
    return createInvalidResult(input);
  }

  // Try each parser in order of specificity
  const parsers = [
    parseDateTimeFormat, // "04/10 12:00" - DD/MM HH:MM format (try early before hours:minutes)
    parseHoursMinutes, // "33:30" or "33h30m"
    parseDayTime, // "Day 2 08:00"
    parseWeekdayTime, // "Fri 14:00"
    parseHoursOnly, // "33" or "33h"
    parseTimeOnly, // "14:00" - try last since it matches HH:MM format
  ];

  // Special handling: If input looks like a short duration (just digits, possibly with 'h'),
  // prioritize hours-only parser over time-only
  const looksLikeShortDuration = /^\d{1,3}h?$/i.test(trimmed);
  if (looksLikeShortDuration) {
    const result = parseHoursOnly(trimmed, raceStartTime);
    if (result) return result;
  }

  for (const parser of parsers) {
    const result = parser(trimmed, raceStartTime);
    if (result) return result;
  }

  return createInvalidResult(input);
}

/**
 * Convert duration in minutes back to the most appropriate input format
 */
export function durationToInput(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = Math.round(durationMinutes % 60);

  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Convert a target date to elapsed duration from race start
 */
export function dateToDuration(targetDate: Date, raceStartTime: Date): number {
  return differenceInMinutes(targetDate, raceStartTime);
}
