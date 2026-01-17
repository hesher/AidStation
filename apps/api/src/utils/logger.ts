/**
 * Logger Utility
 *
 * Standardized logging helpers for consistent success/failure logging
 * across all API routes.
 */

import { FastifyInstance } from 'fastify';

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Log the start of an operation
 */
export function logOperation(
  app: FastifyInstance,
  operation: string,
  context: LogContext = {}
): void {
  app.log.info({ operation, ...context }, `▶ ${operation}`);
}

/**
 * Log a successful operation completion
 */
export function logSuccess(
  app: FastifyInstance,
  operation: string,
  context: LogContext = {},
  durationMs?: number
): void {
  const message = durationMs !== undefined
    ? `✅ ${operation} (${durationMs}ms)`
    : `✅ ${operation}`;

  app.log.info({ operation, ...context, durationMs }, message);
}

/**
 * Log a failed operation
 */
export function logFailure(
  app: FastifyInstance,
  operation: string,
  error: Error | string,
  context: LogContext = {}
): void {
  const errorMessage = error instanceof Error ? error.message : error;
  app.log.error(
    { operation, error: errorMessage, ...context },
    `❌ ${operation}: ${errorMessage}`
  );
}
