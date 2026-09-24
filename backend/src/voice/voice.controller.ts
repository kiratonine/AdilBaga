import { Body, Controller, Post } from '@nestjs/common';
import type { VoiceResponse } from '../contracts/voice';
import { VoiceContinueDto } from './voice-continue.dto';
import { VoiceStartDto } from './voice-start.dto';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('start')
  start(@Body() request: VoiceStartDto): Promise<VoiceResponse> {
    return this.voiceService.start(request);
  }

  @Post('continue')
  continue(@Body() request: VoiceContinueDto): Promise<VoiceResponse> {
    return this.voiceService.continue(request);
  }
}
