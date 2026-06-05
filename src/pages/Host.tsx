import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BallCaller } from '../components/BallCaller';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { Maximize2, Play, Square, Settings, Share2, Copy, Users, Ticket, Monitor, Trophy, Plus, Eye, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PRESET_PATTERNS, type BingoPattern, getBallLetter, checkValidWin } from '../lib/bingo';
import { SOUNDS, setVoiceBaseUrl } from '../lib/sounds';

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
  const dismissWinner = useGameStore(s => s.dismissWinner);
  const dismissDikit = useGameStore(s => s.dismissDikit);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);

  const [showSettings, setShowSettings] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [customName, setCustomName] = useState('Custom Pattern');
  const [customCells, setCustomCells] = useState<number[]>([12]);
  const [voiceUrl, setVoiceUrl] = useState(localStorage.getItem('bingo_voice_url') || '');

  useEffect(() => {
    localStorage.setItem('bingo_voice_url', voiceUrl);
    setVoiceBaseUrl(voiceUrl);
  }, [voiceUrl]);

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
         const voiceUrlParam = localStorage.getItem('bingo_voice_url') || '';
         setVoiceBaseUrl(voiceUrlParam);
         import('../lib/sounds').then(({ playVoiceBall }) => {
            const played = playVoiceBall(latestBall, room?.voiceMode || 'robotic', voiceUrlParam);
            if (!played && 'speechSynthesis' in window) {
               window.speechSynthesis.cancel();
               const msg = new SpeechSynthesisUtterance(`${getBallLetter(latestBall)}... ${latestBall}`);
               msg.rate = 0.85;
               window.speechSynthesis.speak(msg);
            }
         });
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

  const togglePattern = (pattern: BingoPattern) => {
    const exists = room.patterns.some(item => item.id === pattern.id);
    const next = exists
      ? room.patterns.filter(item => item.id !== pattern.id)
      : [...room.patterns, pattern];
    updateSettings({ patterns: next });
  };

  const addCustomPattern = () => {
    const cells = [...new Set([...customCells, 12])].sort((a, b) => a - b);
    const newPattern: BingoPattern = {
      id: `custom-${Date.now()}`,
      name: customName.trim() || 'Custom Pattern',
      type: 'custom',
      match: 'cells',
      cells
    };
    
    updateSettings({ patterns: [...room.patterns, newPattern] });
    saveGlobalPattern(newPattern);
    setCustomName('Custom Pattern');
    setCustomCells([12]);
  };

  const deleteFromLibrary = (id: string) => {
    deleteGlobalPattern(id);
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-sans text-[#3D3A35] overflow-hidden relative">
      {!socket?.connected && (
         <div className="fixed inset-0 z-[100] bg-[#3D3A35]/80 backdrop-blur-md flex items-center justify-center p-6 text-center">
            <div className="bg-white rounded-[32px] p-8 border-4 border-[#0D9488] shadow-2xl max-w-xs">
               <div className="w-12 h-12 border-4 border-[#0D9488] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
               <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Restoring Link</h2>
               <p className="text-sm font-bold text-[#7A746B]">Host connection dropped. Attempting to rejoin the booth...</p>
            </div>
         </div>
      )}

      <header className="bg-white border-b-2 border-[#E8E2D9] h-16 px-6 flex items-center justify-between sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-6">
          <div className="bg-[#F3EFE9] border border-[#DED9D1] text-[#3D3A35] font-black text-xl px-4 py-1.5 rounded-xl tracking-wider tabular-nums flex items-center gap-3">
            <span className="text-[10px] font-bold text-[#7A746B] uppercase tracking-widest hidden sm:inline">Room</span>
            {room.id}
          </div>
          <div className="hidden md:flex items-center gap-1">
             <button onClick={handleCopy} className="p-2 text-[#A19B91] hover:text-[#3D3A35] transition-colors" title={copyLabel}><Copy size={18} /></button>
             <button onClick={openDisplay} className="flex items-center gap-2 px-3 py-1.5 bg-[#0D9488]/10 text-[#0D9488] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0D9488]/20 transition-all"><Monitor size={16} />TV Mode</button>
             <button 
               onClick={() => window.open(`${window.location.origin}/host/${room.id}/grid`, '_blank')} 
               className="flex items-center gap-2 px-3 py-1.5 bg-[#EA580C]/10 text-[#EA580C] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#EA580C]/20 transition-all"
             >
               <LayoutGrid size={16} />God View
             </button>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end leading-none">
            <span className="text-xs font-black text-[#3D3A35] mb-1">{me?.nickname}</span>
            <span className="text-[10px] text-[#0D9488] font-bold uppercase flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] inline-block animate-pulse" />Host Dashboard</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 bg-[#F3EFE9] text-[#7A746B] border border-[#DED9D1] rounded-xl flex items-center justify-center hover:bg-[#E8E2D9] transition-colors"><Settings size={20} /></button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-[320px_1fr_360px] gap-0 overflow-hidden">
        <section className="bg-white border-r-2 border-[#E8E2D9] p-6 flex flex-col gap-6 overflow-y-auto">
           <div><h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Tactical Controls</h3><div className="grid grid-cols-1 gap-3">{room.status === 'waiting' && (<button onClick={startGame} className="w-full py-5 bg-[#0D9488] text-white rounded-2xl font-black text-xl shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none transition-all uppercase tracking-widest flex items-center justify-center gap-3"><Play size={24} fill="currentColor" />Lobby Start</button>)}{(room.status === 'playing' || room.status === 'paused') && (<div className="flex flex-col gap-3"><div className="grid grid-cols-2 gap-3"><button onClick={pauseGame} disabled={room.status === 'paused'} className={`py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all border-2 ${room.status === 'paused' ? 'bg-[#F3EFE9] border-[#DED9D1] text-[#A19B91]' : 'bg-[#EF4444] border-[#EF4444] text-white shadow-[0_4px_0_#B91C1C] active:translate-y-[4px] active:shadow-none'}`}><Square size={18} fill="currentColor" className="inline mr-2" />Emergency Stop</button><button onClick={resumeGame} disabled={room.status === 'playing'} className={`py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all border-2 ${room.status === 'playing' ? 'bg-[#F3EFE9] border-[#DED9D1] text-[#A19B91]' : 'bg-[#0D9488] border-[#0D9488] text-white shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none'}`}><Play size={18} fill="currentColor" className="inline mr-2" />Safety Resume</button></div><button onClick={resetGame} className="w-full py-3 bg-[#FAF7F2] border-2 border-[#E8E2D9] text-[#A19B91] rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#E8E2D9] hover:text-[#3D3A35] transition-all">Abort Round / Reset</button></div>)}{room.status === 'next_round' && (<button onClick={startNextRound} className="w-full py-5 bg-[#FACC15] text-[#854D0E] rounded-2xl font-black text-xl shadow-[0_6px_0_#A16207] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-tighter flex flex-col items-center leading-none"><span className="text-[10px] mb-1">Manual Override</span>Next Round Now</button>)}</div></div>
           <div className="pt-6 border-t-2 border-[#FAF7F2]"><h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Ball Calling</h3><div className="space-y-4"><div className="bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest block mb-2">Auto-Call Speed (seconds)</label><div className="flex gap-2">{[0, 3, 5].map(speed => (<button key={speed} onClick={() => updateSettings({ autoCallSpeed: speed })} className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${room.autoCallSpeed === speed ? 'bg-[#3D3A35] border-[#3D3A35] text-white shadow-md' : 'bg-white border-[#DED9D1] text-[#A19B91] hover:border-[#A19B91]'}`}>{speed === 0 ? 'Off' : `${speed}s`}</button>))}<input type="number" min="0" placeholder="Custom" value={room.autoCallSpeed || ''} onChange={e => updateSettings({ autoCallSpeed: parseInt(e.target.value) || 0 })} className="w-16 py-2 px-1 text-center rounded-xl text-xs font-black border-2 bg-white border-[#DED9D1] text-[#3D3A35] focus:border-[#0D9488] outline-none" /></div></div>{room.status === 'playing' && room.autoCallSpeed === 0 && (<button onClick={callNextBall} className="w-full py-8 bg-[#3D3A35] text-white rounded-[32px] font-black text-2xl shadow-[0_8px_0_#1C1917] active:translate-y-[8px] active:shadow-none transition-all uppercase tracking-widest">Call Ball</button>)}</div></div>
           <div className="mt-auto pt-6 border-t-2 border-[#FAF7F2]"><div className="bg-[#FDFBF7] rounded-2xl p-4 border border-[#E8E2D9] text-center"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x180&data=${encodeURIComponent(joinUrl)}`} alt="QR" className="mx-auto w-32 h-32 mb-3" /><p className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest">Join via Link</p><p className="text-xs font-bold text-[#3D3A35] truncate mt-1">{joinUrl}</p></div></div>
        </section>

        <section className="bg-[#FAF7F2] p-8 flex flex-col gap-8 overflow-y-auto">
           <div className="grid grid-cols-[1fr_320px] gap-8 shrink-0">
              <div className="bg-white rounded-[40px] border-4 border-[#E8E2D9] p-8 shadow-sm flex flex-col justify-center items-center relative overflow-hidden">
                 <div className="absolute top-4 left-6 text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Latest Call</div>
                 <AnimatePresence mode="wait">
                    {latestBall ? (
                       <motion.div key={latestBall} initial={{ scale: 0.5, y: 50, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} className="flex flex-col items-center">
                          <div className="w-48 h-48 rounded-full bg-[#FACC15] border-[8px] border-white outline outline-8 outline-[#FACC15] shadow-xl flex flex-col items-center justify-center text-[#854D0E] relative">
                            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/40 pointer-events-none" />
                            <div className="absolute top-6 left-8 w-12 h-6 bg-white/30 rounded-[100%] blur-sm -rotate-45 pointer-events-none" />
                            <span className="text-2xl font-display leading-none mb-1 z-10">{getBallLetter(latestBall)}</span>
                            <span className="text-8xl font-display leading-none tracking-tighter z-10">{latestBall}</span>
                          </div>
                       </motion.div>
                    ) : (<div className="text-xl font-black text-[#DED9D1] uppercase tracking-widest">Awaiting First Ball</div>)}
                 </AnimatePresence>
              </div>
              <div className="bg-white rounded-[40px] border-4 border-[#E8E2D9] p-6 shadow-sm flex flex-col"><div className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em] mb-4 text-center">Active Pattern</div><div className="flex-1 flex items-center justify-center">{!room.hidePattern ? (<PatternVisualizer patterns={room.patterns} className="scale-125 origin-center" />) : (<div className="text-[#DED9D1] flex flex-col items-center gap-2"><Eye size={32} className="opacity-30" /><span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight px-4">Pattern Hidden from Screens</span></div>)}</div><div className="mt-4 pt-4 border-t-2 border-[#FAF7F2] text-center"><div className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest leading-none mb-1">Mode</div><div className="text-lg font-black text-[#EA580C] uppercase tracking-tighter">{room.mode}</div></div></div>
           </div>
           <div className="bg-white rounded-[40px] border-4 border-[#E8E2D9] p-8 shadow-sm flex-1 min-h-0 overflow-y-auto"><div className="flex justify-between items-center mb-6"><h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Master Number Board</h3><div className="text-xs font-black text-[#EA580C] tabular-nums bg-[#EA580C]/10 px-3 py-1 rounded-full">{room.calledNumbers.length} / 75</div></div><div className="grid grid-cols-15 gap-2">{Array.from({length: 75}, (_, i) => i + 1).map(num => (<div key={num} className={`aspect-square flex items-center justify-center text-lg font-display rounded-lg border-2 transition-all relative overflow-hidden ${room.calledNumbers.includes(num) ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm' : 'bg-[#FAF7F2] text-[#DED9D1] border-[#E8E2D9]'}`}>{room.calledNumbers.includes(num) && (<div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />)}{num}</div>))}</div></div>
        </section>

        <section className="bg-white border-l-2 border-[#E8E2D9] flex flex-col overflow-hidden">
           <div className="p-6 border-b-2 border-[#FAF7F2] bg-[#FAF7F2]/30"><h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Session Stats</h3><div className="grid grid-cols-2 gap-4"><div className="bg-white p-4 rounded-2xl border-2 border-[#E8E2D9] shadow-sm"><Ticket size={20} className="text-[#EA580C] mb-2" /><div className="text-2xl font-display tabular-nums">{room.stats.totalCardsSold}</div><div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">Cards Sold</div></div><div className="bg-white p-4 rounded-2xl border-2 border-[#E8E2D9] shadow-sm"><Users size={20} className="text-[#0D9488] mb-2" /><div className="text-2xl font-display tabular-nums">{Object.values(room.players).length}</div><div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">Players</div></div></div></div>
           <div className="flex-1 p-6 overflow-y-auto bg-[#FAF7F2]">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">God View (Live Boards)</h3>
                <div className="text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full uppercase">Real-time</div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {Object.values(room.players).map(p => { 
                 if (!p.connected || p.activeCards.length === 0) return null;
                 return p.activeCards.map((card, cardIdx) => {
                   const marked = p.markedCells[cardIdx] || [];
                   const res = checkValidWin(card, marked, room.calledNumbers, room.mode, room.patterns);
                   const nearWin = res.cellsAway <= 3;
                   
                   return (
                     <div key={`${p.id}-${cardIdx}`} className={`flex flex-col bg-white border-2 p-3 rounded-2xl shadow-sm transition-all ${nearWin ? 'border-[#EA580C] shadow-[0_0_15px_rgba(234,88,12,0.3)]' : 'border-[#E8E2D9]'}`}>
                        <div className="flex justify-between items-center mb-2">
                           <div className="flex items-center gap-2 truncate">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-display text-[8px] shadow-inner shrink-0" style={{ backgroundColor: p.avatarColor || '#ccc' }}>
                                 {p.nickname.substring(0,2).toUpperCase()}
                              </div>
                              <span className="font-black text-xs text-[#3D3A35] truncate">{p.nickname}</span>
                           </div>
                           <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter shrink-0 ${nearWin ? 'bg-[#EA580C] text-white animate-pulse' : 'bg-[#E8E2D9] text-[#7A746B]'}`}>
                              {res.cellsAway} Left
                           </div>
                        </div>
                        <div className="grid grid-cols-5 gap-0.5 pointer-events-none">
                           {card.map((row: any)=> row.map((num: any, idx: number) => { 
                              const called = num === 0 || room.calledNumbers.includes(num);
                              const isMarked = num === 0 || marked.includes(num);
                              
                              return (
                                 <div key={idx} className={`aspect-square flex items-center justify-center font-black text-[8px] rounded-[4px] border ${
                                    num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : 
                                    (isMarked && called) ? 'bg-[#0D9488] text-white border-[#0D9488]' : 
                                    (!isMarked && called) ? 'bg-[#0D9488]/20 border-[#0D9488]/30 text-[#3D3A35]/50' :
                                    (isMarked && !called) ? 'bg-white border-[#EA580C] text-[#EA580C]' :
                                    'bg-[#FAF7F2] border-[#E8E2D9] text-[#DED9D1]'
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
                 <div className="col-span-full text-center py-8 text-[#DED9D1] font-bold italic text-sm">Waiting for players to get cards</div>
               )}
             </div>
           </div>
           <div className="p-6 border-t-2 border-[#FAF7F2] bg-[#FAF7F2]/30 max-h-48 overflow-y-auto">
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
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar"><div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Round Name</label><input value={room.roundName} onChange={e => updateSettings({ roundName: e.target.value })} className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-black text-sm focus:border-[#0D9488] outline-none" maxLength={40} /></div><div className="space-y-1.5"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Prize Info</label><input value={room.prizeText} onChange={e => updateSettings({ prizeText: e.target.value })} placeholder="Optional prize" className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-black text-sm focus:border-[#0D9488] outline-none placeholder:text-[#DED9D1]" maxLength={80} /></div></div><div className="space-y-1.5"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Game Mode</label><div className="flex gap-2">{['Bingo', 'Blackout', 'Dikit'].map(m => (<button key={m} onClick={() => updateSettings({ mode: m })} className={`flex-1 py-3 rounded-xl text-xs font-black border-2 transition-all ${room.mode === m ? 'bg-[#EA580C] border-[#EA580C] text-white shadow-md' : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#A19B91]'}`}>{m === 'Bingo' ? 'Standard' : m}</button>))}</div></div>
                 {room.mode === 'Bingo' && (<div className="space-y-4 pt-4 border-t-2 border-[#FAF7F2]"><div className="space-y-2"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Pattern Library</label><div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar border-2 border-[#FAF7F2] rounded-2xl p-2 bg-[#FAF7F2]/50"><div className="grid grid-cols-2 gap-2">{[...PRESET_PATTERNS, ...globalPatterns].map(pattern => { const selected = room.patterns.some(item => item.id === pattern.id); const isPreset = PRESET_PATTERNS.some(p => p.id === pattern.id); return (<div key={pattern.id} className="relative group"><button type="button" onClick={() => togglePattern(pattern)} className={`w-full px-3 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-wider transition-all relative ${selected ? 'bg-[#0D9488] border-[#0D9488] text-white shadow-md z-10 scale-[1.02]' : 'bg-white border-[#E8E2D9] text-[#7A746B] hover:border-[#A19B91]'}`}>{pattern.name}{selected && <div className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full" />}</button>{!isPreset && (<button onClick={(e) => { e.stopPropagation(); deleteFromLibrary(pattern.id); }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg"><Plus size={8} className="rotate-45" strokeWidth={5} /></button>)}</div>); })}</div></div></div><div className="rounded-[24px] border-2 border-[#E8E2D9] bg-[#FAF7F2] p-4 space-y-4 shadow-inner"><div className="flex justify-between items-center"><span className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest">Draw Custom</span><input value={customName} onChange={e => setCustomName(e.target.value)} className="bg-white px-3 py-1 rounded-lg border-2 border-[#E8E2D9] font-bold text-[10px] focus:border-[#0D9488] outline-none" maxLength={28} placeholder="Pattern Name" /></div><div className="flex justify-center"><PatternGrid cells={customCells} onToggle={cell => setCustomCells(prev => { if (cell === 12) return prev; return prev.includes(cell) ? prev.filter(item => item !== cell) : [...prev, cell]; })} /></div><button type="button" onClick={addCustomPattern} className="w-full bg-[#3D3A35] text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest active:translate-y-1 shadow-md">Add to Round</button></div></div>)}
                 <div className="pt-4 border-t-2 border-[#FAF7F2] grid grid-cols-2 gap-3"><div className="flex flex-col bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest mb-2">Hall Ambience</span><button onClick={() => updateSettings({ ambienceEnabled: !room.ambienceEnabled })} className={`w-full py-2 rounded-xl text-[10px] font-black uppercase transition-all ${room.ambienceEnabled ? 'bg-[#0D9488] text-white' : 'bg-white text-[#A19B91] border-2 border-[#DED9D1]'}`}>{room.ambienceEnabled ? '🔊 Active' : '🔇 Muted'}</button></div><div className="flex flex-col bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest mb-2">Voice Engine</span><select value={room.voiceMode} onChange={e => updateSettings({ voiceMode: e.target.value })} className="w-full py-2 bg-white rounded-xl text-[10px] font-black uppercase border-2 border-[#DED9D1] outline-none">
  <option value="robotic">🤖 Robotic</option>
  <option value="custom">👤 Custom / Local</option>
  <option value="ai_sarcastic">😈 Sarcastic AI</option>
  <option value="ai_vegas">🎲 Vegas AI</option>
  <option value="ai_lounge">🍸 Lounge AI</option>
</select></div></div>
                 <div className="pt-4 border-t-2 border-[#FAF7F2]"><div className="flex items-center justify-between bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]"><div className="flex flex-col"><span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest">Mystery Mode</span><span className="text-[10px] font-bold text-[#A19B91] uppercase tracking-tighter">Hide winning pattern from screens</span></div><button onClick={() => updateSettings({ hidePattern: !room.hidePattern })} className={`w-14 h-8 rounded-full transition-all relative ${room.hidePattern ? 'bg-[#0D9488]' : 'bg-[#DED9D1]'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${room.hidePattern ? 'left-7' : 'left-1'}`} /></button></div></div>
                 {room.voiceMode === 'custom' && (<div className="pt-4 border-t-2 border-[#FAF7F2]"><div className="space-y-1.5"><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Custom Voice URL Template</label><input value={voiceUrl} onChange={e => setVoiceUrl(e.target.value)} placeholder="https://site.com/voices/{filename}" className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-bold text-xs focus:border-[#0D9488] outline-none placeholder:text-[#DED9D1]" /><p className="text-[8px] text-[#A19B91] font-bold uppercase leading-tight mt-1 px-1">Use <span className="text-[#EA580C]">{'{filename}'}</span> for B12.mp3 or <span className="text-[#EA580C]">{'{number}'}</span> for 12.</p></div></div>)}
              </div><button onClick={() => setShowSettings(false)} className="mt-8 w-full bg-[#3D3A35] text-white py-4 rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl active:scale-[0.98] transition-all">Save & Close</button></div></div>)}

      {room.claims.length > 0 && !winner && (
        <div className="fixed inset-0 bg-[#3D3A35]/80 backdrop-blur-md flex justify-center items-center z-50 p-4"><div className="bg-white rounded-[48px] w-full max-w-xl overflow-hidden shadow-2xl flex flex-col border-[8px] border-[#EA580C]"><div className="bg-[#EA580C] text-white p-8 text-center relative"><div className="absolute top-4 right-6 bg-white/20 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">Claim {room.verifiedWinners?.length + 1 || 1} of {(room.claims.length || 0) + (room.verifiedWinners?.length || 0)}</div><h2 className="text-5xl font-black uppercase tracking-tighter italic drop-shadow-md mb-2">Bingo Claim!</h2><p className="text-xl font-bold opacity-90">{room.claims[0].playerName} called Bingo</p></div><div className="p-8 overflow-y-auto flex flex-col items-center gap-8"><div className="bg-[#FAF7F2] p-8 rounded-[40px] border-4 border-[#E8E2D9] shadow-inner scale-110"><div className="grid grid-cols-5 gap-2">{['B','I','N','G','O'].map(l => <div key={l} className="text-center font-black text-[#A19B91] text-xl mb-2">{l}</div>)}{room.claims[0].card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-14 h-14 flex items-center justify-center font-black text-xl rounded-xl border-2 transition-all ${num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : called ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg scale-105' : 'bg-white border-[#E8E2D9] text-[#DED9D1]'}`}>{num === 0 ? 'FR' : num}</div>) }))}</div></div><div className="w-full bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9] flex justify-between items-center px-8"><div className="flex flex-col"><span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">Claimed Pattern</span><span className="text-2xl font-black text-[#EA580C] uppercase italic leading-none">{room.claims[0].pattern}</span></div><Trophy className="text-[#EA580C]" size={40} /></div></div><div className="p-8 bg-[#FAF7F2] border-t-4 border-[#E8E2D9] flex gap-4"><button onClick={() => verifyClaim(room.claims[0].id, false)} className="flex-1 py-5 bg-white border-4 border-[#E8E2D9] text-[#7A746B] rounded-[24px] font-black text-lg uppercase tracking-widest active:translate-y-1 transition-all">Reject</button><button onClick={() => verifyClaim(room.claims[0].id, true)} className="flex-1 py-5 bg-[#0D9488] text-white rounded-[24px] font-black text-2xl uppercase tracking-widest shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none transition-all">Verify & Win</button></div></div></div>)}

      <AnimatePresence>{dikitAlert && (<motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }} className="fixed bottom-6 right-6 z-[55] bg-[#0D9488] text-white p-6 rounded-[32px] shadow-2xl border-4 border-white flex flex-col items-center gap-4 w-96 max-h-[80vh] overflow-y-auto custom-scrollbar"><div className="text-center"><div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">{dikitAlert.length > 1 ? 'MULTIPLE SIDEQUEST WINS!' : 'Sidequest Win!'}</div><div className="text-2xl font-black italic">{dikitAlert.map((w: any) => w.playerName).join(' & ')}</div></div><div className="flex gap-4 overflow-x-auto w-full pb-2 px-2 snap-x">{dikitAlert.map((alert: any, aIdx: number) => (<div key={aIdx} className="bg-white/10 p-4 rounded-2xl border border-white/20 shrink-0 snap-center"><div className="text-center text-xs font-bold mb-2">{alert.playerName}</div><div className="grid grid-cols-5 gap-1">{alert.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-8 h-8 flex items-center justify-center font-black text-[10px] rounded-lg border ${num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md' : 'bg-[#0D9488]/20 border-white/20 text-white/40'}`}>{num === 0 ? 'FR' : num}</div>) }))}</div></div>))}</div><button onClick={dismissDikit} className="text-xs font-black uppercase tracking-widest bg-white/20 hover:bg-white/30 px-6 py-2 rounded-full transition-all mt-2">Dismiss</button></motion.div>)}</AnimatePresence>

      <AnimatePresence>{winner && room.status !== 'next_round' && (<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-[60] p-4"><motion.div initial={{scale:0.8, y:50}} animate={{scale:1, y:0}} className="bg-white rounded-[64px] border-[12px] border-[#FACC15] w-full max-w-4xl p-12 shadow-2xl text-center relative overflow-hidden flex flex-col max-h-[90vh]"><div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/10 to-transparent opacity-50" /><div className="relative z-10 flex flex-col min-h-0"><div className="w-32 h-32 mx-auto bg-gradient-to-br from-[#FACC15] to-[#EA580C] rounded-full flex items-center justify-center mb-8 shadow-2xl scale-110 shrink-0"><Trophy className="text-white" size={64} /></div><h2 className="text-7xl font-display text-[#3D3A35] mb-4 uppercase italic tracking-tighter shrink-0">{winner.length > 1 ? `${winner.length} WINNERS!` : 'BINGO!'}</h2><p className="text-2xl text-[#7A746B] font-bold mb-8 leading-tight shrink-0"><span className="text-4xl font-black text-[#0D9488] mt-2 block">{winner.map((w: any) => w.playerName).join(', ')}</span></p><div className="flex-1 overflow-y-auto min-h-0 mb-8 custom-scrollbar"><div className="flex flex-wrap gap-8 justify-center p-4">{winner.map((w: any, wIdx: number) => (<div key={wIdx} className="bg-[#FAF7F2] p-6 rounded-[32px] border-4 border-[#E8E2D9] shadow-inner"><div className="text-lg font-black text-[#3D3A35] mb-4">{w.playerName}</div><div className="grid grid-cols-5 gap-1.5">{w.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-10 h-10 flex items-center justify-center font-display text-xs rounded-xl border-2 transition-all ${num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : called ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'bg-white border-[#E8E2D9] text-[#DED9D1]'}`}>{num === 0 ? 'FR' : num}</div>) }))}</div></div>))}</div></div><button onClick={dismissWinner} className="w-full py-5 bg-[#3D3A35] text-white rounded-[24px] font-black text-xl uppercase tracking-[0.2em] hover:bg-black active:scale-95 transition-all shadow-xl shrink-0">Continue Game</button></div></motion.div></motion.div>)}</AnimatePresence>
    </div>
  );
}
