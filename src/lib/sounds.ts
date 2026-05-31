// Sound Manager Utility for Lucky Bingo
// Handles UI sound effects and custom external voice calls

export const SOUNDS = {
  BALL_DRAW: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  NEAR_BINGO: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3',
  BINGO_WIN: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  DIKIT_HIT: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  JACKPOT_WIN: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  CLICK: 'https://assets.mixkit.co/active_storage/sfx/2568/2571-preview.mp3', // Generic click
};

// Map for external voice calls
// You can use a URL template like: "https://your-server.com/voices/{number}.mp3"
let VOICE_BASE_URL = ''; 

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

export function playVoiceBall(ball: number) {
  if (VOICE_BASE_URL) {
    // Logic for custom external MP3s: "https://site.com/voices/B12.mp3"
    // We assume the filenames follow a standard format
    const letter = ball <= 15 ? 'B' : ball <= 30 ? 'I' : ball <= 45 ? 'N' : ball <= 60 ? 'G' : 'O';
    const filename = `${letter}${ball}.mp3`;
    const fullUrl = VOICE_BASE_URL.replace('{filename}', filename).replace('{number}', String(ball));
    playSound(fullUrl, 1.0);
    return true; // Voice triggered from external
  }
  return false; // Fallback to SpeechSynthesis
}
