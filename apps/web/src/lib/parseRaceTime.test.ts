/**
 * Test Cases for parseRaceTime Utility
 *
 * Comprehensive test cases covering all supported input formats.
 * These tests can be used with Jest, Vitest, or any compatible test runner.
 */

import { parseRaceTime, formatDuration, durationToInput } from './parseRaceTime';

/**
 * Test race start times for various scenarios
 *
 * Using a fixed date for reproducible tests:
 * - Saturday, April 13, 2024 at 06:00 (race start)
 */
const RACE_START = new Date('2024-04-13T06:00:00');

/**
 * Helper to create expected dates
 */
function createDate(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Test case structure
 */
interface TestCase {
  description: string;
  input: string;
  raceStart: Date;
  expected: {
    isValid: boolean;
    type?: 'duration' | 'wallclock' | 'invalid';
    durationMinutes?: number | null;
    inputFormat?: string;
  };
}

/**
 * ========================================
 * TEST CASES: Hours-only format
 * ========================================
 *
 * Input: "33" or "33h" → Treat as 33 hours elapsed
 */
export const hoursOnlyTestCases: TestCase[] = [
  {
    description: 'Simple hours: "33" → 33 hours elapsed',
    input: '33',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60, // 1980 minutes
      inputFormat: 'hours',
    },
  },
  {
    description: 'Hours with h suffix: "33h" → 33 hours elapsed',
    input: '33h',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60,
      inputFormat: 'hours',
    },
  },
  {
    description: 'Hours with H suffix (uppercase): "33H" → 33 hours elapsed',
    input: '33H',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60,
      inputFormat: 'hours',
    },
  },
  {
    description: 'Single digit hours: "5" → 5 hours elapsed',
    input: '5',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 5 * 60,
      inputFormat: 'hours',
    },
  },
  {
    description: 'Zero hours: "0" → 0 hours elapsed',
    input: '0',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 0,
      inputFormat: 'hours',
    },
  },
  {
    description: 'Decimal hours: "2.5" → 2.5 hours elapsed (150 minutes)',
    input: '2.5',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 150,
      inputFormat: 'hours',
    },
  },
  {
    description: 'Large hours: "100" → 100 hours elapsed',
    input: '100',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 100 * 60,
      inputFormat: 'hours',
    },
  },
];

/**
 * ========================================
 * TEST CASES: Hours:Minutes format
 * ========================================
 *
 * Input: "33:30" → 33 hours, 30 minutes elapsed
 */
export const hoursMinutesTestCases: TestCase[] = [
  {
    description: 'Standard hours:minutes: "33:30" → 33h 30m elapsed',
    input: '33:30',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60 + 30, // 2010 minutes
      inputFormat: 'hours_minutes',
    },
  },
  {
    description: 'Hours:minutes with leading zero: "08:15" → 8h 15m elapsed',
    input: '08:15',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 8 * 60 + 15, // 495 minutes
      inputFormat: 'hours_minutes',
    },
  },
  {
    description: 'Zero minutes: "10:00" → 10h 0m elapsed',
    input: '10:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 10 * 60,
      inputFormat: 'hours_minutes',
    },
  },
  {
    description: 'Hours with h suffix: "33h30m" → 33h 30m elapsed',
    input: '33h30m',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60 + 30,
      inputFormat: 'hours_minutes',
    },
  },
  {
    description: 'Hours with space: "33h 30m" → 33h 30m elapsed',
    input: '33h 30m',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60 + 30,
      inputFormat: 'hours_minutes',
    },
  },
  {
    description: 'Large duration: "100:45" → 100h 45m elapsed',
    input: '100:45',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 100 * 60 + 45,
      inputFormat: 'hours_minutes',
    },
  },
];

/**
 * ========================================
 * TEST CASES: Day + Time format
 * ========================================
 *
 * Input: "Day 2 08:00" → Day 2 at 08:00 (Day 1 = race start day)
 */
export const dayTimeTestCases: TestCase[] = [
  {
    description: 'Day 2 morning: "Day 2 08:00" → 26 hours elapsed (from 06:00 start)',
    input: 'Day 2 08:00',
    raceStart: RACE_START, // April 13, 06:00
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 26 * 60, // April 14, 08:00 = 26 hours from start
      inputFormat: 'day_time',
    },
  },
  {
    description: 'Day 1 same day: "Day 1 10:00" → 4 hours elapsed',
    input: 'Day 1 10:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 4 * 60, // 10:00 - 06:00 = 4 hours
      inputFormat: 'day_time',
    },
  },
  {
    description: 'Day 3 afternoon: "Day 3 14:30" → 56.5 hours elapsed',
    input: 'Day 3 14:30',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 56 * 60 + 30, // April 15, 14:30
      inputFormat: 'day_time',
    },
  },
  {
    description: 'Day with comma: "Day 2, 08:00" → 26 hours elapsed',
    input: 'Day 2, 08:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 26 * 60,
      inputFormat: 'day_time',
    },
  },
  {
    description: 'Shorthand D2: "D2 08:00" → 26 hours elapsed',
    input: 'D2 08:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 26 * 60,
      inputFormat: 'day_time',
    },
  },
  {
    description: 'Day 5 for ultra races: "Day 5 12:00" → 102 hours elapsed',
    input: 'Day 5 12:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 102 * 60, // 4 days + 6 hours
      inputFormat: 'day_time',
    },
  },
];

/**
 * ========================================
 * TEST CASES: Weekday + Time format
 * ========================================
 *
 * Input: "Fri 14:00" → Next Friday at 14:00 relative to race start
 */
export const weekdayTimeTestCases: TestCase[] = [
  {
    description: 'Same day (Saturday race start): "Sat 14:00" → 8 hours elapsed',
    input: 'Sat 14:00',
    raceStart: RACE_START, // Saturday April 13, 06:00
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 8 * 60, // 14:00 - 06:00 = 8 hours
      inputFormat: 'weekday_time',
    },
  },
  {
    description: 'Next day (Sunday): "Sun 10:00" → 28 hours elapsed',
    input: 'Sun 10:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 28 * 60, // Sunday 10:00 - Saturday 06:00
      inputFormat: 'weekday_time',
    },
  },
  {
    description: 'Full weekday name: "Sunday 10:00" → 28 hours elapsed',
    input: 'Sunday 10:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 28 * 60,
      inputFormat: 'weekday_time',
    },
  },
  {
    description: 'Friday (next week): "Fri 14:00" → 152 hours elapsed',
    input: 'Fri 14:00',
    raceStart: RACE_START, // Saturday April 13
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 152 * 60, // Friday April 19, 14:00
      inputFormat: 'weekday_time',
    },
  },
  {
    description: 'Monday: "Mon 06:00" → 48 hours elapsed',
    input: 'Mon 06:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 48 * 60, // Monday April 15, 06:00
      inputFormat: 'weekday_time',
    },
  },
  {
    description: 'Weekday with comma: "Sat, 14:00" → 8 hours elapsed',
    input: 'Sat, 14:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 8 * 60,
      inputFormat: 'weekday_time',
    },
  },
];

/**
 * ========================================
 * TEST CASES: Time-only format
 * ========================================
 *
 * Input: "14:00" → Next occurrence of 14:00 after race start
 */
export const timeOnlyTestCases: TestCase[] = [
  {
    description: 'Later same day: "14:00" → 8 hours elapsed (from 06:00 start)',
    input: '14:00',
    raceStart: RACE_START, // 06:00 start
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 8 * 60, // 14:00 - 06:00
      inputFormat: 'time_only',
    },
  },
  {
    description: 'Earlier time (next day): "05:00" → 23 hours elapsed',
    input: '05:00',
    raceStart: RACE_START, // 06:00 start
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 23 * 60, // Next day 05:00
      inputFormat: 'time_only',
    },
  },
  {
    description: 'Same time (next day): "06:00" → 24 hours elapsed',
    input: '06:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 24 * 60,
      inputFormat: 'time_only',
    },
  },
  {
    description: 'Midnight: "00:00" → 18 hours elapsed',
    input: '00:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 18 * 60, // Same day midnight
      inputFormat: 'time_only',
    },
  },
  {
    description: 'Evening time: "22:30" → 16.5 hours elapsed',
    input: '22:30',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 16 * 60 + 30,
      inputFormat: 'time_only',
    },
  },
];

/**
 * ========================================
 * TEST CASES: Invalid inputs
 * ========================================
 */
export const invalidInputTestCases: TestCase[] = [
  {
    description: 'Empty string',
    input: '',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Whitespace only',
    input: '   ',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Random text',
    input: 'hello world',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Invalid time: "25:00"',
    input: '25:00',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Invalid minutes: "10:65"',
    input: '10:65',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Invalid day name',
    input: 'Funday 10:00',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Negative hours',
    input: '-5h',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
  {
    description: 'Day 0 (invalid)',
    input: 'Day 0 10:00',
    raceStart: RACE_START,
    expected: {
      isValid: false,
      type: 'invalid',
      durationMinutes: null,
    },
  },
];

/**
 * ========================================
 * TEST CASES: Edge cases
 * ========================================
 */
export const edgeCaseTestCases: TestCase[] = [
  {
    description: 'Whitespace handling: "  33h  "',
    input: '  33h  ',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 33 * 60,
      inputFormat: 'hours',
    },
  },
  {
    description: 'Mixed case: "DAY 2 08:00"',
    input: 'DAY 2 08:00',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'wallclock',
      durationMinutes: 26 * 60,
      inputFormat: 'day_time',
    },
  },
  {
    description: 'Single digit hour in time: "8:30"',
    input: '8:30',
    raceStart: RACE_START,
    expected: {
      isValid: true,
      type: 'duration',
      durationMinutes: 8 * 60 + 30,
      inputFormat: 'hours_minutes',
    },
  },
];

/**
 * ========================================
 * TEST HELPER: formatDuration
 * ========================================
 */
export const formatDurationTestCases = [
  { input: 0, expected: '0h 00m' },
  { input: 60, expected: '1h 00m' },
  { input: 90, expected: '1h 30m' },
  { input: 1980, expected: '33h 00m' },
  { input: 2010, expected: '33h 30m' },
  { input: 6000, expected: '100h 00m' },
];

/**
 * ========================================
 * TEST HELPER: durationToInput
 * ========================================
 */
export const durationToInputTestCases = [
  { input: 0, expected: '0h' },
  { input: 60, expected: '1h' },
  { input: 90, expected: '1:30' },
  { input: 1980, expected: '33h' },
  { input: 2010, expected: '33:30' },
];

/**
 * ========================================
 * ALL TEST CASES COMBINED
 * ========================================
 */
export const allTestCases = [
  ...hoursOnlyTestCases,
  ...hoursMinutesTestCases,
  ...dayTimeTestCases,
  ...weekdayTimeTestCases,
  ...timeOnlyTestCases,
  ...invalidInputTestCases,
  ...edgeCaseTestCases,
];

/**
 * Run all tests (can be used standalone or with a test runner)
 */
export function runTests(): {
  passed: number;
  failed: number;
  results: Array<{ description: string; passed: boolean; error?: string }>;
} {
  const results: Array<{ description: string; passed: boolean; error?: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of allTestCases) {
    const result = parseRaceTime(testCase.input, testCase.raceStart);

    let testPassed = true;
    let error: string | undefined;

    if (result.isValid !== testCase.expected.isValid) {
      testPassed = false;
      error = `Expected isValid=${testCase.expected.isValid}, got ${result.isValid}`;
    } else if (testCase.expected.type && result.type !== testCase.expected.type) {
      testPassed = false;
      error = `Expected type=${testCase.expected.type}, got ${result.type}`;
    } else if (
      testCase.expected.durationMinutes !== undefined &&
      result.durationMinutes !== testCase.expected.durationMinutes
    ) {
      testPassed = false;
      error = `Expected durationMinutes=${testCase.expected.durationMinutes}, got ${result.durationMinutes}`;
    } else if (
      testCase.expected.inputFormat &&
      result.inputFormat !== testCase.expected.inputFormat
    ) {
      testPassed = false;
      error = `Expected inputFormat=${testCase.expected.inputFormat}, got ${result.inputFormat}`;
    }

    if (testPassed) {
      passed++;
    } else {
      failed++;
    }

    results.push({
      description: testCase.description,
      passed: testPassed,
      error,
    });
  }

  return { passed, failed, results };
}

/**
 * Jest/Vitest test suite example (copy to a .test.ts file with test runner installed)
 *
 * describe('parseRaceTime', () => {
 *   describe('Hours-only format', () => {
 *     hoursOnlyTestCases.forEach((tc) => {
 *       it(tc.description, () => {
 *         const result = parseRaceTime(tc.input, tc.raceStart);
 *         expect(result.isValid).toBe(tc.expected.isValid);
 *         if (tc.expected.type) expect(result.type).toBe(tc.expected.type);
 *         if (tc.expected.durationMinutes !== undefined) {
 *           expect(result.durationMinutes).toBe(tc.expected.durationMinutes);
 *         }
 *       });
 *     });
 *   });
 *   // ... repeat for other test case groups
 * });
 */
