export interface NaturalVoice {
  id: string;
  edgeVoice: string;
  name: string;
  gender: 'Female' | 'Male';
  region: string;
  flag: string;
  label: string;
}

export const NATURAL_VOICES: NaturalVoice[] = [
  // United States
  { id: 'natural_jenny', edgeVoice: 'en-US-JennyNeural', name: 'Jenny', gender: 'Female', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Jenny (US Female - Warm & Clear)' },
  { id: 'natural_guy', edgeVoice: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Guy (US Male - Deep & Dynamic)' },
  { id: 'natural_aria', edgeVoice: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Aria (US Female - Confident Host)' },
  { id: 'natural_christopher', edgeVoice: 'en-US-ChristopherNeural', name: 'Christopher', gender: 'Male', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Christopher (US Male - Broadcast Host)' },
  { id: 'natural_ava', edgeVoice: 'en-US-AvaNeural', name: 'Ava', gender: 'Female', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Ava (US Female - Modern & Expressive)' },
  { id: 'natural_andrew', edgeVoice: 'en-US-AndrewNeural', name: 'Andrew', gender: 'Male', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Andrew (US Male - Warm Host)' },
  { id: 'natural_eric', edgeVoice: 'en-US-EricNeural', name: 'Eric', gender: 'Male', region: 'United States', flag: '🇺🇸', label: '🇺🇸 Eric (US Male - Friendly Caller)' },

  // United Kingdom
  { id: 'natural_sonia', edgeVoice: 'en-GB-SoniaNeural', name: 'Sonia', gender: 'Female', region: 'United Kingdom', flag: '🇬🇧', label: '🇬🇧 Sonia (UK Female - Classic British)' },
  { id: 'natural_ryan', edgeVoice: 'en-GB-RyanNeural', name: 'Ryan', gender: 'Male', region: 'United Kingdom', flag: '🇬🇧', label: '🇬🇧 Ryan (UK Male - British Host)' },
  { id: 'natural_libby', edgeVoice: 'en-GB-LibbyNeural', name: 'Libby', gender: 'Female', region: 'United Kingdom', flag: '🇬🇧', label: '🇬🇧 Libby (UK Female - Cheerful)' },

  // Australia
  { id: 'natural_natasha', edgeVoice: 'en-AU-NatashaNeural', name: 'Natasha', gender: 'Female', region: 'Australia', flag: '🇦🇺', label: '🇦🇺 Natasha (AU Female - Australian Host)' },
  { id: 'natural_william', edgeVoice: 'en-AU-WilliamMultilingualNeural', name: 'William', gender: 'Male', region: 'Australia', flag: '🇦🇺', label: '🇦🇺 William (AU Male - Australian Host)' },

  // Canada
  { id: 'natural_clara', edgeVoice: 'en-CA-ClaraNeural', name: 'Clara', gender: 'Female', region: 'Canada', flag: '🇨🇦', label: '🇨🇦 Clara (CA Female - Canadian Host)' },
  { id: 'natural_liam', edgeVoice: 'en-CA-LiamNeural', name: 'Liam', gender: 'Male', region: 'Canada', flag: '🇨🇦', label: '🇨🇦 Liam (CA Male - Canadian Host)' },

  // Philippines
  { id: 'natural_rosa', edgeVoice: 'en-PH-RosaNeural', name: 'Rosa', gender: 'Female', region: 'Philippines', flag: '🇵🇭', label: '🇵🇭 Rosa (PH Female - Philippine English)' },
  { id: 'natural_james', edgeVoice: 'en-PH-JamesNeural', name: 'James', gender: 'Male', region: 'Philippines', flag: '🇵🇭', label: '🇵🇭 James (PH Male - Philippine English)' },

  // Ireland
  { id: 'natural_emily', edgeVoice: 'en-IE-EmilyNeural', name: 'Emily', gender: 'Female', region: 'Ireland', flag: '🇮🇪', label: '🇮🇪 Emily (Irish Female - Melodic)' },
  { id: 'natural_connor', edgeVoice: 'en-IE-ConnorNeural', name: 'Connor', gender: 'Male', region: 'Ireland', flag: '🇮🇪', label: '🇮🇪 Connor (Irish Male - Friendly Host)' },

  // India
  { id: 'natural_neerja', edgeVoice: 'en-IN-NeerjaNeural', name: 'Neerja', gender: 'Female', region: 'India', flag: '🇮🇳', label: '🇮🇳 Neerja (Indian Female - Expressive)' },
  { id: 'natural_prabhat', edgeVoice: 'en-IN-PrabhatNeural', name: 'Prabhat', gender: 'Male', region: 'India', flag: '🇮🇳', label: '🇮🇳 Prabhat (Indian Male - Clear Host)' },
];

export const NATURAL_VOICE_MAP: Record<string, NaturalVoice> = Object.fromEntries(
  NATURAL_VOICES.map(v => [v.id, v])
);

export function isNaturalVoice(voiceMode: string | undefined): boolean {
  if (!voiceMode) return false;
  return voiceMode in NATURAL_VOICE_MAP;
}

export function getVoiceLabel(voiceMode: string | undefined): string {
  if (!voiceMode || voiceMode === 'robotic') return '🤖 Robotic';
  return NATURAL_VOICE_MAP[voiceMode]?.label || voiceMode;
}
