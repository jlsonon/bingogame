// Sound Manager Utility for Lucky Bingo
// Handles Web Audio synthesized SFX (100% offline) and cached Natural Neural Voices
import { resolveVoiceId } from './voices';

export const SOUNDS = {
  BALL_DRAW: 'BALL_DRAW',
  NEAR_BINGO: 'NEAR_BINGO',
  BINGO_WIN: 'BINGO_WIN',
  DIKIT_HIT: 'DIKIT_HIT',
  JACKPOT_WIN: 'JACKPOT_WIN',
  DRUMROLL: 'DRUMROLL',
  CLICK: 'CLICK',
} as const;

let audioCtx: AudioContext | null = null;
let currentVoiceAudio: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioCtx = new AudioContextCtor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  endFreq?: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + Math.min(0.015, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

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
}

export function playSound(soundId: string, volume = 0.5) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const v = Math.min(Math.max(volume, 0.05), 1) * 0.35;

    switch (soundId) {
      case SOUNDS.BALL_DRAW: {
        // Tactile mechanical ball chute pop + soft wood click
        playTone(ctx, 260, now, 0.06, v * 0.9, 'triangle', 120);
        playTone(ctx, 540, now + 0.055, 0.09, v * 0.75, 'sine', 680);
        break;
      }
      case SOUNDS.CLICK: {
        playTone(ctx, 640, now, 0.04, v * 0.5, 'triangle', 320);
        break;
      }
      case SOUNDS.NEAR_BINGO: {
        // Exciting rising two-note alert chime
        playTone(ctx, 587.33, now, 0.14, v * 0.7, 'sine');
        playTone(ctx, 880, now + 0.12, 0.24, v * 0.85, 'sine');
        break;
      }
      case SOUNDS.DIKIT_HIT: {
        // Punchy bright double ding
        playTone(ctx, 783.99, now, 0.12, v * 0.85, 'triangle');
        playTone(ctx, 1046.5, now + 0.09, 0.22, v * 0.95, 'sine');
        playTone(ctx, 1318.5, now + 0.18, 0.32, v * 0.8, 'sine');
        break;
      }
      case SOUNDS.BINGO_WIN: {
        // Celebratory major fanfare arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((n, idx) => {
          playTone(ctx, n, now + idx * 0.09, 0.32, v * 0.9, 'triangle');
        });
        playTone(ctx, 1046.5, now + 0.38, 0.55, v * 0.85, 'sine');
        break;
      }
      case SOUNDS.JACKPOT_WIN: {
        // Grand chord victory fanfare
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
        notes.forEach((n, idx) => {
          playTone(ctx, n, now + idx * 0.08, 0.45, v * 0.85, 'triangle');
        });
        break;
      }
      case SOUNDS.DRUMROLL: {
        // Subtle rhythmic suspense roll
        for (let i = 0; i < 12; i++) {
          playTone(ctx, 130 + (i % 2) * 18, now + i * 0.085, 0.055, v * (0.35 + i * 0.03), 'triangle', 75);
        }
        break;
      }
      default: {
        playTone(ctx, 520, now, 0.08, v * 0.6, 'sine');
      }
    }
  } catch (err) {
    console.warn('Sound play error:', err);
  }
}

export function playVoiceBall(
  ball: number,
  mode?: string,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
  }
): boolean {
  stopVoice();

  const voiceId = resolveVoiceId(mode);

  try {
    const url = `/api/tts?voice=${encodeURIComponent(voiceId)}&ball=${ball}`;
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

    // Fallback timer: ensure visual reveal triggers even if audio buffers slowly
    const fallbackTimer = setTimeout(triggerStart, 350);
    audio.addEventListener('playing', () => clearTimeout(fallbackTimer), { once: true });
    audio.addEventListener('error', () => {
      clearTimeout(fallbackTimer);
      triggerStart();
    }, { once: true });

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

export function previewVoice(mode?: string): void {
  stopVoice();

  const voiceId = resolveVoiceId(mode);
  try {
    const url = `/api/tts?voice=${encodeURIComponent(voiceId)}&preview=true`;
    const audio = new Audio(url);
    audio.volume = 1.0;
    currentVoiceAudio = audio;
    audio.play().catch(e => console.warn('Voice preview blocked:', e));
  } catch (err) {
    console.error('Failed to preview natural voice:', err);
  }
}
