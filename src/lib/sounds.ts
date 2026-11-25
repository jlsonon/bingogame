// Sound Manager Utility for Lucky Bingo
// Handles UI sound effects, natural human neural voices, and robotic speech fallback
import { isNaturalVoice } from './voices';

export const SOUNDS = {
  BALL_DRAW: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  NEAR_BINGO: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3',
  BINGO_WIN: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  DIKIT_HIT: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  JACKPOT_WIN: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
  DRUMROLL: 'https://www.soundjay.com/misc/sounds/drum-roll-01.mp3',
  CLICK: 'https://assets.mixkit.co/active_storage/sfx/2568/2571-preview.mp3',
};

let currentVoiceAudio: HTMLAudioElement | null = null;

export function stopVoice() {
  if (currentVoiceAudio) {
    try {
      currentVoiceAudio.pause();
      currentVoiceAudio.currentTime = 0;
    } catch {
      // Ignore abort errors
    }
    currentVoiceAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
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

export function playVoiceBall(
  ball: number,
  mode: string,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
  }
): boolean {
  stopVoice();

  // 1. Natural Neural Voices (Streamed via Edge Natural Neural TTS)
  if (isNaturalVoice(mode)) {
    try {
      const url = `/api/tts?voice=${encodeURIComponent(mode)}&ball=${ball}`;
      const audio = new Audio(url);
      audio.volume = 1.0;
      currentVoiceAudio = audio;

      let started = false;
      const triggerStart = () => {
        if (!started) {
          started = true;
          callbacks?.onStart?.();
        }
      };

      audio.addEventListener('play', triggerStart, { once: true });
      audio.addEventListener('playing', triggerStart, { once: true });
      if (callbacks?.onEnd) {
        audio.addEventListener('ended', callbacks.onEnd, { once: true });
      }

      // Fallback timer: ensure visual reveal triggers even if network/audio buffers slowly
      const fallbackTimer = setTimeout(triggerStart, 350);
      audio.addEventListener('playing', () => clearTimeout(fallbackTimer), { once: true });

      audio.play().catch(e => {
        console.warn('Natural voice playback blocked:', e);
        clearTimeout(fallbackTimer);
        triggerStart();
      });
      return true;
    } catch (err) {
      console.error('Failed to play natural voice ball:', err);
      callbacks?.onStart?.();
      return false;
    }
  }

  // 2. Robotic Mode (Standard Browser Web Speech)
  return false;
}

export function previewVoice(mode: string): void {
  stopVoice();

  if (isNaturalVoice(mode)) {
    try {
      const url = `/api/tts?voice=${encodeURIComponent(mode)}&preview=true`;
      const audio = new Audio(url);
      audio.volume = 1.0;
      currentVoiceAudio = audio;
      audio.play().catch(e => console.warn('Voice preview blocked:', e));
    } catch (err) {
      console.error('Failed to preview natural voice:', err);
    }
    return;
  }

  // Robotic Preview
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance("Lucky Bingo! B... 12.");
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }
}
