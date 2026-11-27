import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore, type Player } from '../store/gameStore';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getBallLetter } from '../lib/bingo';
import { Trophy, Users, PlayCircle, Monitor, Eye, Settings2 } from 'lucide-react';
import { SOUNDS, playSound, playVoiceBall } from '../lib/sounds';

// Deterministic mini-card patterns for the verification slot animation (avoids Math.random in render)
const SLOT_MOCK_CARDS: boolean[][] = [
  [true, false, true, false, false, false, true, false, true, false, true, false, true, false, true, false, false, true, false, false, true, false, false, true, false],
  [false, true, false, true, false, true, false, true, false, false, false, false, true, true, false, true, false, false, false, true, false, true, false, false, true],
  [true, true, false, false, true, false, false, true, false, false, false, true, true, false, true, false, false, false, true, false, true, false, true, false, false],
  [false, false, true, false, true, true, false, false, true, false, false, true, true, false, false, false, true, false, false, true, false, false, true, true, false],
  [true, false, false, true, false, false, true, false, false, true, true, false, true, true, false, false, false, true, false, false, true, true, false, false, true],
];

export default function Display() {
  const { code } = useParams();
  const navigate = useNavigate();

  // Atomic Selectors
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const latestBall = useGameStore(s => s.latestBall);
  const winner = useGameStore(s => s.winner);
  const claimAlert = useGameStore(s => s.claimAlert);
  const dikitAlert = useGameStore(s => s.dikitAlert);
  const emotes = useGameStore(s => s.emotes);
  const nearWinAlert = useGameStore(s => s.nearWinAlert);
  const connect = useGameStore(s => s.connect);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);

  const [lastBalls, setLastBalls] = useState<number[]>([]);
  const [maleVoice, setMaleVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [revealedBall, setRevealedBall] = useState<number | null>(() => latestBall || null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reveal Spectacle State
  const [revealStatus, setRevealStatus] = useState<'idle' | 'verifying' | 'winner'>('idle');

  useEffect(() => {
    if (claimAlert) {
      setRevealStatus('verifying');
      playSound(SOUNDS.DRUMROLL, 0.7);
    } else if (winner) {
      setRevealStatus('winner');
    } else {
      setRevealStatus('idle');
    }
  }, [claimAlert, winner]);

  // UX Spectacle State with proper timer cleanup
  const [showHypeIntro, setShowHypeIntro] = useState(false);
  const [hypeCountdown, setHypeCountdown] = useState(3);
  const [showPatternFlash, setShowPatternFlash] = useState(false);
  const hypeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hypeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confettiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHypeTimers = () => {
    if (hypeIntervalRef.current) clearInterval(hypeIntervalRef.current);
    if (hypeTimeoutRef.current) clearTimeout(hypeTimeoutRef.current);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    hypeIntervalRef.current = null;
    hypeTimeoutRef.current = null;
    flashTimeoutRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearHypeTimers();
      if (confettiIntervalRef.current) clearInterval(confettiIntervalRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (room?.status === 'playing' && (prevStatus.current === 'waiting' || prevStatus.current === 'next_round')) {
      clearHypeTimers();
      setShowHypeIntro(true);
      setHypeCountdown(3);
      hypeIntervalRef.current = setInterval(() => {
        setHypeCountdown(prev => {
          if (prev <= 1) {
            if (hypeIntervalRef.current) clearInterval(hypeIntervalRef.current);
            hypeTimeoutRef.current = setTimeout(() => {
              setShowHypeIntro(false);
              setShowPatternFlash(true);
              flashTimeoutRef.current = setTimeout(() => setShowPatternFlash(false), 3000);
            }, 800);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    prevStatus.current = room?.status || null;
  }, [room?.status]);

  useEffect(() => {
    if (!socket || !code) return;
    if (!room) {
      rejoinRoom(code, 'display').then(success => {
        if (!success) navigate('/');
      });
    }
  }, [socket, code, room, rejoinRoom, navigate]);

  useEffect(() => {
    connect();
    const loadVoices = () => {
      if (!('speechSynthesis' in window)) return;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Male'));
      setMaleVoice(preferred || voices[0] || null);
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [connect]);

  // Voice & Ball Reveal Synchronization
  useEffect(() => {
    if (!latestBall) {
      setRevealedBall(null);
      return;
    }

    if (!audioEnabled) {
      setRevealedBall(latestBall);
      return;
    }

    playSound(SOUNDS.BALL_DRAW, 0.4);

    let hasRevealed = false;
    const triggerReveal = () => {
      if (!hasRevealed) {
        hasRevealed = true;
        setRevealedBall(latestBall);
      }
    };

    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(triggerReveal, 300);

    const voiceTriggered = playVoiceBall(latestBall, room?.voiceMode || 'robotic', {
      onStart: () => {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        triggerReveal();
      }
    });

    if (!voiceTriggered && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const letter = getBallLetter(latestBall);
      const utterance = new SpeechSynthesisUtterance(`${letter}... ${latestBall}`);
      if (maleVoice) utterance.voice = maleVoice;
      utterance.rate = 0.85;

      utterance.onstart = () => {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        triggerReveal();
      };
      utterance.onerror = () => {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        triggerReveal();
      };

      window.speechSynthesis.speak(utterance);
    }

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [latestBall, maleVoice, audioEnabled, room?.voiceMode]);

  const enableAudio = () => {
    setAudioEnabled(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  };

  useEffect(() => {
    if (room?.calledNumbers) {
      setLastBalls(room.calledNumbers.slice(-6, -1).reverse());
    }
  }, [room?.calledNumbers]);

  useEffect(() => {
    if (winner) {
      if (room?.mode === 'Blackout') {
        playSound(SOUNDS.JACKPOT_WIN, 1.0);
      } else {
        playSound(SOUNDS.BINGO_WIN, 0.8);
      }

      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      if (confettiIntervalRef.current) clearInterval(confettiIntervalRef.current);
      confettiIntervalRef.current = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          if (confettiIntervalRef.current) clearInterval(confettiIntervalRef.current);
          confettiIntervalRef.current = null;
          return;
        }
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    }
    return () => {
      if (confettiIntervalRef.current) {
        clearInterval(confettiIntervalRef.current);
        confettiIntervalRef.current = null;
      }
    };
  }, [winner, room?.mode]);

  if (!room) return null;

  const joinUrl = `${window.location.origin}/?code=${room.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&bgcolor=FAF7F2&color=3D3A35`;
  const connectedPlayers = Object.values(room.players).filter((p: Player) => p.connected);

  if (room.status === 'waiting') {
    return (
      <div className="h-screen max-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col overflow-hidden relative p-5 sm:p-6 lg:p-8 paper-texture">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 lg:gap-6 relative z-10 max-w-6xl w-full mx-auto">
          {/* Top Brand Header */}
          <div className="flex items-center gap-4 lg:gap-6 shrink-0">
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [-3, 3, -3] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 lg:w-20 lg:h-20 bg-[#EA580C] rounded-[22px] lg:rounded-[28px] flex items-center justify-center shadow-xl border-4 border-white shrink-0"
            >
              <span className="text-4xl lg:text-5xl font-display text-white italic select-none">L</span>
            </motion.div>
            <div className="text-left">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display uppercase tracking-tighter italic leading-none">Lucky Bingo</h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-1 w-10 bg-[#E8E2D9] rounded-full" />
                <p className="text-xs sm:text-sm lg:text-base font-black text-[#A19B91] uppercase tracking-[0.4em]">The Hall is Open</p>
                <div className="h-1 w-10 bg-[#E8E2D9] rounded-full" />
              </div>
            </div>
          </div>

          {/* Main 2-Column Lobby Area (Fits cleanly within 720p, 900p, 1080p) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 w-full flex-1 min-h-0 max-h-[600px]">
            <div className="bg-white rounded-[40px] lg:rounded-[48px] p-6 lg:p-8 border-4 border-[#E8E2D9] shadow-xl flex flex-col items-center justify-center text-center min-h-0">
              <h3 className="text-lg lg:text-xl font-black uppercase tracking-tight mb-4 shrink-0">Scan to Join</h3>
              <div className="bg-[#FAF7F2] p-4 lg:p-5 rounded-[32px] border-4 border-white shadow-inner mb-4 shrink-0">
                <img src={qrUrl} alt="Join QR" className="w-44 h-44 lg:w-56 lg:h-56 xl:w-64 xl:h-64 mix-blend-multiply" />
              </div>
              <div className="space-y-1 shrink-0">
                <p className="text-xs lg:text-sm font-bold text-[#A19B91] uppercase tracking-widest">Or enter code</p>
                <div className="text-5xl lg:text-6xl font-display text-[#EA580C] tracking-[0.2em] tabular-nums leading-none">{room.id}</div>
              </div>
            </div>

            <div className="bg-[#3D3A35] rounded-[40px] lg:rounded-[48px] p-6 lg:p-8 border-8 border-white shadow-xl flex flex-col text-white min-h-0">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex flex-col">
                  <span className="text-5xl lg:text-6xl font-display leading-none tabular-nums text-[#FACC15]">{connectedPlayers.length}</span>
                  <span className="text-xs font-black uppercase tracking-[0.3em] opacity-60 mt-1">Players In Hall</span>
                </div>
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center animate-pulse">
                  <Users size={28} className="text-[#FACC15]" />
                </div>
              </div>

              <div className="flex-1 min-h-0 space-y-2.5 overflow-hidden relative">
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#3D3A35] to-transparent z-10 pointer-events-none" />
                <h4 className="text-xs font-black uppercase tracking-[0.3em] mb-3 opacity-40">Recent Arrivals</h4>
                {connectedPlayers.slice(-6).reverse().map((p: Player, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ backgroundColor: p.avatarColor }}>
                      {p.nickname.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-base lg:text-lg font-bold uppercase tracking-tight truncate">{p.nickname} has entered!</span>
                  </motion.div>
                ))}
                {connectedPlayers.length === 0 && (
                  <div className="py-16 text-center text-white/25 font-bold italic uppercase tracking-widest">Waiting for players...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!audioEnabled && (
          <div className="fixed inset-0 z-[100] bg-[#3D3A35]/60 backdrop-blur-md flex items-center justify-center p-6">
            <button onClick={enableAudio} className="bg-[#EA580C] text-white px-10 py-7 rounded-[36px] font-display text-3xl lg:text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex flex-col items-center gap-3 border-4 border-white tracking-widest uppercase italic">
              <Monitor size={56} />ENABLE ANNOUNCER
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col overflow-hidden relative">
      <AnimatePresence>
        {emotes.map((emote) => {
          const randomX = (parseInt(emote.id.replace(/[^0-9]/g, '') || '0') % 80) + 10;
          const duration = (parseInt(emote.id.replace(/[^0-9]/g, '') || '0') % 3) + 3;

          return (
            <motion.div
              key={emote.id}
              initial={{ y: '100vh', x: `${randomX}vw`, opacity: 0, scale: 0.5 }}
              animate={{ y: '-20vh', opacity: [0, 1, 1, 0], scale: 1.5 }}
              transition={{ duration, ease: "easeOut" }}
              className="fixed z-[100] text-6xl pointer-events-none drop-shadow-xl"
            >
              {emote.emoji}
            </motion.div>
          );
        })}
      </AnimatePresence>

      <AnimatePresence>
        {showHypeIntro && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-[#EA580C] flex flex-col items-center justify-center text-white">
            <motion.div key={hypeCountdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[26vw] leading-none drop-shadow-[0_20px_50px_rgba(0,0,0,0.3)]">{hypeCountdown > 0 ? hypeCountdown : "GO!"}</motion.div>
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="font-black text-3xl lg:text-4xl uppercase tracking-[0.5em] mt-6">Get Ready...</motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPatternFlash && (
          <motion.div initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-[105] bg-[#3D3A35]/95 backdrop-blur-xl flex flex-col items-center justify-center text-white p-8 text-center">
            <div className="mb-6 shrink-0">
              <div className="text-base lg:text-xl font-black uppercase tracking-[0.4em] text-[#EA580C] mb-2">
                {room.mode === 'Bingo' ? `${room.patterns.length} Active Winning Patterns` : 'Target Mode'}
              </div>
              <h2 className="font-display text-6xl lg:text-8xl uppercase tracking-tighter italic">
                {room.mode === 'Bingo' ? 'Standard Bingo' : room.mode}
              </h2>
            </div>
            {!room.hidePattern && room.mode === 'Bingo' && (
              <div className="bg-white p-6 lg:p-8 rounded-[40px] shadow-[0_0_80px_rgba(250,204,21,0.2)] max-w-5xl w-full max-h-[56vh] overflow-y-auto custom-scrollbar">
                <PatternVisualizer patterns={room.patterns} size="lg" />
              </div>
            )}
            <div className="mt-8 text-xl font-bold opacity-60 uppercase tracking-widest animate-pulse shrink-0">Round Starting Now</div>
          </motion.div>
        )}
      </AnimatePresence>

      {!audioEnabled && (
        <div className="fixed inset-0 z-[100] bg-[#3D3A35]/60 backdrop-blur-md flex items-center justify-center p-6">
          <button onClick={enableAudio} className="bg-[#EA580C] text-white px-10 py-7 rounded-[36px] font-display text-3xl lg:text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex flex-col items-center gap-3 border-4 border-white tracking-widest uppercase italic">
            <Monitor size={56} />ENABLE ANNOUNCER
          </button>
        </div>
      )}

      <header className="h-16 lg:h-20 bg-white border-b-4 border-[#E8E2D9] px-6 lg:px-10 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 lg:w-12 lg:h-12 bg-[#EA580C] rounded-2xl flex items-center justify-center shadow-lg rotate-[-5deg]"><span className="text-2xl lg:text-3xl font-display text-white italic">L</span></div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-display uppercase tracking-tighter leading-none">Lucky Bingo</h1>
            <p className="text-[#A19B91] font-black text-[10px] uppercase tracking-[0.4em] mt-0.5">Live Venue Display</p>
          </div>
        </div>
        <div className="flex items-center gap-6 lg:gap-10">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest">Room Code</span>
            <span className="text-4xl lg:text-5xl font-display tracking-tighter text-[#3D3A35] leading-none tabular-nums">{room.id}</span>
          </div>
          <div className="h-10 w-1 bg-[#E8E2D9] rounded-full" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest">Players</span>
            <div className="flex items-center gap-2">
              <Users className="text-[#0D9488]" size={20} />
              <span className="text-3xl lg:text-4xl font-display text-[#3D3A35] leading-none tabular-nums">{connectedPlayers.length}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-6 min-h-0 relative overflow-hidden">
        {room.dikitFight && room.dikitFight.status === 'active' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-[#0D9488] text-white px-6 py-2.5 rounded-full shadow-2xl border-4 border-white flex items-center gap-3 animate-pulse max-w-[90vw]">
            <span className="text-xl shrink-0">⚔️</span>
            <span className="font-black text-sm lg:text-lg uppercase tracking-wider truncate">
              {room.dikitFight.roundBingoPending
                ? `BINGO WON! DIKIT FIGHT IN PROGRESS (${room.dikitFight.contenders.map(c => c.playerName).join(' vs ')})`
                : `DIKIT FIGHT IN PROGRESS: ${room.dikitFight.contenders.map(c => c.playerName).join(' vs ')}`}
            </span>
          </div>
        )}

        <AnimatePresence>
          {nearWinAlert && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-4 z-20 pointer-events-none rounded-[44px] shadow-[inset_0_0_90px_rgba(234,88,12,0.55)] border-8 border-[#EA580C]/50 flex items-center justify-center"
            >
              <motion.div
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="absolute inset-0 bg-[#EA580C]/10 rounded-[40px]"
              />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="bg-[#EA580C] text-white px-10 py-3 rounded-full font-black text-2xl lg:text-4xl uppercase tracking-[0.2em] animate-bounce shadow-2xl border-4 border-white italic">
                  HIGH ALERT: 1 AWAY!
                </div>
                <div className="bg-white/95 backdrop-blur-md px-8 py-2.5 rounded-2xl border-4 border-[#EA580C] shadow-xl">
                  <span className="text-3xl lg:text-4xl font-black text-[#3D3A35] uppercase tracking-tighter">{nearWinAlert.playerName}</span>
                  <span className="text-base lg:text-xl font-bold text-[#EA580C] ml-3 uppercase tracking-widest">on {nearWinAlert.patternName}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left / Main Stage */}
        <div className="flex flex-col gap-4 lg:gap-5 min-h-0 relative z-10">
          <div className="grid grid-cols-[240px_1fr] xl:grid-cols-[300px_1fr] gap-4 lg:gap-5 shrink-0">
            <div className="h-[230px] xl:h-[270px] bg-white rounded-[36px] border-4 border-[#E8E2D9] shadow-lg flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2]" />
              <AnimatePresence mode="popLayout">
                {revealedBall ? (
                  <motion.div
                    key={revealedBall}
                    initial={{ scale: 0.5, y: 80, opacity: 0, rotate: -20 }}
                    animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
                    exit={{ scale: 1.15, opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="relative z-10 flex flex-col items-center"
                  >
                    <div className="w-44 h-44 xl:w-52 xl:h-52 rounded-full bg-[#FACC15] border-[10px] border-white outline outline-[10px] outline-[#FACC15] shadow-2xl flex flex-col items-center justify-center text-[#854D0E] relative">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/40 pointer-events-none" />
                      <div className="absolute top-6 left-9 w-12 h-6 bg-white/30 rounded-[100%] blur-sm -rotate-45 pointer-events-none" />
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-3xl xl:text-4xl font-display leading-none mb-1 z-10">{getBallLetter(revealedBall)}</motion.span>
                      <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-8xl xl:text-[120px] font-display leading-none tracking-tighter z-10">{revealedBall}</motion.span>
                    </div>
                  </motion.div>
                ) : (
                  <div className="relative z-10 flex flex-col items-center gap-3 text-[#C5BFB6]">
                    <PlayCircle size={64} strokeWidth={1.5} />
                    <span className="text-lg font-black uppercase tracking-widest">Waiting to start</span>
                  </div>
                )}
              </AnimatePresence>
            </div>

            <div className="bg-white rounded-[36px] border-4 border-[#E8E2D9] p-5 xl:p-7 shadow-lg flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAF7F2] rounded-bl-[80px] -mr-6 -mt-6 border-b-4 border-l-4 border-[#E8E2D9]" />
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em] mb-3">Game Context</h3>
                  <div className="flex flex-wrap items-end gap-6">
                    <div>
                      <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-[0.2em] block mb-0.5">Current Round</label>
                      <div className="text-3xl xl:text-4xl font-display text-[#3D3A35] uppercase italic leading-none">{room.roundName}</div>
                    </div>
                    {room.prizeText && (
                      <div>
                        <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-[0.2em] block mb-0.5">Playing For</label>
                        <div className="text-2xl xl:text-3xl font-display text-[#EA580C] uppercase tracking-tighter leading-none">{room.prizeText}</div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.2em] mb-2.5">Previous Numbers</h3>
                  <div className="flex gap-2.5 xl:gap-3 h-14 xl:h-16">
                    <AnimatePresence initial={false} mode="popLayout">
                      {lastBalls.map((n, i) => (
                        <motion.div
                          key={`${n}-${room.calledNumbers.length - i}`}
                          initial={{ opacity: 0, x: 40, scale: 0.8 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -40, scale: 0.5 }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          className="w-14 h-14 xl:w-16 xl:h-16 rounded-2xl bg-[#FAF7F2] border-2 border-[#E8E2D9] shadow-sm flex flex-col items-center justify-center relative overflow-hidden"
                        >
                          <span className="text-[9px] font-black text-[#A19B91] leading-none">{getBallLetter(n)}</span>
                          <span className="text-2xl xl:text-3xl font-display text-[#3D3A35] leading-none">{n}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {lastBalls.length === 0 && (
                      <div className="h-full flex items-center text-[#C5BFB6] font-bold italic text-sm">No history yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5-Row Aligned Master Number Board */}
          <div className="bg-white rounded-[36px] p-4 lg:p-6 border-4 border-[#E8E2D9] shadow-lg flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Master Number Board</span>
              <span className="text-xs font-black text-[#EA580C] bg-[#EA580C]/10 px-3 py-0.5 rounded-full tabular-nums">{room.calledNumbers.length} / 75</span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-1.5 xl:gap-2">
              {(['B', 'I', 'N', 'G', 'O'] as const).map((letter, rowIdx) => (
                <div key={letter} className="grid grid-cols-[40px_1fr] xl:grid-cols-[52px_1fr] items-center gap-3 flex-1 min-h-0">
                  <div className="text-3xl lg:text-4xl xl:text-5xl font-display text-[#EA580C] text-center drop-shadow-sm leading-none">{letter}</div>
                  <div className="grid grid-cols-15 gap-1.5 xl:gap-2 h-full items-center">
                    {Array.from({ length: 15 }, (_, colIdx) => rowIdx * 15 + colIdx + 1).map(num => {
                      const isCalled = room.calledNumbers.includes(num);
                      const isLatestNum = revealedBall === num;
                      return (
                        <div
                          key={num}
                          className={`aspect-square max-h-full w-full flex items-center justify-center text-base lg:text-xl xl:text-2xl font-display rounded-lg xl:rounded-xl border-2 transition-all duration-300 relative overflow-hidden ${
                            isLatestNum
                              ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg ring-2 ring-[#FACC15] scale-105 z-10'
                              : isCalled
                                ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-md'
                                : 'bg-[#FAF7F2] text-[#C5BFB6] border-[#E8E2D9]'
                          }`}
                        >
                          {isCalled && (
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                          )}
                          <span className="relative z-10">{num}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar: QR + Active Patterns */}
        <div className="flex flex-col gap-4 lg:gap-5 min-h-0">
          <div className="bg-white rounded-[36px] p-5 border-4 border-[#E8E2D9] shadow-lg text-center flex flex-col items-center shrink-0">
            <h3 className="text-sm font-black text-[#3D3A35] uppercase tracking-widest mb-3">Scan to Play</h3>
            <div className="bg-[#FAF7F2] p-3 rounded-[24px] border-2 border-[#E8E2D9] mb-3 shadow-inner">
              <img src={qrUrl} alt="Join QR Code" className="w-36 h-36 xl:w-44 xl:h-44 mix-blend-multiply" />
            </div>
            <p className="text-[#A19B91] font-bold text-[10px] uppercase tracking-widest mb-1">Or enter code on mobile</p>
            <div className="text-3xl xl:text-4xl font-display text-[#EA580C] tracking-[0.2em] leading-none">{room.id}</div>
          </div>

          <div className="bg-white rounded-[36px] p-5 border-4 border-[#E8E2D9] shadow-lg flex-1 min-h-0 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FACC15] to-transparent opacity-50" />
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Target Patterns</h3>
              {!room.hidePattern && room.mode === 'Bingo' && (
                <span className="text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 px-2.5 py-0.5 rounded-full uppercase">
                  {room.patterns.length} ON
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col items-center justify-start py-1 px-1">
              {!room.hidePattern ? (
                room.mode === 'Bingo' ? (
                  <PatternVisualizer patterns={room.patterns} size="sm" />
                ) : (
                  <div className="my-auto text-center">
                    <div className="text-3xl font-display text-[#EA580C] uppercase italic">{room.mode}</div>
                    <p className="text-[10px] font-bold text-[#A19B91] uppercase tracking-widest mt-1">
                      {room.mode === 'Blackout' ? 'Mark all 25 squares' : 'Hit any 2 adjacent numbers'}
                    </p>
                  </div>
                )
              ) : (
                <div className="my-auto text-[#C5BFB6] flex flex-col items-center gap-3">
                  <Eye size={48} className="opacity-30" />
                  <span className="text-xs font-black uppercase tracking-[0.4em] text-center">Pattern Mystery</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t-2 border-[#FAF7F2] flex items-center justify-between shrink-0">
              <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest">Game Mode</span>
              <span className="text-lg font-display text-[#EA580C] uppercase italic">{room.mode === 'Bingo' ? 'Standard' : room.mode}</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="h-11 lg:h-12 bg-white border-t-4 border-[#E8E2D9] px-10 flex items-center justify-center relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#EA580C]/5 to-transparent opacity-50" />
        <motion.div animate={{ x: [400, -400] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="flex items-center gap-4 text-[#A19B91] font-black text-xs uppercase tracking-[0.4em] whitespace-nowrap">
          <span>Powered by Lucky Bingo</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
          <span>Community Event Night</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
          <span>Good Luck to All Players!</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
          <span>Check Your Cards!</span>
        </motion.div>
      </footer>

      <AnimatePresence>
        {dikitAlert && (
          <motion.div initial={{ y: -200, opacity: 0 }} animate={{ y: 16, opacity: 1 }} exit={{ y: -200, opacity: 0 }} className="fixed top-20 left-1/2 -translate-x-1/2 z-[120] bg-[#0D9488] text-white p-6 rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-8 border-white flex flex-col items-center gap-5 w-[calc(100vw-3rem)] max-w-2xl">
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.4em] opacity-80 mb-1">
                {dikitAlert.length > 1 ? 'MULTIPLE DIKIT WINS!' : 'Dikit Sidebet Hit!'}
              </div>
              <div className="text-4xl lg:text-5xl font-display italic tracking-tighter">{dikitAlert.map((w: any) => w.playerName).join(' & ')}</div>
              <div className="text-xs font-black uppercase tracking-[0.3em] opacity-75 mt-1 italic">Sidebet Winner · Game Continues</div>
            </div>
            <div className="flex gap-5 overflow-x-auto w-full pb-2 px-2 scrollbar-hide justify-center">
              {dikitAlert.map((alert: any, aIdx: number) => (
                <div key={alert.id || aIdx} className="bg-white/10 p-4 rounded-[24px] border-2 border-white/20 shrink-0">
                  <div className="text-center text-xs font-black mb-2 uppercase tracking-widest">
                    {alert.playerName} · Card {(alert.cardIndex ?? 0) + 1}
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {['B', 'I', 'N', 'G', 'O'].map(l => (
                      <div key={l} className="text-center font-black text-[10px] text-white/75">{l}</div>
                    ))}
                    {alert.card.map((row: number[], rIdx: number) =>
                      row.map((num: number, cIdx: number) => {
                        const called = num === 0 || room.calledNumbers.includes(num);
                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            className={`w-9 h-9 flex items-center justify-center font-display text-xs rounded-lg border-2 ${
                              num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md' : 'bg-[#0D9488]/20 border-white/20 text-white/40'
                            }`}
                          >
                            {num === 0 ? 'FR' : num}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {revealStatus !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#3D3A35]/95 backdrop-blur-3xl flex justify-center items-center z-[130] p-6 lg:p-10 overflow-hidden"
          >
            {/* Background Spectacle */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div
                animate={{ rotate: [0, 360], scale: [1, 1.2, 1] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(250,204,21,0.1)_0%,transparent_70%)]"
              />
              {revealStatus === 'verifying' && (
                <motion.div
                  animate={{ y: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 bg-gradient-to-b from-transparent via-[#EA580C]/20 to-transparent h-1/2 w-full blur-3xl"
                />
              )}
            </div>

            <AnimatePresence mode="wait">
              {revealStatus === 'verifying' && claimAlert && (
                <motion.div
                  key="verifying"
                  initial={{ scale: 0.8, opacity: 0, y: 50 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 1.2, opacity: 0 }}
                  className="relative z-10 flex flex-col items-center text-center w-full"
                >
                  <div className="relative mb-8">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="w-36 h-36 bg-[#EA580C] rounded-full flex items-center justify-center shadow-[0_0_80px_rgba(234,88,12,0.6)] border-8 border-white"
                    >
                      <Settings2 size={64} className="text-white animate-spin" style={{ animationDuration: '3s' }} />
                    </motion.div>
                    <div className="absolute -inset-6 border-4 border-dashed border-[#EA580C]/40 rounded-full animate-spin-slow" />
                  </div>

                  <h2 className="text-6xl lg:text-8xl font-black text-white uppercase italic tracking-tighter mb-4 drop-shadow-2xl">
                    Bingo Claimed!
                  </h2>

                  <div className="flex items-center gap-4 bg-white/10 px-8 py-3 rounded-full backdrop-blur-md border border-white/20 mb-8">
                    <div className="w-11 h-11 rounded-full bg-[#EA580C] flex items-center justify-center text-white font-black">
                      {claimAlert.playerName.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-3xl font-bold text-white uppercase tracking-widest">{claimAlert.playerName}</span>
                  </div>

                  {/* Deterministic Slot Machine Verification Effect */}
                  <div className="h-52 overflow-hidden relative w-full max-w-md mb-8 bg-black/20 rounded-[36px] border-4 border-white/10 backdrop-blur-sm">
                    <motion.div
                      animate={{ y: ['0%', '-80%'] }}
                      transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                      className="flex flex-col items-center gap-6 py-4"
                    >
                      {SLOT_MOCK_CARDS.map((cells, cardIdx) => (
                        <div key={cardIdx} className="bg-white/5 p-3 rounded-2xl border border-white/10 opacity-50 grayscale scale-75">
                          <div className="grid grid-cols-5 gap-1">
                            {cells.map((lit, j) => (
                              <div key={j} className={`w-5 h-5 rounded-md ${lit ? 'bg-[#FACC15]' : 'bg-white/20'}`} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-b from-[#3D3A35] via-transparent to-[#3D3A35] pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-20 border-y-4 border-[#FACC15]/40 bg-[#FACC15]/5 backdrop-blur-sm" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[#FACC15] text-xl font-black uppercase tracking-[0.5em] animate-pulse">
                      Analyzing Card Data...
                    </p>
                    <div className="w-80 h-3 bg-white/10 rounded-full overflow-hidden border border-white/20 mx-auto">
                      <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1/2 h-full bg-gradient-to-r from-transparent via-[#FACC15] to-transparent"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {revealStatus === 'winner' && winner && (
                <motion.div
                  key="winner"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative z-10 w-full max-w-6xl max-h-[92vh] flex flex-col items-center"
                >
                  <div className="flex items-center gap-5 mb-4 shrink-0">
                    <motion.div
                      initial={{ y: -40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.15, type: "spring" }}
                      className="w-20 h-20 lg:w-24 lg:h-24 bg-gradient-to-br from-[#FACC15] to-[#EA580C] rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(250,204,21,0.5)] border-4 border-white relative shrink-0"
                    >
                      <Trophy size={48} className="text-white" />
                    </motion.div>
                    <h2 className="text-6xl lg:text-8xl font-display text-white leading-none uppercase italic tracking-tighter drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                      {winner.length > 1 ? `${winner.length} WINNERS!` : 'BINGO!'}
                    </h2>
                  </div>

                  <div className="flex flex-wrap justify-center gap-4 mb-6 shrink-0">
                    {winner.map((w: any, idx: number) => {
                      const isFirstWinner = room.stats.winners.length === 1;
                      const winsCount = room.stats.winners.filter(sw => sw.name === w.playerName).length;

                      return (
                        <motion.div
                          key={w.id || idx}
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.25 + (idx * 0.08) }}
                          className="bg-white/10 backdrop-blur-xl px-6 py-3 rounded-[28px] border-2 border-white/20 shadow-xl flex items-center gap-4"
                        >
                          <div className="w-11 h-11 rounded-full bg-[#EA580C] flex items-center justify-center text-white text-lg font-black shadow-lg shrink-0">
                            {w.playerName.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] font-black text-[#FACC15] uppercase tracking-widest flex items-center gap-2">
                              Champion
                              {isFirstWinner && <span className="bg-[#0D9488] text-white px-1.5 py-0.5 rounded-md text-[8px] tracking-normal">Early Bird</span>}
                              {winsCount > 1 && <span className="bg-[#EA580C] text-white px-1.5 py-0.5 rounded-md text-[8px] tracking-normal">{winsCount} Wins</span>}
                            </div>
                            <div className="text-2xl lg:text-3xl font-display text-white uppercase italic tracking-tighter leading-none">{w.playerName}</div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Unclipped Winning Bingo Cards */}
                  <div className="flex flex-wrap gap-6 justify-center w-full px-4 py-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                    {winner.map((w: any, wIdx: number) => (
                      <motion.div
                        key={w.id || wIdx}
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.35 + (wIdx * 0.12) }}
                        className="bg-white p-5 lg:p-6 rounded-[36px] border-[8px] border-[#FACC15] shadow-[0_20px_50px_rgba(0,0,0,0.4)] relative w-[270px] lg:w-[300px]"
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-lg font-display text-[#3D3A35] uppercase italic tracking-wider truncate">{w.playerName}</span>
                          <span className="bg-[#EA580C] text-white px-2.5 py-0.5 rounded-full font-black uppercase text-[10px] shrink-0">
                            Card {(w.cardIndex ?? 0) + 1}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {['B', 'I', 'N', 'G', 'O'].map(l => (
                            <div key={l} className="text-center font-black text-xs text-[#EA580C]">{l}</div>
                          ))}
                          {w.card.map((row: number[], rIdx: number) =>
                            row.map((num: number, cIdx: number) => {
                              const called = num === 0 || room.calledNumbers.includes(num);
                              return (
                                <div
                                  key={`${rIdx}-${cIdx}`}
                                  className={`aspect-square flex items-center justify-center font-display text-base lg:text-lg rounded-xl border-2 transition-all ${
                                    num === 0
                                      ? 'bg-[#3D3A35] text-white border-[#3D3A35]'
                                      : called
                                        ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md'
                                        : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#A19B91]'
                                  }`}
                                >
                                  {num === 0 ? 'FR' : num}
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div className="mt-4 pt-3 border-t-2 border-[#FAF7F2] flex items-center justify-between">
                          <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">Pattern</span>
                          <span className="text-lg font-display text-[#EA580C] uppercase italic tracking-tight">{w.pattern || 'Bingo'}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-white/50 font-black uppercase tracking-[0.5em] text-xs mt-4 shrink-0"
                  >
                    Awaiting Host for Next Round
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
