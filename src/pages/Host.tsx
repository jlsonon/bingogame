import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { Play, Square, Settings, Copy, Users, Ticket, Monitor, Trophy, Plus, Eye, LayoutGrid, CheckCircle2, RotateCcw, Volume2, VolumeX, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PRESET_PATTERNS, type BingoPattern, getBallLetter, checkValidWin, calculateCardsCost, calculateTotalCollected, formatPeso, hasCardPricing } from '../lib/bingo';
import { SOUNDS, playSound, playVoiceBall, previewVoice } from '../lib/sounds';
import { NATURAL_VOICES } from '../lib/voices';

const DELETED_PATTERN_IDENTIFIERS = new Set([
  'letter-x', 'letter-t', 'letter-l', 'dikit',
  'letter x', 'letter t', 'letter l'
]);

function isDeletedPattern(pattern: { id?: string; name?: string } | null | undefined): boolean {
  if (!pattern) return false;
  const id = (pattern.id || '').toLowerCase().trim();
  const name = (pattern.name || '').toLowerCase().trim();
  return DELETED_PATTERN_IDENTIFIERS.has(id) || DELETED_PATTERN_IDENTIFIERS.has(name);
}

function Countdown({ endsAt }: { endsAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((endsAt || now) - now) / 1000));
  return <span className="tabular-nums">{seconds}s</span>;
}

function PatternGrid({ cells, onToggle }: { cells: number[], onToggle?: (cell: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {Array.from({ length: 25 }, (_, i) => {
        const selected = cells.includes(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle?.(i)}
            className={`aspect-square rounded-md border text-[10px] font-black ${selected ? 'bg-[#0D9488] border-[#0D9488] text-white' : 'bg-white border-[#DED9D1] text-[#A19B91]'}`}
          >
            {i === 12 ? 'FR' : ''}
          </button>
        );
      })}
    </div>
  );
}

export default function Host() {
  const { code } = useParams();
  const navigate = useNavigate();
  
  // Atomic Selectors
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const me = useGameStore(s => s.me);
  const latestBall = useGameStore(s => s.latestBall);
  const winner = useGameStore(s => s.winner);
  const dikitAlert = useGameStore(s => s.dikitAlert);
  const globalPatterns = useGameStore(s => s.globalPatterns);
  const saveGlobalPattern = useGameStore(s => s.saveGlobalPattern);
  const deleteGlobalPattern = useGameStore(s => s.deleteGlobalPattern);
  
  const startGame = useGameStore(s => s.startGame);
  const pauseGame = useGameStore(s => s.pauseGame);
  const resumeGame = useGameStore(s => s.resumeGame);
  const resetGame = useGameStore(s => s.resetGame);
  const startNextRound = useGameStore(s => s.startNextRound);
  const callNextBall = useGameStore(s => s.callNextBall);
  const updateSettings = useGameStore(s => s.updateSettings);
  const verifyClaim = useGameStore(s => s.verifyClaim);
  const settleMultiBingo = useGameStore(s => s.settleMultiBingo);
  const multiBingoPending = useGameStore(s => s.multiBingoPending);
  const dismissWinner = useGameStore(s => s.dismissWinner);
  const dismissDikit = useGameStore(s => s.dismissDikit);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);

  const [showSettings, setShowSettings] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [customName, setCustomName] = useState('Custom Pattern');
  const [customCells, setCustomCells] = useState<number[]>([12]);
  const [activeCustomId, setActiveCustomId] = useState<string>(() => `custom-${Date.now()}`);
  const [saveFeedback, setSaveFeedback] = useState<string>('');

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [revealedBall, setRevealedBall] = useState<number | null>(() => latestBall || null);
  const [maleVoice, setMaleVoice] = useState<SpeechSynthesisVoice | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoSyncedPatternsRef = useRef(false);

  const libraryPatterns = useMemo(() => {
    const map = new Map<string, BingoPattern>();
    PRESET_PATTERNS.forEach(p => {
      if (!isDeletedPattern(p)) map.set(p.id, p);
    });
    globalPatterns.forEach(p => {
      if (p && p.id && !isDeletedPattern(p) && p.match !== 'dikit' && Array.isArray(p.cells) && p.cells.filter(c => c !== 12).length > 0) {
        map.set(p.id, p);
      }
    });
    return Array.from(map.values());
  }, [globalPatterns]);

  // Auto-activate ALL library patterns once when room initializes in waiting state
  useEffect(() => {
    if (!room || room.status === 'playing' || hasAutoSyncedPatternsRef.current) return;
    if (libraryPatterns.length === 0) return;
    hasAutoSyncedPatternsRef.current = true;
    const missing = libraryPatterns.filter(lp => !room.patterns.some(rp => rp.id === lp.id));
    if (missing.length > 0) {
      updateSettings({ patterns: libraryPatterns });
    }
  }, [libraryPatterns, room, updateSettings]);

  // Load voices and enable audio context on first interaction
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Male'));
      setMaleVoice(preferred || voices[0] || null);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    const unlockAudio = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      }
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Automatic Voice Calling & Ball Reveal on Ball Call
  useEffect(() => {
    if (!latestBall) {
      setRevealedBall(null);
      return;
    }

    if (!audioEnabled) {
      setRevealedBall(latestBall);
      return;
    }

    // Play mechanical chute sound
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
  }, [latestBall, audioEnabled, room?.voiceMode, maleVoice]);

  // --- MIGRATION: ONE-TIME SYNC LOCAL PATTERNS TO SERVER ---
  useEffect(() => {
    const localSaved = localStorage.getItem('bingo_pattern_library');
    if (localSaved && socket?.connected) {
      try {
        const localPatterns: BingoPattern[] = JSON.parse(localSaved);
        if (localPatterns.length > 0) {
          console.log(`Found ${localPatterns.length} local patterns. Migrating to server...`);
          localPatterns.forEach(p => saveGlobalPattern(p));
          // Once migrated, clear local storage so we don't keep re-syncing
          localStorage.removeItem('bingo_pattern_library');
        }
      } catch (e) {
        console.error("Migration failed:", e);
      }
    }
  }, [socket?.connected, saveGlobalPattern]);
  // ---------------------------------------------------------

  useEffect(() => {
    if (!socket || !code) return;
    if (!room) {
      rejoinRoom(code, 'host').then(success => {
        if (!success) navigate('/');
      });
      return;
    }
    if (!me?.isHost) {
      navigate(`/play/${room.id}`);
    }
  }, [socket, code, room, navigate, me, rejoinRoom]);

  useEffect(() => {
    if (winner) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
  }, [winner]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;
      
      // Host claims verification
      if (room?.claims?.length > 0 && !winner) {
        if (event.code === 'Enter') verifyClaim(room.claims[0].id, true);
        if (event.code === 'Escape') verifyClaim(room.claims[0].id, false);
      }

      // Special Host Hotkeys
      if (event.code === 'KeyM') {
         updateSettings({ ambienceEnabled: !room?.ambienceEnabled });
      }
      if (event.code === 'KeyP') {
         updateSettings({ hidePattern: !room?.hidePattern });
      }
      if (event.code === 'KeyR' && latestBall) {
         // Re-read last ball
         const played = playVoiceBall(latestBall, room?.voiceMode || 'robotic');
         if (!played && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance(`${getBallLetter(latestBall)}... ${latestBall}`);
            msg.rate = 0.85;
            window.speechSynthesis.speak(msg);
         }
      }

      // Space to Call Ball (if playing and manual)
      if (event.code === 'Space') {
         if (room?.status === 'playing' && room.autoCallSpeed === 0) {
            event.preventDefault();
            callNextBall();
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [room, latestBall, callNextBall, updateSettings, verifyClaim, winner]);

  if (!room) return null;

  const totalCollected = room.stats?.totalPotCollected ?? calculateTotalCollected(room.players, room);
  const dikitPrize = room.dikitPrize || 0;
  const bingoPrize = room.bingoPrize || 0;
  const totalPrizes = dikitPrize + bingoPrize;
  const potBalance = totalCollected - totalPrizes;
  const pricingEnabled = hasCardPricing(room);

  const joinUrl = `${window.location.origin}/?code=${room.id}`;
  const displayUrl = `${window.location.origin}/display/${room.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopyLabel('Copied');
    window.setTimeout(() => setCopyLabel('Copy'), 1400);
  };

  const openDisplay = () => {
    window.open(displayUrl, '_blank');
  };

  const activateAllPatterns = () => {
    updateSettings({ patterns: libraryPatterns });
    setSaveFeedback('All patterns activated!');
    setTimeout(() => setSaveFeedback(''), 2500);
  };

  const togglePattern = (pattern: BingoPattern) => {
    const exists = room.patterns.some(item => item.id === pattern.id);
    const next = exists
      ? room.patterns.filter(item => item.id !== pattern.id)
      : [...room.patterns, pattern];
    updateSettings({ patterns: next });
    if (pattern.type === 'custom') {
      saveGlobalPattern(pattern);
    }
  };

  const startNewCustomPattern = () => {
    setActiveCustomId(`custom-${Date.now()}`);
    setCustomName('Custom Pattern');
    setCustomCells([12]);
    setSaveFeedback('');
  };

  const selectCustomPatternToEdit = (pattern: BingoPattern) => {
    setActiveCustomId(pattern.id);
    setCustomName(pattern.name);
    setCustomCells(pattern.cells && pattern.cells.length ? pattern.cells : [12]);
    setSaveFeedback('Loaded for editing');
    setTimeout(() => setSaveFeedback(''), 2500);
  };

  const saveCustomPattern = (addToRound: boolean) => {
    const nonFree = customCells.filter(c => c !== 12);
    if (nonFree.length === 0) {
      setSaveFeedback('Please select at least 1 cell on the grid');
      setTimeout(() => setSaveFeedback(''), 2500);
      return;
    }

    const sortedCells = [...new Set([...customCells, 12])].sort((a, b) => a - b);
    const pattern: BingoPattern = {
      id: activeCustomId,
      name: customName.trim() || 'Custom Pattern',
      type: 'custom',
      match: 'cells',
      cells: sortedCells
    };

    // Save permanently to server database and global pattern library
    saveGlobalPattern(pattern);

    if (addToRound) {
      const exists = room.patterns.some(p => p.id === pattern.id);
      const next = exists
        ? room.patterns.map(p => p.id === pattern.id ? pattern : p)
        : [...room.patterns, pattern];
      updateSettings({ patterns: next });
      setSaveFeedback('Saved to database & activated in round!');
    } else {
      setSaveFeedback('Saved to database!');
    }
    setTimeout(() => setSaveFeedback(''), 3000);
  };

  const deleteFromLibrary = (id: string) => {
    deleteGlobalPattern(id);
    if (room.patterns.some(p => p.id === id)) {
      updateSettings({ patterns: room.patterns.filter(p => p.id !== id) });
    }
    if (activeCustomId === id) {
      startNewCustomPattern();
    }
  };

  return (
    <div className="min-h-screen lg:h-screen bg-[#FAF7F2] flex flex-col font-sans text-[#3D3A35] lg:overflow-hidden relative">
      {!socket?.connected && (
         <div className="fixed inset-0 z-[100] bg-[#3D3A35]/80 backdrop-blur-md flex items-center justify-center p-6 text-center">
            <div className="bg-white rounded-[32px] p-8 border-4 border-[#0D9488] shadow-2xl max-w-xs">
               <div className="w-12 h-12 border-4 border-[#0D9488] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
               <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Restoring Link</h2>
               <p className="text-sm font-bold text-[#7A746B]">Host connection dropped. Attempting to rejoin the booth...</p>
            </div>
         </div>
      )}

      <header className="bg-white border-b-2 border-[#E8E2D9] h-16 px-3 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="bg-[#F3EFE9] border border-[#DED9D1] text-[#3D3A35] font-black text-lg sm:text-xl px-3 sm:px-4 py-1.5 rounded-xl tracking-wider tabular-nums flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-bold text-[#7A746B] uppercase tracking-widest hidden sm:inline">Room</span>
            {room.id}
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
             <button onClick={handleCopy} className="p-2 text-[#A19B91] hover:text-[#3D3A35] transition-colors rounded-lg hover:bg-[#FAF7F2]" title={copyLabel}><Copy size={17} /></button>
             <button onClick={openDisplay} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#0D9488]/10 text-[#0D9488] rounded-lg text-xs font-black uppercase tracking-wider hover:bg-[#0D9488]/20 transition-all" title="Open TV Display">
               <Monitor size={15} />
               <span className="hidden md:inline">TV Mode</span>
             </button>
             <button 
               onClick={() => window.open(`${window.location.origin}/host/${room.id}/grid`, '_blank')} 
               className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#EA580C]/10 text-[#EA580C] rounded-lg text-xs font-black uppercase tracking-wider hover:bg-[#EA580C]/20 transition-all"
               title="Open God View"
             >
               <LayoutGrid size={15} />
               <span className="hidden md:inline">God View</span>
             </button>
             <button
               onClick={() => setAudioEnabled(!audioEnabled)}
               className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                 audioEnabled ? 'bg-[#0D9488]/10 text-[#0D9488] hover:bg-[#0D9488]/20' : 'bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444]/20'
               }`}
               title={audioEnabled ? "Caller Voice is ON (Click to Mute)" : "Caller Voice is MUTED (Click to Enable)"}
             >
               {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
               <span className="hidden sm:inline">{audioEnabled ? 'Voice On' : 'Muted'}</span>
             </button>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          <div className="hidden sm:flex flex-col items-end leading-none">
            <span className="text-xs font-black text-[#3D3A35] mb-1">{me?.nickname}</span>
            <span className="text-[10px] text-[#0D9488] font-bold uppercase flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] inline-block animate-pulse" />Host Dashboard</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 bg-[#F3EFE9] text-[#7A746B] border border-[#DED9D1] rounded-xl flex items-center justify-center hover:bg-[#E8E2D9] transition-colors" title="Room Config"><Settings size={20} /></button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[270px_1fr_300px] xl:grid-cols-[310px_1fr_350px] gap-0 lg:overflow-hidden min-h-0">
        <section className="bg-white border-b-2 lg:border-b-0 lg:border-r-2 border-[#E8E2D9] p-5 xl:p-6 flex flex-col gap-5 xl:gap-6 lg:overflow-y-auto custom-scrollbar">
           <div><h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Tactical Controls</h3><div className="grid grid-cols-1 gap-3">{room.status === 'waiting' && (<button onClick={startGame} className="w-full py-5 bg-[#0D9488] text-white rounded-2xl font-black text-xl shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none transition-all uppercase tracking-widest flex items-center justify-center gap-3"><Play size={24} fill="currentColor" />Lobby Start</button>)}{(room.status === 'playing' || room.status === 'paused') && (<div className="flex flex-col gap-3"><div className="grid grid-cols-2 gap-3"><button onClick={pauseGame} disabled={room.status === 'paused'} className={`py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all border-2 ${room.status === 'paused' ? 'bg-[#F3EFE9] border-[#DED9D1] text-[#A19B91]' : 'bg-[#EF4444] border-[#EF4444] text-white shadow-[0_4px_0_#B91C1C] active:translate-y-[4px] active:shadow-none'}`}><Square size={18} fill="currentColor" className="inline mr-2" />Emergency Stop</button><button onClick={resumeGame} disabled={room.status === 'playing'} className={`py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all border-2 ${room.status === 'playing' ? 'bg-[#F3EFE9] border-[#DED9D1] text-[#A19B91]' : 'bg-[#0D9488] border-[#0D9488] text-white shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none'}`}><Play size={18} fill="currentColor" className="inline mr-2" />Safety Resume</button></div><button onClick={resetGame} className="w-full py-3 bg-[#FAF7F2] border-2 border-[#E8E2D9] text-[#A19B91] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#E8E2D9] hover:text-[#3D3A35] transition-all">Abort Round / Reset</button></div>)}{room.status === 'next_round' && (<div className="flex flex-col gap-2.5"><div className="bg-[#FAF7F2] border-2 border-[#FACC15] rounded-2xl p-3 text-center"><div className="text-[10px] font-black uppercase tracking-widest text-[#7A746B]">Auto-Starting Round {room.roundNumber + 1}</div><div className="text-3xl font-display text-[#EA580C] leading-tight mt-0.5"><Countdown endsAt={room.nextRoundEndsAt} /></div></div><button onClick={startNextRound} className="w-full py-4 bg-[#FACC15] text-[#854D0E] rounded-2xl font-black text-lg shadow-[0_6px_0_#A16207] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-tighter flex flex-col items-center leading-none"><span className="text-[10px] mb-1">Skip Countdown</span>Start Next Round Now</button></div>)}</div></div>
           <div className="pt-6 border-t-2 border-[#FAF7F2]"><h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Ball Calling</h3><div className="space-y-4"><div className="bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest block mb-2">Auto-Call Speed (seconds)</label><div className="flex gap-2">{[0, 3, 5].map(speed => (<button key={speed} onClick={() => updateSettings({ autoCallSpeed: speed })} className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${room.autoCallSpeed === speed ? 'bg-[#3D3A35] border-[#3D3A35] text-white shadow-md' : 'bg-white border-[#DED9D1] text-[#A19B91] hover:border-[#A19B91]'}`}>{speed === 0 ? 'Off' : `${speed}s`}</button>))}<input type="number" min="0" placeholder="Custom" value={room.autoCallSpeed || ''} onChange={e => updateSettings({ autoCallSpeed: parseInt(e.target.value) || 0 })} className="w-16 py-2 px-1 text-center rounded-xl text-xs font-black border-2 bg-white border-[#DED9D1] text-[#3D3A35] focus:border-[#0D9488] outline-none" /></div></div>{room.status === 'playing' && room.autoCallSpeed === 0 && (<button onClick={callNextBall} className="w-full py-8 bg-[#3D3A35] text-white rounded-[32px] font-black text-2xl shadow-[0_8px_0_#1C1917] active:translate-y-[8px] active:shadow-none transition-all uppercase tracking-widest">Call Ball</button>)}</div></div>
           <div className="mt-auto pt-4 border-t-2 border-[#FAF7F2]">
             <div className="bg-[#FAF7F2] rounded-2xl p-4 border-2 border-[#E8E2D9] space-y-4">
               <div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-[#0D9488] mb-1.5 flex items-center justify-between gap-1">
                   <span>⚔️ Dikit Winners:</span>
                   <div className="flex items-center gap-1">
                     {dikitPrize > 0 && (
                       <span className="text-[9px] bg-[#0D9488] text-white px-1.5 py-0.5 rounded font-black tabular-nums">
                         {room.dikitWinners && room.dikitWinners.length > 1
                           ? `${formatPeso(dikitPrize / room.dikitWinners.length)} ea`
                           : formatPeso(dikitPrize)}
                       </span>
                     )}
                     {room.dikitWinners && room.dikitWinners.length > 0 && (
                       <span className="text-[9px] bg-[#0D9488]/15 text-[#0D9488] px-1.5 py-0.5 rounded font-black">
                         {room.dikitWinners.length}
                       </span>
                     )}
                   </div>
                 </div>
                 {room.dikitWinners && room.dikitWinners.length > 0 ? (
                   <div className="space-y-1">
                     {room.dikitWinners.map((w: any, idx: number) => (
                       <div key={w.id || idx} className="bg-white px-2.5 py-1.5 rounded-xl border border-[#E8E2D9] flex items-center justify-between text-xs">
                         <span className="font-black text-[#3D3A35] truncate">{w.playerName || w.name}</span>
                         <span className="text-[10px] font-bold text-[#0D9488] bg-[#0D9488]/10 px-1.5 py-0.5 rounded shrink-0">Card {(w.cardIndex ?? 0) + 1}</span>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-xs text-[#A19B91] italic pl-1">None yet</p>
                 )}
               </div>

               <div className="pt-2 border-t border-[#E8E2D9]">
                 <div className="text-[10px] font-black uppercase tracking-widest text-[#EA580C] mb-1.5 flex items-center justify-between gap-1">
                   <span>🏆 Bingo Winners:</span>
                   <div className="flex items-center gap-1">
                     {bingoPrize > 0 && (
                       <span className="text-[9px] bg-[#EA580C] text-white px-1.5 py-0.5 rounded font-black tabular-nums">
                         {room.verifiedWinners && room.verifiedWinners.length > 1
                           ? `${formatPeso(bingoPrize / room.verifiedWinners.length)} ea`
                           : formatPeso(bingoPrize)}
                       </span>
                     )}
                     {room.verifiedWinners && room.verifiedWinners.length > 0 && (
                       <span className="text-[9px] bg-[#EA580C]/15 text-[#EA580C] px-1.5 py-0.5 rounded font-black">
                         {room.verifiedWinners.length}
                       </span>
                     )}
                   </div>
                 </div>
                 {room.verifiedWinners && room.verifiedWinners.length > 0 ? (
                   <div className="space-y-1">
                     {room.verifiedWinners.map((w: any, idx: number) => (
                       <div key={w.id || idx} className="bg-white px-2.5 py-1.5 rounded-xl border border-[#E8E2D9] flex items-center justify-between text-xs">
                         <span className="font-black text-[#3D3A35] truncate">{w.playerName || w.name}</span>
                         <span className="text-[10px] font-bold text-[#EA580C] bg-[#EA580C]/10 px-1.5 py-0.5 rounded">{w.pattern || 'Bingo'}</span>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-xs text-[#A19B91] italic pl-1">None yet</p>
                 )}
               </div>
             </div>
           </div>
        </section>

        <section className="bg-[#FAF7F2] p-4 sm:p-6 xl:p-8 flex flex-col gap-5 xl:gap-6 lg:overflow-y-auto custom-scrollbar min-w-0">
           <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,1fr)_minmax(290px,360px)] gap-5 xl:gap-6 shrink-0">
              <div className="bg-white rounded-[32px] border-4 border-[#E8E2D9] p-6 shadow-sm flex flex-col justify-center items-center relative overflow-hidden min-h-[210px]">
                 <div className="absolute top-4 left-5 text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Latest Call</div>
                 <AnimatePresence mode="popLayout">
                    {revealedBall ? (
                       <motion.div
                         key={revealedBall}
                         initial={{ scale: 0.5, y: 50, opacity: 0 }}
                         animate={{ scale: 1, y: 0, opacity: 1 }}
                         exit={{ scale: 1.15, opacity: 0, transition: { duration: 0.15 } }}
                         transition={{ type: "spring", stiffness: 350, damping: 25 }}
                         className="flex flex-col items-center my-2"
                       >
                          <div className="w-36 h-36 xl:w-44 xl:h-44 rounded-full bg-[#FACC15] border-[8px] border-white outline outline-8 outline-[#FACC15] shadow-xl flex flex-col items-center justify-center text-[#854D0E] relative">
                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/40 pointer-events-none" />
                            <div className="absolute top-5 left-7 w-10 h-5 bg-white/30 rounded-[100%] blur-sm -rotate-45 pointer-events-none" />
                            <span className="text-xl xl:text-2xl font-display leading-none mb-0.5 z-10">{getBallLetter(revealedBall)}</span>
                            <span className="text-6xl xl:text-7xl font-display leading-none tracking-tighter z-10">{revealedBall}</span>
                          </div>
                       </motion.div>
                    ) : (<div className="text-lg xl:text-xl font-black text-[#DED9D1] uppercase tracking-widest text-center px-4">{room.status === 'playing' ? 'Drawing Ball...' : 'Awaiting First Ball'}</div>)}
                 </AnimatePresence>
              </div>
              <div className="bg-white rounded-[32px] border-4 border-[#E8E2D9] p-5 shadow-sm flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.25em]">Active Patterns</span>
                  {!room.hidePattern && room.mode === 'Bingo' && (
                    <span className="text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full uppercase">
                      {room.patterns.length} ON
                    </span>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center max-h-[190px] overflow-y-auto custom-scrollbar px-1">
                  {!room.hidePattern ? (
                    room.mode === 'Bingo' ? (
                      <PatternVisualizer patterns={room.patterns} size="sm" />
                    ) : (
                      <div className="text-center py-4">
                        <div className="text-2xl font-display text-[#EA580C] uppercase italic">{room.mode}</div>
                        <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-widest mt-1">
                          {room.mode === 'Blackout' ? 'Mark all 25 cells' : 'Hit any 2 adjacent numbers'}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-[#DED9D1] flex flex-col items-center gap-2 py-4">
                      <Eye size={32} className="opacity-30" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight px-4">Pattern Hidden from Screens</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t-2 border-[#FAF7F2] flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest">Mode</span>
                  <span className="text-sm font-black text-[#EA580C] uppercase tracking-tight">{room.mode === 'Bingo' ? 'Standard' : room.mode}</span>
                </div>
              </div>
           </div>
           <div className="bg-white rounded-[32px] border-4 border-[#E8E2D9] p-5 xl:p-6 shadow-sm flex-1 min-h-0 overflow-y-auto custom-scrollbar">
             {room.dikitFight && room.dikitFight.status === 'active' && (
               <div className="bg-[#0D9488]/10 border-2 border-[#0D9488] rounded-2xl p-3 mb-5 flex flex-wrap items-center justify-between gap-2">
                 <div className="flex items-center gap-2">
                   <span className="text-xl">⚔️</span>
                   <div>
                     <div className="text-xs font-black uppercase tracking-wider text-[#0D9488]">
                       Dikit Fight In Progress
                     </div>
                     <div className="text-[10px] font-bold text-[#7A746B]">
                       {room.dikitFight.roundBingoPending
                         ? '🏆 BINGO VERIFIED! Continue calling balls to conclude Dikit Fight'
                         : 'Simultaneous sidebet: Waiting for 1 or 2 cards to hit another Dikit'}
                     </div>
                   </div>
                 </div>
                 <div className="text-[10px] font-black uppercase bg-[#0D9488] text-white px-3 py-1 rounded-full">
                   {room.dikitFight.contenders.map(c => c.playerName).join(' vs ')}
                 </div>
               </div>
             )}
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Master Number Board</h3>
               <div className="text-xs font-black text-[#EA580C] tabular-nums bg-[#EA580C]/10 px-3 py-1 rounded-full">{room.calledNumbers.length} / 75</div>
             </div>
             <div className="space-y-1.5">
               {(['B', 'I', 'N', 'G', 'O'] as const).map((letter, rowIdx) => (
                 <div key={letter} className="grid grid-cols-[26px_1fr] items-center gap-2">
                   <div className="font-display text-lg xl:text-xl text-[#EA580C] text-center leading-none">{letter}</div>
                   <div className="grid grid-cols-15 gap-1 xl:gap-1.5">
                     {Array.from({ length: 15 }, (_, colIdx) => rowIdx * 15 + colIdx + 1).map(num => {
                       const isCalled = room.calledNumbers.includes(num);
                       const isLatestNum = revealedBall === num;
                       return (
                         <div
                           key={num}
                           className={`aspect-square flex items-center justify-center text-xs sm:text-sm xl:text-base font-display rounded-md xl:rounded-lg border-2 transition-all relative overflow-hidden ${
                             isLatestNum
                               ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md ring-2 ring-[#FACC15] scale-105 z-10'
                               : isCalled
                                 ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm'
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
        </section>

        <section className="bg-white border-t-2 lg:border-t-0 lg:border-l-2 border-[#E8E2D9] flex flex-col lg:overflow-hidden min-h-0">
           <div className="p-5 xl:p-6 border-b-2 border-[#FAF7F2] bg-[#FAF7F2]/30 shrink-0 space-y-3">
             <div className="flex items-center justify-between">
               <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">Session Stats</h3>
               <button
                 type="button"
                 onClick={() => setShowSettings(true)}
                 className="text-[9px] font-black uppercase text-[#EA580C] bg-[#EA580C]/10 hover:bg-[#EA580C]/20 px-2 py-0.5 rounded-full transition-colors"
               >
                 Edit Prices
               </button>
             </div>
             <div className="grid grid-cols-2 gap-3">
               <div className="bg-white p-3 rounded-2xl border-2 border-[#E8E2D9] shadow-sm">
                 <Ticket size={16} className="text-[#EA580C] mb-1" />
                 <div className="text-2xl font-display tabular-nums leading-none">{room.stats.totalCardsSold}</div>
                 <div className="text-[9px] font-bold text-[#A19B91] uppercase tracking-wider mt-0.5">Cards Sold</div>
               </div>
               <div className="bg-white p-3 rounded-2xl border-2 border-[#E8E2D9] shadow-sm">
                 <Users size={16} className="text-[#0D9488] mb-1" />
                 <div className="text-2xl font-display tabular-nums leading-none">{Object.values(room.players).length}</div>
                 <div className="text-[9px] font-bold text-[#A19B91] uppercase tracking-wider mt-0.5">Players</div>
               </div>
             </div>
             <div className="bg-white p-3.5 rounded-2xl border-2 border-[#E8E2D9] shadow-sm space-y-2">
               <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black text-[#7A746B] uppercase tracking-wider flex items-center gap-1.5">
                   <Coins size={13} className="text-[#EA580C]" />
                   Pot Collected
                 </span>
                 <span className="text-xl font-display text-[#3D3A35] tabular-nums leading-none">{formatPeso(totalCollected)}</span>
               </div>
               {pricingEnabled && (
                 <div className="text-[9px] font-bold text-[#A19B91] flex flex-wrap gap-x-2 gap-y-0.5">
                   <span>1: {formatPeso(calculateCardsCost(1, room))}</span>
                   <span>· 2: {formatPeso(calculateCardsCost(2, room))}</span>
                   <span>· 4: {formatPeso(calculateCardsCost(4, room))}</span>
                 </div>
               )}
               <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[#FAF7F2]">
                 <div className="bg-[#0D9488]/10 px-2.5 py-1.5 rounded-xl">
                   <div className="text-[8px] font-black text-[#0D9488] uppercase tracking-wider">⚔️ Dikit Prize</div>
                   <div className="text-sm font-display text-[#0D9488] tabular-nums">{dikitPrize > 0 ? formatPeso(dikitPrize) : 'Not set'}</div>
                 </div>
                 <div className="bg-[#EA580C]/10 px-2.5 py-1.5 rounded-xl">
                   <div className="text-[8px] font-black text-[#EA580C] uppercase tracking-wider">🏆 Bingo Prize</div>
                   <div className="text-sm font-display text-[#EA580C] tabular-nums">{bingoPrize > 0 ? formatPeso(bingoPrize) : 'Not set'}</div>
                 </div>
               </div>
               {(totalCollected > 0 || totalPrizes > 0) && (
                 <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#FAF7F2]">
                   <span className="font-bold text-[#7A746B] uppercase tracking-wider">Balance</span>
                   <span className={`font-black tabular-nums ${potBalance >= 0 ? 'text-[#0D9488]' : 'text-[#EF4444]'}`}>
                     {potBalance >= 0 ? `+${formatPeso(potBalance)}` : `-${formatPeso(Math.abs(potBalance))}`}
                   </span>
                 </div>
               )}
             </div>
           </div>
           <div className="flex-1 p-5 xl:p-6 overflow-y-auto custom-scrollbar bg-[#FAF7F2] min-h-[200px]">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">God View (Live Boards)</h3>
                <div className="text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full uppercase">Real-time</div>
             </div>
             <div className="grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
               {Object.values(room.players).map(p => { 
                 if (!p.connected || p.activeCards.length === 0) return null;
                 return p.activeCards.map((card, cardIdx) => {
                   const marked = p.markedCells[cardIdx] || [];
                   const res = checkValidWin(card, marked, room.calledNumbers, room.mode, room.patterns);
                   const nearWin = room.calledNumbers.length > 0 && res.cellsAway <= 3;
                   
                   return (
                     <div key={`${p.id}-${cardIdx}`} className={`flex flex-col bg-white border-2 p-2.5 rounded-2xl shadow-sm transition-all ${nearWin ? 'border-[#EA580C] shadow-[0_0_15px_rgba(234,88,12,0.25)]' : 'border-[#E8E2D9]'}`}>
                        <div className="flex justify-between items-center gap-1 mb-2">
                           <div className="flex items-center gap-1.5 truncate min-w-0">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-display text-[8px] shadow-inner shrink-0" style={{ backgroundColor: p.avatarColor || '#ccc' }}>
                                 {p.nickname.substring(0,2).toUpperCase()}
                              </div>
                              <span className="font-black text-[11px] text-[#3D3A35] truncate">{p.nickname}</span>
                           </div>
                           <div className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter shrink-0 ${nearWin ? 'bg-[#EA580C] text-white animate-pulse' : 'bg-[#E8E2D9] text-[#7A746B]'}`}>
                              {res.cellsAway} Left
                           </div>
                        </div>
                        <div className="grid grid-cols-5 gap-0.5 pointer-events-none">
                           {card.map((row: number[], rIdx: number) => row.map((num: number, cIdx: number) => { 
                              const called = num === 0 || room.calledNumbers.includes(num);
                              const isMarked = num === 0 || marked.includes(num);
                              
                              return (
                                 <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center font-black text-[8px] rounded-[4px] border ${
                                    num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : 
                                    (isMarked && called) ? 'bg-[#0D9488] text-white border-[#0D9488]' : 
                                    (!isMarked && called) ? 'bg-[#0D9488]/20 border-[#0D9488]/30 text-[#3D3A35]/60' :
                                    (isMarked && !called) ? 'bg-white border-[#EA580C] text-[#EA580C]' :
                                    'bg-[#FAF7F2] border-[#E8E2D9] text-[#C5BFB6]'
                                 }`}>
                                    {num === 0 ? 'FR' : num}
                                 </div>
                              ) 
                           }))}
                        </div>
                     </div>
                   );
                 });
               })}
               {Object.values(room.players).filter(p => p.connected && p.activeCards.length > 0).length === 0 && (
                 <div className="col-span-full text-center py-8 text-[#C5BFB6] font-bold italic text-sm">Waiting for players to get cards</div>
               )}
             </div>
           </div>
           <div className="p-5 xl:p-6 border-t-2 border-[#FAF7F2] bg-[#FAF7F2]/30 max-h-44 overflow-y-auto custom-scrollbar shrink-0">
             <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-3">Hall of Fame</h3>
             <div className="space-y-2">
               {room.stats.winners.slice(-10).reverse().map((w, i) => {
                 const isEarlyBird = room.stats.winners[0] === w;
                 const wins = room.stats.winners.filter(sw => sw.name === w.name).length;

                 return (
                   <div key={i} className="flex items-center justify-between text-xs">
                     <div className="font-bold flex items-center gap-2 truncate max-w-[60%]">
                        <Trophy size={12} className={isEarlyBird ? "text-[#0D9488]" : "text-[#FACC15]"} />
                        <span className="truncate">{w.name}</span>
                        {wins > 1 && <span className="text-[8px] bg-[#EA580C] text-white px-1 rounded-sm">{wins}</span>}
                     </div>
                     <div className="text-[10px] text-[#A19B91] font-black uppercase tracking-tighter shrink-0">{w.pattern}</div>
                   </div>
                 );
               })}
               {room.stats.winners.length === 0 && (<div className="text-[10px] text-[#DED9D1] font-bold italic">Round results will appear here</div>)}
             </div>
           </div>
        </section>
      </main>

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
           <div className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl relative border-4 border-[#3D3A35]">
              <div className="flex justify-between items-center mb-8"><h2 className="text-3xl font-black uppercase tracking-tighter">Room Config</h2><button onClick={() => setShowSettings(false)} className="text-[#A19B91] hover:text-[#3D3A35]"><Plus size={24} className="rotate-45" /></button></div>
              <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Round Name</label>
                    <input value={room.roundName} onChange={e => updateSettings({ roundName: e.target.value })} className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-black text-sm focus:border-[#0D9488] outline-none" maxLength={40} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Prize Note</label>
                    <input value={room.prizeText} onChange={e => updateSettings({ prizeText: e.target.value })} placeholder="Optional note" className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-black text-sm focus:border-[#0D9488] outline-none placeholder:text-[#DED9D1]" maxLength={80} />
                  </div>
                </div>

                {/* Card Pricing & Custom Round Prizes (₱) */}
                <div className="rounded-[24px] border-2 border-[#E8E2D9] bg-[#FAF7F2] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest flex items-center gap-1.5">
                      <Coins size={13} className="text-[#EA580C]" />
                      Card Pricing &amp; Prizes (₱)
                    </span>
                    <span className="text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full tabular-nums">
                      Pot: {formatPeso(totalCollected)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[#7A746B] uppercase tracking-wider ml-1">1 Card (₱)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={room.cardPrice || ''}
                        onChange={e => updateSettings({ cardPrice: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full p-2.5 bg-white rounded-xl border-2 border-[#E8E2D9] font-black text-sm text-[#3D3A35] focus:border-[#0D9488] outline-none tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[#7A746B] uppercase tracking-wider ml-1">Bundle of 2 (₱)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={room.cardPrice ? `${room.cardPrice * 2}` : '0'}
                        value={room.bundle2Price || ''}
                        onChange={e => updateSettings({ bundle2Price: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full p-2.5 bg-white rounded-xl border-2 border-[#E8E2D9] font-black text-sm text-[#3D3A35] focus:border-[#0D9488] outline-none tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[#7A746B] uppercase tracking-wider ml-1">Bundle of 4 (₱)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={room.bundle2Price ? `${room.bundle2Price * 2}` : room.cardPrice ? `${room.cardPrice * 4}` : '0'}
                        value={room.bundle4Price || ''}
                        onChange={e => updateSettings({ bundle4Price: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full p-2.5 bg-white rounded-xl border-2 border-[#E8E2D9] font-black text-sm text-[#3D3A35] focus:border-[#0D9488] outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  {pricingEnabled && (
                    <div className="bg-white rounded-xl border border-[#E8E2D9] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-[#7A746B]">
                      <span>1 Card: <strong className="text-[#3D3A35]">{formatPeso(calculateCardsCost(1, room))}</strong></span>
                      <span>2 Cards: <strong className="text-[#3D3A35]">{formatPeso(calculateCardsCost(2, room))}</strong></span>
                      <span>3 Cards: <strong className="text-[#3D3A35]">{formatPeso(calculateCardsCost(3, room))}</strong></span>
                      <span>4 Cards: <strong className="text-[#3D3A35]">{formatPeso(calculateCardsCost(4, room))}</strong></span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E8E2D9]">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[#0D9488] uppercase tracking-wider ml-1">⚔️ Dikit Prize (₱)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={room.dikitPrize || ''}
                        onChange={e => updateSettings({ dikitPrize: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full p-2.5 bg-white rounded-xl border-2 border-[#0D9488]/40 font-black text-sm text-[#0D9488] focus:border-[#0D9488] outline-none tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[#EA580C] uppercase tracking-wider ml-1">🏆 Bingo Prize (₱)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={room.bingoPrize || ''}
                        onChange={e => updateSettings({ bingoPrize: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full p-2.5 bg-white rounded-xl border-2 border-[#EA580C]/40 font-black text-sm text-[#EA580C] focus:border-[#EA580C] outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-[#E8E2D9] px-3 py-2 flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[#7A746B]">
                      Prizes: <strong className="text-[#3D3A35] tabular-nums">{formatPeso(totalPrizes)}</strong>
                    </span>
                    <span className={`font-black tabular-nums ${potBalance >= 0 ? 'text-[#0D9488]' : 'text-[#EF4444]'}`}>
                      Balance: {potBalance >= 0 ? `+${formatPeso(potBalance)}` : `-${formatPeso(Math.abs(potBalance))}`}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Game Mode</label>
                  <div className="flex gap-2">
                    {['Bingo', 'Blackout', 'Dikit'].map(m => (
                      <button key={m} onClick={() => updateSettings({ mode: m })} className={`flex-1 py-3 rounded-xl text-xs font-black border-2 transition-all ${room.mode === m ? 'bg-[#EA580C] border-[#EA580C] text-white shadow-md' : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#A19B91]'}`}>
                        {m === 'Bingo' ? 'Standard' : m}
                      </button>
                    ))}
                  </div>
                </div>
                  {room.mode === "Bingo" && (
                    <div className="space-y-4 pt-4 border-t-2 border-[#FAF7F2]">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest">Pattern Library</label>
                            <span className="text-[8px] font-black uppercase text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full">
                              {libraryPatterns.filter(p => room.patterns.some(rp => rp.id === p.id)).length} / {libraryPatterns.length} Active
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={activateAllPatterns}
                            className="text-[9px] font-black uppercase text-white bg-[#0D9488] hover:bg-[#0F766E] px-2.5 py-1 rounded-lg transition-all shadow-sm active:scale-95"
                          >
                            Activate All
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar border-2 border-[#FAF7F2] rounded-2xl p-2 bg-[#FAF7F2]/50">
                          <div className="grid grid-cols-2 gap-2">
                            {libraryPatterns.map(pattern => {
                              const selected = room.patterns.some(item => item.id === pattern.id);
                              const isPreset = PRESET_PATTERNS.some(p => p.id === pattern.id);
                              return (
                                <div key={pattern.id} className="relative group">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      togglePattern(pattern);
                                      if (!isPreset) selectCustomPatternToEdit(pattern);
                                    }}
                                    className={`w-full px-3 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-wider transition-all relative text-left ${selected ? "bg-[#0D9488] border-[#0D9488] text-white shadow-md z-10 scale-[1.02]" : "bg-white border-[#E8E2D9] text-[#7A746B] hover:border-[#A19B91]"}`}
                                  >
                                    <span className="truncate block pr-4">{pattern.name}</span>
                                    {selected && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full" />}
                                  </button>
                                  {!isPreset && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); deleteFromLibrary(pattern.id); }}
                                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-20 shadow-lg"
                                      title="Delete Pattern from Database"
                                    >
                                      <Plus size={8} className="rotate-45" strokeWidth={5} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border-2 border-[#E8E2D9] bg-[#FAF7F2] p-4 space-y-4 shadow-inner">
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest whitespace-nowrap">Draw Pattern</span>
                            <span className="text-[8px] font-black uppercase text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full">
                              {customCells.filter(c => c !== 12).length} Selected
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              value={customName}
                              onChange={e => setCustomName(e.target.value)}
                              className="bg-white px-2 py-1 rounded-lg border-2 border-[#E8E2D9] font-bold text-[10px] focus:border-[#0D9488] outline-none w-28 sm:w-36"
                              maxLength={28}
                              placeholder="Pattern Name"
                            />
                            <button
                              type="button"
                              onClick={startNewCustomPattern}
                              title="Start Fresh Pattern"
                              className="p-1.5 rounded-lg bg-white border-2 border-[#E8E2D9] text-[#7A746B] hover:text-[#3D3A35] hover:border-[#0D9488] transition-colors"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <PatternGrid
                            cells={customCells}
                            onToggle={cell => setCustomCells(prev => {
                              if (cell === 12) return prev;
                              return prev.includes(cell) ? prev.filter(item => item !== cell) : [...prev, cell];
                            })}
                          />
                        </div>

                        {saveFeedback && (
                          <div className="text-center text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 py-1.5 px-3 rounded-xl">
                            {saveFeedback}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => saveCustomPattern(false)}
                            className="w-full bg-white border-2 border-[#3D3A35] text-[#3D3A35] py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-[#3D3A35] hover:text-white transition-all shadow-sm flex items-center justify-center gap-1"
                          >
                            Save to Database
                          </button>
                          <button
                            type="button"
                            onClick={() => saveCustomPattern(true)}
                            className="w-full bg-[#0D9488] text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-md hover:bg-[#0F766E] transition-all flex items-center justify-center gap-1"
                          >
                            {room.patterns.some(p => p.id === activeCustomId) ? (
                              <>
                                <CheckCircle2 size={12} />
                                Active in Round
                              </>
                            ) : (
                              "Save & Add to Round"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                 <div className="pt-4 border-t-2 border-[#FAF7F2] grid grid-cols-2 gap-3"><div className="flex flex-col bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest mb-2">Hall Ambience</span><button onClick={() => updateSettings({ ambienceEnabled: !room.ambienceEnabled })} className={`w-full py-2 rounded-xl text-[10px] font-black uppercase transition-all ${room.ambienceEnabled ? 'bg-[#0D9488] text-white' : 'bg-white text-[#A19B91] border-2 border-[#DED9D1]'}`}>{room.ambienceEnabled ? '🔊 Active' : '🔇 Muted'}</button></div><div className="flex flex-col bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><div className="flex justify-between items-center mb-2"><span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest">Voice Engine</span><button type="button" onClick={() => previewVoice(room.voiceMode || 'robotic')} className="text-[9px] font-black uppercase text-white bg-[#0D9488] hover:bg-[#0F766E] px-2 py-0.5 rounded-lg transition-all shadow-sm active:scale-95 flex items-center gap-1" title="Test selected voice"><Volume2 size={10} />Test</button></div><select value={room.voiceMode || 'robotic'} onChange={e => updateSettings({ voiceMode: e.target.value })} className="w-full py-2 px-1 bg-white rounded-xl text-[10px] font-black uppercase border-2 border-[#DED9D1] outline-none cursor-pointer">
  <option value="robotic">🤖 Robotic (Browser TTS)</option>
  <optgroup label="United States Natural Voices">
    {NATURAL_VOICES.filter(v => v.region === 'United States').map(v => (
      <option key={v.id} value={v.id}>{v.label}</option>
    ))}
  </optgroup>
  <optgroup label="United Kingdom Natural Voices">
    {NATURAL_VOICES.filter(v => v.region === 'United Kingdom').map(v => (
      <option key={v.id} value={v.id}>{v.label}</option>
    ))}
  </optgroup>
  <optgroup label="Australia & Canada Natural Voices">
    {NATURAL_VOICES.filter(v => v.region === 'Australia' || v.region === 'Canada').map(v => (
      <option key={v.id} value={v.id}>{v.label}</option>
    ))}
  </optgroup>
  <optgroup label="Philippines & Ireland & India">
    {NATURAL_VOICES.filter(v => ['Philippines', 'Ireland', 'India'].includes(v.region)).map(v => (
      <option key={v.id} value={v.id}>{v.label}</option>
    ))}
  </optgroup>
</select></div></div>
                 <div className="pt-4 border-t-2 border-[#FAF7F2]"><div className="flex items-center justify-between bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><div className="flex flex-col"><span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest">Mystery Mode</span><span className="text-[10px] font-bold text-[#A19B91] uppercase tracking-tighter">Hide winning pattern from screens</span></div><button onClick={() => updateSettings({ hidePattern: !room.hidePattern })} className={`w-14 h-8 rounded-full transition-all relative ${room.hidePattern ? 'bg-[#0D9488]' : 'bg-[#DED9D1]'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${room.hidePattern ? 'left-7' : 'left-1'}`} /></button></div></div>
              </div><button onClick={() => setShowSettings(false)} className="mt-8 w-full bg-[#3D3A35] text-white py-4 rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl active:scale-[0.98] transition-all">Save & Close</button></div></div>)}

      {room.claims.length > 0 && !winner && (
        <div className="fixed inset-0 bg-[#3D3A35]/80 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-[36px] w-full max-w-lg max-h-[92vh] overflow-hidden shadow-2xl flex flex-col border-[6px] border-[#EA580C]">
            <div className="bg-[#EA580C] text-white p-5 sm:p-6 text-center relative shrink-0">
              <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest mb-2">
                Claim {(room.verifiedWinners?.length || 0) + 1} of {(room.claims.length || 0) + (room.verifiedWinners?.length || 0)}
              </div>
              <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter italic drop-shadow-md">Bingo Claim!</h2>
              <p className="text-base sm:text-lg font-bold opacity-90 mt-0.5">{room.claims[0].playerName} called Bingo (Card {(room.claims[0].cardIndex ?? 0) + 1})</p>
            </div>
            <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col items-center gap-4">
              <div className="bg-[#FAF7F2] p-4 sm:p-5 rounded-[28px] border-4 border-[#E8E2D9] shadow-inner w-full max-w-[300px]">
                <div className="grid grid-cols-5 gap-1.5">
                  {['B','I','N','G','O'].map(l => (
                    <div key={l} className="text-center font-black text-[#EA580C] text-base sm:text-lg pb-1">{l}</div>
                  ))}
                  {room.claims[0].card.map((row: number[], rIdx: number) =>
                    row.map((num: number, cIdx: number) => {
                      const called = num === 0 || room.calledNumbers.includes(num);
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className={`aspect-square flex items-center justify-center font-display text-base sm:text-lg rounded-xl border-2 transition-all ${
                            num === 0
                              ? 'bg-[#3D3A35] text-white border-[#3D3A35]'
                              : called
                                ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-md'
                                : 'bg-white border-[#E8E2D9] text-[#A19B91]'
                          }`}
                        >
                          {num === 0 ? 'FR' : num}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="w-full bg-[#FAF7F2] py-3 px-5 rounded-2xl border-2 border-[#E8E2D9] flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">Claimed Pattern</span>
                  <span className="text-xl font-black text-[#EA580C] uppercase italic leading-tight">{room.claims[0].pattern}</span>
                </div>
                <Trophy className="text-[#EA580C] shrink-0" size={32} />
              </div>
            </div>
            <div className="p-5 bg-[#FAF7F2] border-t-4 border-[#E8E2D9] flex gap-3 shrink-0">
              <button onClick={() => verifyClaim(room.claims[0].id, false)} className="flex-1 py-4 bg-white border-4 border-[#E8E2D9] text-[#7A746B] hover:text-[#3D3A35] rounded-2xl font-black text-base uppercase tracking-widest active:translate-y-1 transition-all">
                Reject
              </button>
              <button onClick={() => verifyClaim(room.claims[0].id, true)} className="flex-1 py-4 bg-[#0D9488] text-white rounded-2xl font-black text-lg sm:text-xl uppercase tracking-widest shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none transition-all">
                Verify & Win
              </button>
            </div>
          </div>
        </div>
      )}

      {(multiBingoPending || room.multiBingoPending) && (room.verifiedWinners?.length || 0) >= 3 && !winner && (
        <div className="fixed inset-0 bg-[#3D3A35]/85 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-[40px] w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col border-[8px] border-[#FACC15] max-h-[90vh]">
            <div className="bg-gradient-to-r from-[#EA580C] to-[#FACC15] text-white p-6 sm:p-8 text-center relative shrink-0">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] bg-black/20 px-3 py-1 rounded-full inline-block mb-2">
                Multiple Winners Detected
              </span>
              <h2 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter italic drop-shadow-md">
                3+ Bingo Winners Tie!
              </h2>
              <p className="text-sm sm:text-base font-bold opacity-90 mt-1">
                {room.verifiedWinners.length} cards achieved Bingo on this call.
                {bingoPrize > 0 && (
                  <span className="ml-1.5 inline-block bg-black/20 px-2.5 py-0.5 rounded-full">
                    Prize: {formatPeso(bingoPrize)} ({formatPeso(bingoPrize / room.verifiedWinners.length)} each)
                  </span>
                )}
              </p>
            </div>

            {/* Grid of All Verified Winning Cards */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 bg-[#FAF7F2]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {room.verifiedWinners.map((w: any, idx: number) => (
                  <div key={w.id || idx} className="bg-white p-4 rounded-3xl border-2 border-[#E8E2D9] shadow-sm flex flex-col items-center">
                    <div className="w-full flex items-center justify-between mb-2">
                      <span className="font-black text-sm text-[#3D3A35] truncate">{w.playerName}</span>
                      <span className="text-[10px] font-bold text-[#EA580C] bg-[#EA580C]/10 px-2 py-0.5 rounded-full shrink-0">
                        Card {(w.cardIndex ?? 0) + 1}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-[#7A746B] uppercase tracking-wider mb-2">
                      Pattern: <span className="text-[#EA580C] font-black">{w.pattern || 'Bingo'}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 w-full max-w-[200px]">
                      {['B','I','N','G','O'].map(l => (
                        <div key={l} className="text-center font-black text-[10px] text-[#EA580C]">{l}</div>
                      ))}
                      {w.card.map((row: number[], rIdx: number) => row.map((num: number, cIdx: number) => {
                        const called = num === 0 || (room.calledNumbers || []).includes(num);
                        return (
                          <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center font-display text-xs rounded-lg border transition-all ${
                            num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : called ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-sm font-bold' : 'bg-white border-[#E8E2D9] text-[#A19B91]'
                          }`}>
                            {num === 0 ? 'FR' : num}
                          </div>
                        );
                      }))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settle vs Continue Controls */}
            <div className="p-6 bg-white border-t-4 border-[#E8E2D9] flex flex-col sm:flex-row gap-4 shrink-0">
              <button
                onClick={() => settleMultiBingo('continue')}
                className="flex-1 py-4 px-6 bg-[#FAF7F2] border-4 border-[#E8E2D9] text-[#7A746B] hover:text-[#3D3A35] rounded-2xl font-black text-base uppercase tracking-wider active:translate-y-1 transition-all flex items-center justify-center gap-2"
              >
                <Play size={20} fill="currentColor" />
                <span>Continue (Break Tie)</span>
              </button>
              <button
                onClick={() => settleMultiBingo('settle')}
                className="flex-1 py-4 px-6 bg-[#0D9488] text-white rounded-2xl font-black text-xl uppercase tracking-wider shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={24} />
                <span>Settle ({room.verifiedWinners.length} Winners)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {dikitAlert && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[55] bg-[#0D9488] text-white p-5 rounded-[28px] shadow-2xl border-4 border-white flex flex-col items-center gap-3 w-[calc(100vw-2rem)] max-w-sm sm:max-w-md max-h-[80vh] overflow-y-auto custom-scrollbar"
          >
            <div className="text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">
                {dikitAlert.length > 1 ? 'MULTIPLE DIKIT WINS!' : 'Dikit Sidebet Win!'}
              </div>
              <div className="text-xl sm:text-2xl font-black italic">{dikitAlert.map((w: any) => w.playerName).join(' & ')}</div>
              {dikitPrize > 0 && (
                <div className="inline-block mt-1.5 bg-white text-[#0D9488] px-3 py-0.5 rounded-full text-xs font-black tabular-nums shadow-sm">
                  Prize: {formatPeso(dikitPrize)}
                  {dikitAlert.length > 1 && ` (${formatPeso(dikitPrize / dikitAlert.length)} each)`}
                </div>
              )}
            </div>
            <div className="flex gap-3 overflow-x-auto w-full pb-2 px-1 snap-x custom-scrollbar justify-center">
              {dikitAlert.map((alert: any, aIdx: number) => (
                <div key={alert.id || aIdx} className="bg-white/10 p-3 rounded-2xl border border-white/20 shrink-0 snap-center">
                  <div className="text-center text-xs font-bold mb-1.5">
                    {alert.playerName} <span className="opacity-75">· Card {(alert.cardIndex ?? 0) + 1}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {['B','I','N','G','O'].map(l => (
                      <div key={l} className="text-center font-black text-[9px] text-white/75">{l}</div>
                    ))}
                    {alert.card.map((row: number[], rIdx: number) =>
                      row.map((num: number, cIdx: number) => {
                        const called = num === 0 || room.calledNumbers.includes(num);
                        return (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            className={`w-7 h-7 flex items-center justify-center font-black text-[10px] rounded-md border ${
                              num === 0
                                ? 'bg-white text-[#0D9488]'
                                : called
                                  ? 'bg-white text-[#0D9488] shadow-md'
                                  : 'bg-[#0D9488]/20 border-white/20 text-white/40'
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
            <button onClick={dismissDikit} className="text-xs font-black uppercase tracking-widest bg-white/20 hover:bg-white/30 px-6 py-2 rounded-full transition-all">
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-[60] p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[44px] border-[8px] border-[#FACC15] w-full max-w-4xl p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/10 to-transparent opacity-50 pointer-events-none" />
              <div className="relative z-10 flex flex-col min-h-0 flex-1">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-gradient-to-br from-[#FACC15] to-[#EA580C] rounded-full flex items-center justify-center mb-3 shadow-xl shrink-0">
                  <Trophy className="text-white" size={36} />
                </div>
                <h2 className="text-4xl sm:text-5xl font-display text-[#3D3A35] mb-1 uppercase italic tracking-tighter shrink-0">
                  {winner.length > 1 ? `${winner.length} BINGO WINNERS!` : 'BINGO WINNER!'}
                </h2>
                <p className="text-lg sm:text-2xl font-black text-[#0D9488] mb-2 leading-tight shrink-0">
                  {winner.map((w: any) => w.playerName).join(', ')}
                </p>
                {bingoPrize > 0 && (
                  <div className="inline-flex items-center justify-center gap-1.5 mx-auto mb-2.5 px-4 py-1 rounded-full bg-[#EA580C]/10 border border-[#EA580C]/30 text-sm font-black text-[#EA580C] tabular-nums shrink-0">
                    🏆 Prize: {formatPeso(bingoPrize)}
                    {winner.length > 1 && <span className="text-xs font-bold">({formatPeso(bingoPrize / winner.length)} each)</span>}
                  </div>
                )}
                {room.status === 'next_round' && (
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#A19B91] mb-3 shrink-0">
                    Next round starts in <Countdown endsAt={room.nextRoundEndsAt} />
                  </p>
                )}
                <div className="flex-1 overflow-y-auto min-h-0 mb-5 custom-scrollbar px-1">
                  <div className="flex flex-wrap gap-5 justify-center py-2">
                    {winner.map((w: any, wIdx: number) => (
                      <div key={w.id || wIdx} className="bg-[#FAF7F2] p-4 sm:p-5 rounded-[28px] border-2 border-[#E8E2D9] shadow-sm w-full max-w-[260px]">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-sm font-black text-[#3D3A35] truncate">{w.playerName}</span>
                          <span className="text-[10px] font-bold text-[#EA580C] bg-[#EA580C]/10 px-2 py-0.5 rounded-full shrink-0">
                            Card {(w.cardIndex ?? 0) + 1} · {w.pattern || 'Bingo'}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {['B','I','N','G','O'].map(l => (
                            <div key={l} className="text-center font-black text-[10px] text-[#EA580C]">{l}</div>
                          ))}
                          {w.card.map((row: number[], rIdx: number) =>
                            row.map((num: number, cIdx: number) => {
                              const called = num === 0 || room.calledNumbers.includes(num);
                              return (
                                <div
                                  key={`${rIdx}-${cIdx}`}
                                  className={`aspect-square flex items-center justify-center font-display text-xs rounded-lg border-2 transition-all ${
                                    num === 0
                                      ? 'bg-[#3D3A35] text-white border-[#3D3A35]'
                                      : called
                                        ? 'bg-[#EA580C] text-white border-[#EA580C]'
                                        : 'bg-white border-[#E8E2D9] text-[#A19B91]'
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
                </div>
                <button onClick={dismissWinner} className="w-full py-4 bg-[#3D3A35] text-white rounded-2xl font-black text-base sm:text-lg uppercase tracking-[0.2em] hover:bg-black active:scale-95 transition-all shadow-xl shrink-0">
                  Close & Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
