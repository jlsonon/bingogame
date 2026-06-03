// Sound Manager Utility for Lucky Bingo
// Handles UI sound effects and custom external voice calls

export const SOUNDS = {
  BALL_DRAW: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  NEAR_BINGO: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3',
  BINGO_WIN: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  DIKIT_HIT: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  JACKPOT_WIN: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  DRUMROLL: 'https://www.soundjay.com/misc/sounds/drum-roll-01.mp3',
  CLICK: 'https://assets.mixkit.co/active_storage/sfx/2568/2571-preview.mp3', // Generic click
};

// Map for external voice calls
let VOICE_BASE_URL = ''; 
const AUDIO_CACHE: Record<string, string> = {}; // text -> blobUrl

export function setVoiceBaseUrl(url: string) {
  VOICE_BASE_URL = url;
}

export function playSound(url: string, volume = 0.5) {
  try {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(e => console.warn('Audio playback blocked by browser:', e));
  } catch (err) {
    console.error('Sound play error:', err);
  }
}

export async function playElevenLabs(text: string, voiceId: string, apiKey: string) {
  if (AUDIO_CACHE[text]) {
    playSound(AUDIO_CACHE[text], 1.0);
    return;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.8 }
      }),
    });

    if (!response.ok) throw new Error('ElevenLabs API error');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    AUDIO_CACHE[text] = url;
    playSound(url, 1.0);
  } catch (err) {
    console.error('ElevenLabs TTS failed, check API key or balance:', err);
    return false;
  }
}

export function playVoiceBall(ball: number, mode: string, customUrlTemplate?: string) {
  const letter = ball <= 15 ? 'B' : ball <= 30 ? 'I' : ball <= 45 ? 'N' : ball <= 60 ? 'G' : 'O';
  const text = `${letter}... ${ball}`;
  const filename = `${letter}${ball}.mp3`;

  // Priority 1: Custom/Static Mode
  if (mode === 'custom') {
    const localUrl = `/assets/voices/${filename}`;
    const templateUrl = customUrlTemplate 
      ? customUrlTemplate.replace('{filename}', filename).replace('{number}', String(ball))
      : localUrl;
    
    playSound(templateUrl, 1.0);
    return true;
  }
  
  // Priority 2: AI Personas
  if (mode.startsWith('ai_')) {
     const scripts: Record<string, string[]> = {
        ai_sarcastic: [
           `Pay attention! It's ${letter} ${ball}. Not that most of you are close anyway.`,
           `${letter} ${ball}. Finally! Was that so hard to find?`,
           `Look who's awake! ${letter} ${ball} is called.`,
           `Oh look, another number you don't have. ${letter} ${ball}.`
        ],
        ai_vegas: [
           `Place your bets! We've got ${letter} ${ball}!`,
           `The dice are hot! Next up is ${letter} ${ball}!`,
           `Winner winner chicken dinner! It's ${letter} ${ball}!`,
           `High rollers, take note: ${letter} ${ball}!`
        ],
        ai_lounge: [
           `Relax and enjoy the vibe. The number is ${letter} ${ball}.`,
           `Smooth calls only. We have ${letter} ${ball}.`,
           `Take a sip, check your card. ${letter} ${ball}.`,
           `In the pocket. ${letter} ${ball}.`
        ]
     };
     
     const personaLines = scripts[mode] || [`${letter}... ${ball}`];
     const line = personaLines[Math.floor(Math.random() * personaLines.length)];
     
     if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(line);
        // We'll use the voice set in the component
        utterance.rate = mode === 'ai_vegas' ? 1.1 : mode === 'ai_lounge' ? 0.7 : 0.9;
        window.speechSynthesis.speak(utterance);
        return true;
     }
  }

  // Priority 3: Robotic Mode (Standard Browser)
  return false; // Tells the component to use default SpeechSynthesis
}
