import { Redis } from '@upstash/redis';
import type { VoiceSession } from '../voice-types';
import { voiceSessionKey, type VoiceSessionRepository } from './voice-session.repository';

export class UpstashVoiceSessionRepository implements VoiceSessionRepository {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  get(sessionId: string): Promise<VoiceSession | null> {
    return this.redis.get<VoiceSession>(voiceSessionKey(sessionId));
  }

  async set(sessionId: string, session: VoiceSession, ttlSeconds: number): Promise<void> {
    await this.redis.set(voiceSessionKey(sessionId), session, { ex: ttlSeconds });
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(voiceSessionKey(sessionId));
  }
}
