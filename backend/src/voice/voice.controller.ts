import { Body, Controller, Post } from '@nestjs/common';
import type { VoiceResponse } from '../contracts/voice';
import { VoiceStartDto } from './voice-start.dto';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('start')
  start(@Body() request: VoiceStartDto): VoiceResponse {
    return this.voiceService.start(request);
  }
}
