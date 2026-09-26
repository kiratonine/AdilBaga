import type { VoiceSession } from '../voice-types';
import { voiceSessionKey, type VoiceSessionRepository } from './voice-session.repository';

export class MemoryVoiceSessionRepository implements VoiceSessionRepository {
  private readonly entries = new Map<string, { session: VoiceSession; expiresAt: number }>();

  async get(sessionId: string): Promise<VoiceSession | null> {
    const key = voiceSessionKey(sessionId);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return structuredClone(entry.session);
  }

  async set(sessionId: string, session: VoiceSession, ttlSeconds: number): Promise<void> {
    this.entries.set(voiceSessionKey(sessionId), {
      session: structuredClone(session),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.entries.delete(voiceSessionKey(sessionId));
  }
}
