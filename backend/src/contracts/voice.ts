export interface VoiceStartRequest {
  text: string;
  latitude: number;
  longitude: number;
}

export interface VoiceContinueRequest {
  sessionId: string;
  text: string;
}

export interface VoiceResultItem {
  name: string;
  price: number;
  store: string;
  address: string | null;
  distanceMeters: number | null;
  imageUrl: string | null;
}

export type VoiceResponse =
  | {
      status: 'needs_clarification';
      sessionId: string;
      question: string;
      missingFields: string[];
    }
  | {
      status: 'result';
      mode: 'single' | 'list';
      speech: string;
      items: VoiceResultItem[];
    };
