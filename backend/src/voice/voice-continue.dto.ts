import { IsNotEmpty, IsString, Matches } from 'class-validator';
import type { VoiceContinueRequest } from '../contracts/voice';

export class VoiceContinueDto implements VoiceContinueRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  text!: string;
}
