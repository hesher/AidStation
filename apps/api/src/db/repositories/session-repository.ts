/**
 * Session Repository
 *
 * Handles database operations for user sessions and tracking last viewed race.
 * For anonymous users (no auth yet), we use a session ID stored in cookies.
 */

import { eq } from 'drizzle-orm';
import { db } from '../connection';
import { userSessions, users } from '../schema';
import type { SessionData } from './types';

/**
 * Get or create an anonymous user for session tracking.
 * In a real app, this would use proper authentication.
 * For now, we create/reuse a single "anonymous" user per session ID.
 */
export async function getOrCreateSessionUser(sessionId: string): Promise<string> {
  // Use sessionId as a pseudo-email for anonymous user tracking
  const sessionEmail = `session_${sessionId}@aidstation.local`;

  // Check if user exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, sessionEmail));

  if (existingUser) {
    return existingUser.id;
  }

  // Create new user for this session
  const [newUser] = await db
    .insert(users)
    .values({
      email: sessionEmail,
      name: `Session ${sessionId.substring(0, 8)}`,
    })
    .returning();

  return newUser.id;
}

/**
 * Get session data for a user
 */
export async function getSession(
  userId: string
): Promise<(typeof userSessions.$inferSelect) | null> {
  const [session] = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.userId, userId));

  return session || null;
}

/**
 * Create or update session with last viewed race
 */
export async function upsertSession(
  userId: string,
  lastRaceId: string,
  sessionData?: SessionData
): Promise<typeof userSessions.$inferSelect> {
  // Check if session exists
  const existingSession = await getSession(userId);

  if (existingSession) {
    // Update existing session
    const [updated] = await db
      .update(userSessions)
      .set({
        lastRaceId,
        sessionData: sessionData as Record<string, unknown>,
      })
      .where(eq(userSessions.userId, userId))
      .returning();

    return updated;
  }

  // Create new session
  const [newSession] = await db
    .insert(userSessions)
    .values({
      userId,
      lastRaceId,
      sessionData: sessionData as Record<string, unknown>,
    })
    .returning();

  return newSession;
}

/**
 * Get the last viewed race ID for a user
 */
export async function getLastRaceId(userId: string): Promise<string | null> {
  const session = await getSession(userId);
  return session?.lastRaceId || null;
}

/**
 * Clear session (for logout or reset)
 */
export async function clearSession(userId: string): Promise<boolean> {
  const result = await db
    .delete(userSessions)
    .where(eq(userSessions.userId, userId))
    .returning();

  return result.length > 0;
}
