import { IsNotEmpty, IsNumber, IsString, Matches, Max, Min } from 'class-validator';
import type { VoiceStartRequest } from '../contracts/voice';

export class VoiceStartDto implements VoiceStartRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/u)
  text!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}
