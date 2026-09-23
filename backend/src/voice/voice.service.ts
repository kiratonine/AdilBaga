import { Injectable } from '@nestjs/common';
import type { VoiceResponse, VoiceStartRequest } from '../contracts/voice';

@Injectable()
export class VoiceService {
  start(_request: VoiceStartRequest): VoiceResponse {
    return {
      status: 'result',
      mode: 'single',
      speech: 'Запрос получен. Голосовой сценарий подключен.',
      items: [],
    };
  }
}
