import type { VoiceSession } from '../voice-types';

export interface VoiceSessionRepository {
  get(sessionId: string): Promise<VoiceSession | null>;
  set(sessionId: string, session: VoiceSession, ttlSeconds: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export const VOICE_SESSION_REPOSITORY = Symbol('VoiceSessionRepository');
export const VOICE_SESSION_TTL_SECONDS = 600;

export function voiceSessionKey(sessionId: string): string {
  return `voice-session:${sessionId}`;
}
