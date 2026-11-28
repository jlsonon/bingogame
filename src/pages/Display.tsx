import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore, type Player } from '../store/gameStore';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { QrCode } from '../components/QrCode';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getBallLetter, calculateCardsCost, calculateTotalCollected, formatPeso, hasCardPricing } from '../lib/bingo';
import { Trophy, Users, PlayCircle, Monitor, Eye, Coins, Volume2, VolumeX, Loader, Swords, ArrowLeft, LayoutGrid, Wifi } from 'lucide-react';
import { SOUNDS, playSound, playVoiceBall, stopVoice } from '../lib/sounds';
import { resolveVoiceId } from '../lib/voices';
import { useLanJoinBase } from '../lib/lan';

function Countdown({ endsAt }: { endsAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((endsAt || now) - now) / 1000));
  return <span className="tabular-nums">{seconds}s</span>;
}

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
  const me = useGameStore(s => s.me);
  const latestBall = useGameStore(s => s.latestBall);
  const winner = useGameStore(s => s.winner);
  const claimAlert = useGameStore(s => s.claimAlert);
  const dikitAlert = useGameStore(s => s.dikitAlert);
  const emotes = useGameStore(s => s.emotes);
  const nearWinAlert = useGameStore(s => s.nearWinAlert);
  const connect = useGameStore(s => s.connect);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);
  const callNextBall = useGameStore(s => s.callNextBall);

  const isHostView = Boolean(me?.isHost);
  const [lastBalls, setLastBalls] = useState<number[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(() =>
    isHostView ? sessionStorage.getItem('bingo_host_audio') !== 'muted' : false
  );
  const [audioGateDismissed, setAudioGateDismissed] = useState(() => isHostView);
  const [revealedBall, setRevealedBall] = useState<number | null>(() => latestBall || null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnouncedKeyRef = useRef<string | null>(
    latestBall ? `${room?.roundNumber || 1}:${room?.calledNumbers?.length || 0}:${latestBall}` : null
  );
  const { baseUrl: lanBaseUrl, displayHost, isLanAddress } = useLanJoinBase();

  useEffect(() => {
    if (isHostView && !audioGateDismissed) {
      setAudioGateDismissed(true);
      setAudioEnabled(sessionStorage.getItem('bingo_host_audio') !== 'muted');
    }
  }, [isHostView, audioGateDismissed]);

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
  }, [connect]);

  // Host keyboard controls when viewing TV Mode in-screen
  useEffect(() => {
    if (!isHostView || !room) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;
      if (event.code === 'Escape') {
        event.preventDefault();
        navigate(`/host/${room.id}`);
        return;
      }
      if (event.code === 'Space' && room.status === 'playing' && room.autoCallSpeed === 0) {
        event.preventDefault();
        callNextBall();
      }
      if (event.code === 'KeyR' && latestBall) {
        playVoiceBall(latestBall, resolveVoiceId(room.voiceMode));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isHostView, room, latestBall, navigate, callNextBall]);

  // Natural Voice & Ball Reveal Synchronization
  useEffect(() => {
    if (!latestBall) {
      setRevealedBall(null);
      lastAnnouncedKeyRef.current = null;
      return;
    }

    const ballKey = `${room?.roundNumber || 1}:${room?.calledNumbers?.length || 0}:${latestBall}`;
    if (lastAnnouncedKeyRef.current === ballKey) {
      setRevealedBall(latestBall);
      return;
    }
    lastAnnouncedKeyRef.current = ballKey;

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

    playVoiceBall(latestBall, resolveVoiceId(room?.voiceMode), {
      onStart: () => {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        triggerReveal();
      }
    });

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [latestBall, audioEnabled, room?.voiceMode, room?.roundNumber, room?.calledNumbers?.length]);

  const enableAudio = () => {
    setAudioEnabled(true);
    setAudioGateDismissed(true);
    if (isHostView) sessionStorage.setItem('bingo_host_audio', 'on');
  };

  const toggleAudio = () => {
    if (audioEnabled) {
      setAudioEnabled(false);
      setAudioGateDismissed(true);
      if (isHostView) sessionStorage.setItem('bingo_host_audio', 'muted');
      stopVoice();
    } else {
      enableAudio();
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
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, disableForReducedMotion: true });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, disableForReducedMotion: true });
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

  const joinUrl = `${lanBaseUrl}/?code=${room.id}`;
  const connectedPlayers = Object.values(room.players).filter((p: Player) => p.connected);
  const pricingEnabled = hasCardPricing(room);
  const totalCollected = room.stats?.totalPotCollected ?? calculateTotalCollected(room.players, room);
  const dikitPrize = room.dikitPrize || 0;
  const bingoPrize = room.bingoPrize || 0;
  const showFinanceBar = pricingEnabled || totalCollected > 0 || dikitPrize > 0 || bingoPrize > 0;

  const hostNavBar = isHostView ? (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => navigate(`/host/${room.id}`)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-[#3D3A35] hover:text-white border-2 border-[#DED9D1] hover:border-[#3D3A35] text-[#3D3A35] text-xs font-bold uppercase tracking-wider shadow-sm transition-all"
        title="Return to Host Booth (Esc)"
      >
        <ArrowLeft size={15} />
        <span>Host Booth</span>
      </button>
      <button
        type="button"
        onClick={() => navigate(`/host/${room.id}/grid`)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#EA580C]/10 hover:bg-[#EA580C]/20 border-2 border-[#EA580C]/20 text-[#EA580C] text-xs font-bold uppercase tracking-wider transition-all"
        title="Switch to Live Player Cards"
      >
        <LayoutGrid size={15} />
        <span className="hidden sm:inline">Live Cards</span>
      </button>
    </div>
  ) : null;

  const offlineBanner = !socket?.connected ? (
    <div role="status" className="fixed top-3 left-1/2 -translate-x-1/2 z-[140] bg-[#EA580C] text-white px-5 py-2 rounded-full shadow-2xl border-2 border-white flex items-center gap-2 text-xs font-black uppercase tracking-wider">
      <Loader size={14} className="animate-spin" />
      <span>Connection lost — reconnecting TV display...</span>
    </div>
  ) : null;

  const audioGateModal = !audioEnabled && !audioGateDismissed ? (
    <div className="fixed inset-0 z-[100] bg-[#3D3A35]/70 backdrop-blur-md flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="TV Display Audio Setup">
      <div className="bg-white rounded-[36px] border-4 border-[#3D3A35] p-8 max-w-md w-full text-center shadow-2xl flex flex-col gap-4">
        <div className="w-16 h-16 mx-auto bg-[#EA580C]/10 text-[#EA580C] rounded-2xl flex items-center justify-center">
          <Monitor size={36} />
        </div>
        <div>
          <h2 className="text-2xl font-display uppercase tracking-tight text-[#3D3A35]">TV Display Sound</h2>
          <p className="text-sm font-medium text-[#6B655D] mt-1">Enable voice calling on this TV, or run silent if the Host device is announcing.</p>
        </div>
        <button type="button" onClick={enableAudio} className="w-full bg-[#EA580C] hover:bg-[#C2410C] text-white px-6 py-4 rounded-2xl font-black text-lg shadow-[0_5px_0_#9A3412] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-2.5 uppercase tracking-wider">
          <Volume2 size={22} />Enable TV Announcer
        </button>
        <button type="button" onClick={() => setAudioGateDismissed(true)} className="w-full bg-[#FAF7F2] hover:bg-[#E8E2D9] border-2 border-[#DED9D1] text-[#3D3A35] px-6 py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2">
          <VolumeX size={18} />Silent TV (Display Only)
        </button>
      </div>
    </div>
  ) : null;

  if (room.status === 'waiting') {
    return (
      <div className="min-h-screen lg:h-screen lg:max-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col lg:overflow-hidden relative p-5 sm:p-6 lg:p-8 paper-texture">
        {offlineBanner}
        {hostNavBar && (
          <div className="fixed top-5 left-5 z-30">
            {hostNavBar}
          </div>
        )}
        {audioGateDismissed && (
          <button
            type="button"
            onClick={toggleAudio}
            aria-label={audioEnabled ? 'Mute TV announcer' : 'Enable TV announcer'}
            className={`fixed top-5 right-5 z-30 flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-xs font-bold uppercase tracking-wider shadow-sm transition-all ${audioEnabled ? 'bg-[#0D9488] border-[#0D9488] text-white' : 'bg-white border-[#DED9D1] text-[#6B655D] hover:text-[#3D3A35]'}`}
          >
            {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>{audioEnabled ? 'TV Voice ON' : 'Silent TV'}</span>
          </button>
        )}
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
                <div className="h-1 w-10 bg-[#DED9D1] rounded-full" />
                <p className="text-xs sm:text-sm lg:text-base font-bold text-[#6B655D] uppercase tracking-[0.3em]">The Hall is Open</p>
                <div className="h-1 w-10 bg-[#DED9D1] rounded-full" />
              </div>
            </div>
          </div>

          {/* Card Pricing & Prizes Banner (shown whenever Host configures prices or prizes) */}
          {showFinanceBar && (
            <div className="w-full bg-white rounded-3xl border-4 border-[#E8E2D9] px-5 py-3 shadow-md flex flex-wrap items-center justify-between gap-3 shrink-0">
              {pricingEnabled && (
                <div className="flex flex-wrap items-center gap-2 text-xs lg:text-sm font-black text-[#3D3A35]">
                  <span className="text-[11px] uppercase tracking-wider text-[#6B655D] mr-1 flex items-center gap-1">
                    <Coins size={14} className="text-[#EA580C]" />
                    Cards:
                  </span>
                  <span className="bg-[#FAF7F2] border border-[#E8E2D9] px-2.5 py-1 rounded-xl tabular-nums">1 for {formatPeso(calculateCardsCost(1, room))}</span>
                  <span className="bg-[#FAF7F2] border border-[#E8E2D9] px-2.5 py-1 rounded-xl tabular-nums">2 for {formatPeso(calculateCardsCost(2, room))}</span>
                  <span className="bg-[#FAF7F2] border border-[#E8E2D9] px-2.5 py-1 rounded-xl tabular-nums">4 for {formatPeso(calculateCardsCost(4, room))}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {totalCollected > 0 && (
                  <span className="bg-[#3D3A35] text-white px-3 py-1 rounded-xl text-xs lg:text-sm font-black tabular-nums">
                    Pot: {formatPeso(totalCollected)}
                  </span>
                )}
                {dikitPrize > 0 && (
                  <span className="bg-[#0D9488]/15 text-[#0F766E] px-3 py-1 rounded-xl text-xs lg:text-sm font-black tabular-nums inline-flex items-center gap-1.5">
                    <Swords size={14} aria-hidden="true" /> Dikit: {formatPeso(dikitPrize)}
                  </span>
                )}
                {bingoPrize > 0 && (
                  <span className="bg-[#EA580C]/15 text-[#C2410C] px-3 py-1 rounded-xl text-xs lg:text-sm font-black tabular-nums inline-flex items-center gap-1.5">
                    <Trophy size={14} aria-hidden="true" /> Bingo: {formatPeso(bingoPrize)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Main 2-Column Lobby Area (Fits cleanly within 720p, 900p, 1080p) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 w-full flex-1 min-h-0 lg:max-h-[540px]">
            <div className="bg-white rounded-[40px] lg:rounded-[48px] p-6 lg:p-8 border-4 border-[#E8E2D9] shadow-xl flex flex-col items-center justify-center text-center min-h-0">
              <h3 className="text-lg lg:text-xl font-black uppercase tracking-tight mb-3 shrink-0">Scan to Join</h3>
              <div className="bg-[#FAF7F2] p-4 lg:p-5 rounded-[32px] border-4 border-white shadow-inner mb-3 shrink-0">
                <QrCode
                  value={joinUrl}
                  size={256}
                  label={`Scan QR code to join room ${room.id}`}
                  className="w-44 h-44 lg:w-56 lg:h-56 xl:w-60 xl:h-60"
                />
              </div>
              {isLanAddress && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-2 rounded-full bg-[#FAF7F2] border border-[#E8E2D9] text-xs font-bold text-[#6B655D] tabular-nums shrink-0">
                  <Wifi size={13} className="text-[#0D9488]" />
                  <span>{displayHost}</span>
                </div>
              )}
              <div className="space-y-1 shrink-0">
                <p className="text-xs lg:text-sm font-bold text-[#6B655D] uppercase tracking-widest">Or enter code</p>
                <div className="text-5xl lg:text-6xl font-display text-[#EA580C] tracking-[0.2em] tabular-nums leading-none">{room.id}</div>
              </div>
            </div>

            <div className="bg-[#3D3A35] rounded-[40px] lg:rounded-[48px] p-6 lg:p-8 border-8 border-white shadow-xl flex flex-col text-white min-h-0">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex flex-col">
                  <span className="text-5xl lg:text-6xl font-display leading-none tabular-nums text-[#FACC15]">{connectedPlayers.length}</span>
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-white/80 mt-1">{connectedPlayers.length === 1 ? 'Player In Hall' : 'Players In Hall'}</span>
                </div>
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center animate-pulse">
                  <Users size={28} className="text-[#FACC15]" />
                </div>
              </div>

              <div className="flex-1 min-h-0 space-y-2.5 overflow-hidden relative">
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#3D3A35] to-transparent z-10 pointer-events-none" />
                <h4 className="text-xs font-bold uppercase tracking-[0.24em] mb-3 text-white/70">Recent Arrivals</h4>
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
                  <div className="py-16 text-center text-white/60 font-semibold italic uppercase tracking-widest">Waiting for players...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {audioGateModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col lg:overflow-hidden relative">
      {offlineBanner}
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
              <div className="text-base lg:text-xl font-black uppercase tracking-[0.35em] text-[#FACC15] mb-2">
                {room.mode === 'Bingo' ? `${room.patterns.length} Active Winning Patterns` : 'Target Mode'}
              </div>
              <h2 className="font-display text-6xl lg:text-8xl uppercase tracking-tight">
                {room.mode === 'Bingo' ? 'Standard Bingo' : room.mode}
              </h2>
            </div>
            {!room.hidePattern && room.mode === 'Bingo' && (
              <div className="bg-white p-6 lg:p-8 rounded-[40px] shadow-[0_0_80px_rgba(250,204,21,0.2)] max-w-5xl w-full max-h-[56vh] overflow-y-auto custom-scrollbar">
                <PatternVisualizer patterns={room.patterns} size="lg" />
              </div>
            )}
            <div className="mt-8 text-xl font-bold text-white/80 uppercase tracking-widest animate-pulse shrink-0">Round Starting Now</div>
          </motion.div>
        )}
      </AnimatePresence>

      {audioGateModal}

      <header className="h-16 lg:h-20 bg-white border-b-4 border-[#E8E2D9] px-4 sm:px-6 lg:px-10 flex items-center justify-between gap-3 shadow-sm shrink-0">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {hostNavBar}
          {!hostNavBar && (
            <div className="w-11 h-11 lg:w-12 lg:h-12 bg-[#EA580C] rounded-2xl flex items-center justify-center shadow-lg rotate-[-5deg] shrink-0"><span className="text-2xl lg:text-3xl font-display text-white italic">L</span></div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-display uppercase tracking-tighter leading-none truncate">Lucky Bingo</h1>
            <p className="text-[#6B655D] font-bold text-[11px] uppercase tracking-[0.28em] mt-0.5 hidden sm:block">Live Hall Display</p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 lg:gap-8 shrink-0">
          {isHostView && room.status === 'playing' && room.autoCallSpeed === 0 && (
            <button
              type="button"
              onClick={callNextBall}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3D3A35] hover:bg-black text-white text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all"
              title="Call Next Ball (Space)"
            >
              <span>Call Ball</span>
              <kbd className="text-[10px] font-semibold bg-white/15 px-1.5 py-0.5 rounded hidden md:inline">Space</kbd>
            </button>
          )}
          <button
            type="button"
            onClick={toggleAudio}
            aria-label={audioEnabled ? 'Mute TV announcer' : 'Enable TV announcer'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${audioEnabled ? 'bg-[#0D9488] border-[#0D9488] text-white' : 'bg-[#FAF7F2] border-[#DED9D1] text-[#6B655D] hover:text-[#3D3A35]'}`}
          >
            {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span className="hidden sm:inline">{audioEnabled ? 'Voice ON' : 'Silent'}</span>
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider">Room Code</span>
            <span className="text-4xl lg:text-5xl font-display tracking-tighter text-[#3D3A35] leading-none tabular-nums">{room.id}</span>
          </div>
          <div className="h-10 w-1 bg-[#E8E2D9] rounded-full" />
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider">{connectedPlayers.length === 1 ? 'Player' : 'Players'}</span>
            <div className="flex items-center gap-2">
              <Users className="text-[#0D9488]" size={20} />
              <span className="text-3xl lg:text-4xl font-display text-[#3D3A35] leading-none tabular-nums">{connectedPlayers.length}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_380px] gap-4 lg:gap-6 min-h-0 relative lg:overflow-hidden">
        {/* Shared non-colliding top-center alert stack */}
        {(room.dikitFight?.status === 'active' || nearWinAlert) && (
          <div className="absolute top-3 inset-x-4 z-30 pointer-events-none flex flex-col items-center gap-2">
            {room.dikitFight && room.dikitFight.status === 'active' && (
              <div className="bg-[#0D9488] text-white px-6 py-2 rounded-full shadow-2xl border-4 border-white flex items-center gap-2.5 animate-pulse max-w-[90vw]">
                <Swords size={18} className="shrink-0" aria-hidden="true" />
                <span className="font-black text-sm lg:text-base uppercase tracking-wider truncate">
                  {room.dikitFight.roundBingoPending
                    ? `BINGO WON! DIKIT FIGHT IN PROGRESS (${room.dikitFight.contenders.map(c => c.playerName).join(' vs ')})`
                    : `DIKIT FIGHT IN PROGRESS: ${room.dikitFight.contenders.map(c => c.playerName).join(' vs ')}`}
                </span>
              </div>
            )}
            <AnimatePresence>
              {nearWinAlert && (
                <motion.div
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 bg-[#3D3A35] text-white pl-4 pr-6 py-2 rounded-full shadow-2xl border-2 border-[#FACC15] max-w-[92%]"
                >
                  <span className="bg-[#EA580C] text-white px-3 py-0.5 rounded-full font-black text-xs lg:text-sm uppercase tracking-widest shrink-0">
                    1 Away!
                  </span>
                  <span className="text-base lg:text-xl font-black uppercase tracking-tight truncate">{nearWinAlert.playerName}</span>
                  <span className="text-xs lg:text-sm font-bold text-[#FACC15] uppercase tracking-wider shrink-0">on {nearWinAlert.patternName}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {nearWinAlert && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-2 z-20 pointer-events-none rounded-[40px] shadow-[inset_0_0_48px_rgba(234,88,12,0.45)] border-4 border-[#EA580C]/70"
            />
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
                      <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-8xl xl:text-[120px] font-display leading-none tracking-tighter z-10 tabular-nums">{revealedBall}</motion.span>
                    </div>
                  </motion.div>
                ) : (
                  <div className="relative z-10 flex flex-col items-center gap-3 text-[#6B655D]">
                    <PlayCircle size={64} strokeWidth={1.5} />
                    <span className="text-base font-bold uppercase tracking-widest">Waiting to start</span>
                  </div>
                )}
              </AnimatePresence>
            </div>

            <div className="bg-white rounded-[36px] border-4 border-[#E8E2D9] p-5 xl:p-7 shadow-lg flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAF7F2] rounded-bl-[80px] -mr-6 -mt-6 pointer-events-none" />
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.22em] mb-3">Round Details</h3>
                  <div className="flex flex-wrap items-end gap-6">
                    <div>
                      <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.16em] block mb-0.5">Current Round</span>
                      <div className="text-3xl xl:text-4xl font-display text-[#3D3A35] uppercase italic leading-none">{room.roundName}</div>
                    </div>
                    {room.prizeText && (
                      <div>
                        <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.16em] block mb-0.5">Playing For</span>
                        <div className="text-2xl xl:text-3xl font-display text-[#EA580C] uppercase tracking-tighter leading-none">{room.prizeText}</div>
                      </div>
                    )}
                  </div>
                  {showFinanceBar && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {totalCollected > 0 && (
                        <span className="bg-[#3D3A35] text-white px-3 py-1 rounded-xl text-xs font-black tabular-nums">
                          Pot: {formatPeso(totalCollected)}
                        </span>
                      )}
                      {dikitPrize > 0 && (
                        <span className="bg-[#0D9488]/15 text-[#0F766E] border border-[#0D9488]/25 px-3 py-1 rounded-xl text-xs font-black tabular-nums inline-flex items-center gap-1.5">
                          <Swords size={12} aria-hidden="true" /> Dikit: {formatPeso(dikitPrize)}
                        </span>
                      )}
                      {bingoPrize > 0 && (
                        <span className="bg-[#EA580C]/15 text-[#C2410C] border border-[#EA580C]/25 px-3 py-1 rounded-xl text-xs font-black tabular-nums inline-flex items-center gap-1.5">
                          <Trophy size={12} aria-hidden="true" /> Bingo: {formatPeso(bingoPrize)}
                        </span>
                      )}
                      {pricingEnabled && (
                        <span className="text-[11px] font-bold text-[#6B655D] ml-1 tabular-nums">
                          Cards: 1={formatPeso(calculateCardsCost(1, room))} · 2={formatPeso(calculateCardsCost(2, room))} · 4={formatPeso(calculateCardsCost(4, room))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#6B655D] uppercase tracking-[0.18em] mb-2.5">Previous Numbers</h3>
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
                          <span className="text-[10px] font-bold text-[#6B655D] leading-none">{getBallLetter(n)}</span>
                          <span className="text-2xl xl:text-3xl font-display text-[#3D3A35] leading-none tabular-nums">{n}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {lastBalls.length === 0 && (
                      <div className="h-full flex items-center text-[#6B655D] font-semibold italic text-sm">No history yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5-Row Aligned Master Number Board */}
          <div className="bg-white rounded-[36px] p-4 lg:p-6 border-4 border-[#E8E2D9] shadow-lg flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.22em]">Master Number Board</span>
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
                          className={`aspect-square max-h-full w-full flex items-center justify-center text-base lg:text-xl xl:text-2xl font-display rounded-lg xl:rounded-xl border-2 transition-all duration-300 relative overflow-hidden tabular-nums ${
                            isLatestNum
                              ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg ring-2 ring-[#FACC15] scale-105 z-10'
                              : isCalled
                                ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-md'
                                : 'bg-[#FAF7F2] text-[#7A746B] border-[#E8E2D9]'
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
            <div className="bg-[#FAF7F2] p-3 rounded-[24px] border-2 border-[#E8E2D9] mb-2.5 shadow-inner">
              <QrCode
                value={joinUrl}
                size={180}
                label={`Scan QR code to join room ${room.id}`}
                className="w-36 h-36 xl:w-44 xl:h-44"
              />
            </div>
            {isLanAddress && (
              <p className="text-[11px] font-bold text-[#0F766E] tabular-nums mb-1">{displayHost}</p>
            )}
            <p className="text-[#6B655D] font-bold text-[11px] uppercase tracking-wider mb-1">Or enter code on mobile</p>
            <div className="text-3xl xl:text-4xl font-display text-[#EA580C] tracking-[0.2em] leading-none tabular-nums">{room.id}</div>
          </div>

          <div className="bg-white rounded-[36px] p-5 border-4 border-[#E8E2D9] shadow-lg flex-1 min-h-0 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FACC15] to-transparent opacity-50" />
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.22em]">Target Patterns</h3>
              {!room.hidePattern && room.mode === 'Bingo' && (
                <span className="text-[10px] font-black text-[#0F766E] bg-[#0D9488]/10 px-2.5 py-0.5 rounded-full uppercase tabular-nums">
                  {room.patterns.length} ON
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col items-center justify-start py-1 px-1">
              {!room.hidePattern ? (
                room.mode === 'Bingo' ? (
                  <PatternVisualizer patterns={room.patterns} size="tv" />
                ) : (
                  <div className="my-auto text-center">
                    <div className="text-3xl font-display text-[#EA580C] uppercase">{room.mode}</div>
                    <p className="text-xs font-bold text-[#6B655D] uppercase tracking-wider mt-1">
                      {room.mode === 'Blackout' ? 'Mark all 25 squares' : 'Hit any 2 adjacent numbers'}
                    </p>
                  </div>
                )
              ) : (
                <div className="my-auto text-[#6B655D] flex flex-col items-center gap-3">
                  <Eye size={48} className="opacity-50" />
                  <span className="text-xs font-bold uppercase tracking-[0.28em] text-center">Pattern Mystery</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t-2 border-[#FAF7F2] flex items-center justify-between shrink-0">
              <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider">Game Mode</span>
              <span className="text-lg font-display text-[#EA580C] uppercase">{room.mode === 'Bingo' ? 'Standard' : room.mode}</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="h-11 lg:h-12 bg-white border-t-4 border-[#E8E2D9] flex items-center relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#EA580C]/5 to-transparent opacity-50 pointer-events-none" />
        <div className="animate-marquee flex items-center gap-8 text-[#6B655D] font-bold text-xs uppercase tracking-[0.3em] whitespace-nowrap">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-8 shrink-0" aria-hidden={dup === 1}>
              <span>Lucky Bingo</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
              <span>Community Bingo Hall</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
              <span>Good Luck to All Players!</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
              <span>Check Your Cards!</span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
            </div>
          ))}
        </div>
      </footer>

      <AnimatePresence>
        {dikitAlert && (
          <motion.div initial={{ y: -200, opacity: 0 }} animate={{ y: 16, opacity: 1 }} exit={{ y: -200, opacity: 0 }} className="fixed top-20 left-1/2 -translate-x-1/2 z-[120] bg-[#0D9488] text-white p-6 rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-8 border-white flex flex-col items-center gap-5 w-[calc(100vw-3rem)] max-w-2xl">
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.4em] opacity-80 mb-1">
                {dikitAlert.length > 1 ? 'MULTIPLE DIKIT WINS!' : 'Dikit Sidebet Hit!'}
              </div>
              <div className="text-4xl lg:text-5xl font-display italic tracking-tighter">{dikitAlert.map((w: any) => w.playerName).join(' & ')}</div>
              {dikitPrize > 0 && (
                <div className="inline-flex items-center gap-1.5 mt-2 bg-white text-[#0F766E] px-4 py-1 rounded-full text-sm font-black tabular-nums shadow-md">
                  <Swords size={14} aria-hidden="true" /> Prize: {formatPeso(dikitPrize)}
                  {dikitAlert.length > 1 && ` (${formatPeso(dikitPrize / dikitAlert.length)} each)`}
                </div>
              )}
              <div className="text-xs font-black uppercase tracking-[0.26em] text-white/90 mt-1.5">Sidebet Winner · Game Continues</div>
            </div>
            <div className="flex gap-5 overflow-x-auto w-full pb-2 px-2 scrollbar-hide justify-center">
              {dikitAlert.map((alert: any, aIdx: number) => (
                <div key={alert.id || aIdx} className="bg-white/10 p-4 rounded-[24px] border-2 border-white/20 shrink-0">
                  <div className="text-center text-xs font-black mb-2 uppercase tracking-widest">
                    {alert.playerName} · Card {(alert.cardIndex ?? 0) + 1}
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {['B', 'I', 'N', 'G', 'O'].map(l => (
                      <div key={l} className="text-center font-black text-[10px] text-white/85">{l}</div>
                    ))}
                    {alert.card.map((row: number[], rIdx: number) =>
                      row.map((num: number, cIdx: number) => {
                        const called = num === 0 || room.calledNumbers.includes(num);
                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            className={`w-9 h-9 flex items-center justify-center font-display text-xs rounded-lg border-2 tabular-nums ${
                              num === 0 ? 'bg-[#FACC15] text-[#854D0E] border-[#FACC15]' : called ? 'bg-white text-[#0F766E] border-white shadow-md' : 'bg-[#0F766E] border-white/25 text-white/85'
                            }`}
                          >
                            {num === 0 ? '★' : num}
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
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                      className="w-36 h-36 bg-[#EA580C] rounded-full flex items-center justify-center shadow-[0_0_80px_rgba(234,88,12,0.6)] border-8 border-white"
                    >
                      <Trophy size={64} className="text-[#FACC15]" />
                    </motion.div>
                    <div className="absolute -inset-6 border-4 border-dashed border-[#FACC15]/50 rounded-full animate-spin-slow" />
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
                    <p className="text-[#FACC15] text-xl font-black uppercase tracking-[0.35em] animate-pulse">
                      Host Verifying Card...
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

                  {bingoPrize > 0 && (
                    <div className="mb-4 bg-[#FACC15] text-[#854D0E] px-6 py-1.5 rounded-full font-display text-xl lg:text-2xl tracking-wide shadow-xl shrink-0 tabular-nums">
                      🏆 PRIZE: {formatPeso(bingoPrize)}
                      {winner.length > 1 && (
                        <span className="font-sans text-xs lg:text-sm font-black ml-2 uppercase">
                          ({formatPeso(bingoPrize / winner.length)} each)
                        </span>
                      )}
                    </div>
                  )}

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
                                  className={`aspect-square flex items-center justify-center font-display text-base lg:text-lg rounded-xl border-2 transition-all tabular-nums ${
                                    num === 0
                                      ? 'bg-[#FACC15] text-[#854D0E] border-[#FACC15]'
                                      : called
                                        ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-md'
                                        : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#7A746B]'
                                  }`}
                                >
                                  {num === 0 ? '★' : num}
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div className="mt-4 pt-3 border-t-2 border-[#FAF7F2] flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.18em]">Pattern</span>
                          <span className="text-lg font-display text-[#EA580C] uppercase italic tracking-tight">{w.pattern || 'Bingo'}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div
                    animate={{ y: [0, 6, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="bg-white/10 border border-white/20 px-6 py-2.5 rounded-full text-white font-black uppercase tracking-[0.3em] text-xs sm:text-sm mt-4 shrink-0"
                  >
                    {room.status === 'next_round' ? (
                      <>Next Round Auto-Starting in <span className="text-[#FACC15]"><Countdown endsAt={room.nextRoundEndsAt} /></span></>
                    ) : (
                      'Awaiting Next Round'
                    )}
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
