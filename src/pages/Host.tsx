import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BallCaller } from '../components/BallCaller';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { Maximize2, Play, Square, Settings, Share2, Copy, Users, Ticket, Monitor, Trophy, Plus, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PRESET_PATTERNS, type BingoPattern, getBallLetter } from '../lib/bingo';

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
  const { socket, room, latestBall, startGame, pauseGame, resumeGame, resetGame, startNextRound, callNextBall, updateSettings, verifyClaim, winner, dismissWinner, dikitAlert, dismissDikit, me, rejoinRoom } = useGameStore();

  const [showSettings, setShowSettings] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [customName, setCustomName] = useState('Custom Pattern');
  const [customCells, setCustomCells] = useState<number[]>([12]);
  
  // Persistent Pattern Library
  const [patternLibrary, setPatternLibrary] = useState<BingoPattern[]>(() => {
     const saved = localStorage.getItem('bingo_pattern_library');
     return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('bingo_pattern_library', JSON.stringify(patternLibrary));
  }, [patternLibrary]);

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
      if (event.code !== 'Space' || room?.status !== 'playing' || room.autoCallSpeed !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return;
      event.preventDefault();
      callNextBall();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [room?.status, room?.autoCallSpeed, callNextBall]);

  if (!room) return null;

  const joinUrl = `${window.location.origin}/play/${room.id}`;
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
    
    // Add to current round
    updateSettings({
      patterns: [...room.patterns, newPattern]
    });
    
    // Add to persistent library
    setPatternLibrary(prev => [...prev, newPattern]);
    
    setCustomName('Custom Pattern');
    setCustomCells([12]);
  };

  const deleteFromLibrary = (id: string) => {
    setPatternLibrary(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-sans text-[#3D3A35] overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b-2 border-[#E8E2D9] h-16 px-6 flex items-center justify-between sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-6">
          <div className="bg-[#F3EFE9] border border-[#DED9D1] text-[#3D3A35] font-black text-xl px-4 py-1.5 rounded-xl tracking-wider tabular-nums flex items-center gap-3">
            <span className="text-[10px] font-bold text-[#7A746B] uppercase tracking-widest hidden sm:inline">Room</span>
            {room.id}
          </div>
          <div className="hidden md:flex items-center gap-1">
             <button onClick={handleCopy} className="p-2 text-[#A19B91] hover:text-[#3D3A35] transition-colors" title={copyLabel}>
                <Copy size={18} />
             </button>
             <button onClick={openDisplay} className="flex items-center gap-2 px-3 py-1.5 bg-[#0D9488]/10 text-[#0D9488] rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0D9488]/20 transition-all">
                <Monitor size={16} />
                TV Mode
             </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end leading-none">
            <span className="text-xs font-black text-[#3D3A35] mb-1">{me?.nickname}</span>
            <span className="text-[10px] text-[#0D9488] font-bold uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] inline-block animate-pulse" />
              Host Dashboard
            </span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 bg-[#F3EFE9] text-[#7A746B] border border-[#DED9D1] rounded-xl flex items-center justify-center hover:bg-[#E8E2D9] transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* 3-Panel Layout */}
      <main className="flex-1 grid grid-cols-[320px_1fr_360px] gap-0 overflow-hidden">
        
        {/* Left Panel: Game Controls */}
        <section className="bg-white border-r-2 border-[#E8E2D9] p-6 flex flex-col gap-6 overflow-y-auto">
           <div>
              <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Round Management</h3>
              <div className="space-y-3">
                 {room.status === 'waiting' && (
                   <button onClick={startGame} className="w-full py-4 bg-[#EA580C] text-white rounded-2xl font-black text-lg shadow-[0_4px_0_#9A3412] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-tighter flex items-center justify-center gap-2">
                      <Play size={20} fill="currentColor" />
                      Start Game
                   </button>
                 )}
                 {room.status === 'playing' && (
                   <button onClick={pauseGame} className="w-full py-4 bg-[#F3EFE9] border-2 border-[#DED9D1] text-[#7A746B] rounded-2xl font-black text-lg active:translate-y-1 transition-all uppercase tracking-tighter flex items-center justify-center gap-2">
                      <Square size={20} fill="currentColor" />
                      Pause Game
                   </button>
                 )}
                 {room.status === 'paused' && (
                   <div className="grid grid-cols-2 gap-3">
                      <button onClick={resetGame} className="py-4 bg-[#FAF7F2] border-2 border-[#E8E2D9] text-[#A19B91] rounded-2xl font-black text-xs uppercase tracking-widest active:translate-y-1 transition-all">
                         End Round
                      </button>
                      <button onClick={resumeGame} className="py-4 bg-[#0D9488] text-white rounded-2xl font-black text-lg shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-tighter flex items-center justify-center gap-2">
                         <Play size={20} fill="currentColor" />
                         Resume
                      </button>
                   </div>
                 )}
                 {room.status === 'next_round' && (
                    <button onClick={startNextRound} className="w-full py-4 bg-[#FACC15] text-[#854D0E] rounded-2xl font-black text-lg shadow-[0_4px_0_#A16207] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-tighter flex flex-col items-center leading-none">
                       <span className="text-[10px] mb-1">Force Start</span>
                       Next Round
                    </button>
                 )}
              </div>
           </div>

           <div className="pt-6 border-t-2 border-[#FAF7F2]">
              <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Ball Calling</h3>
              <div className="space-y-4">
                 <div className="bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]">
                    <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest block mb-2">Auto-Call Speed</label>
                    <div className="grid grid-cols-4 gap-2">
                       {[0, 3, 5, 8].map(speed => (
                          <button 
                             key={speed}
                             onClick={() => updateSettings({ autoCallSpeed: speed })}
                             className={`py-2 rounded-xl text-xs font-black border-2 transition-all ${room.autoCallSpeed === speed ? 'bg-[#3D3A35] border-[#3D3A35] text-white shadow-md' : 'bg-white border-[#DED9D1] text-[#A19B91] hover:border-[#A19B91]'}`}
                          >
                             {speed === 0 ? 'Off' : `${speed}s`}
                          </button>
                       ))}
                    </div>
                 </div>

                 {room.status === 'playing' && room.autoCallSpeed === 0 && (
                   <button onClick={callNextBall} className="w-full py-8 bg-[#3D3A35] text-white rounded-[32px] font-black text-2xl shadow-[0_8px_0_#1C1917] active:translate-y-[8px] active:shadow-none transition-all uppercase tracking-widest">
                      Call Ball
                   </button>
                 )}
              </div>
           </div>

           <div className="mt-auto pt-6 border-t-2 border-[#FAF7F2]">
              <div className="bg-[#FDFBF7] rounded-2xl p-4 border border-[#E8E2D9] text-center">
                 <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x180&data=${encodeURIComponent(joinUrl)}`} alt="QR" className="mx-auto w-32 h-32 mb-3" />
                 <p className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest">Join via Link</p>
                 <p className="text-xs font-bold text-[#3D3A35] truncate mt-1">{joinUrl}</p>
              </div>
           </div>
        </section>

        {/* Center Panel: Current Ball & Board */}
        <section className="bg-[#FAF7F2] p-8 flex flex-col gap-8 overflow-y-auto">
           
           <div className="grid grid-cols-[1fr_320px] gap-8 shrink-0">
              <div className="bg-white rounded-[40px] border-4 border-[#E8E2D9] p-8 shadow-sm flex flex-col justify-center items-center relative overflow-hidden">
                 <div className="absolute top-4 left-6 text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Latest Call</div>
                 <AnimatePresence mode="wait">
                    {latestBall ? (
                       <motion.div 
                         key={latestBall}
                         initial={{ scale: 0.5, y: 50, opacity: 0 }}
                         animate={{ scale: 1, y: 0, opacity: 1 }}
                         className="flex flex-col items-center"
                       >
                          <div className="w-48 h-48 rounded-full bg-[#FACC15] border-[8px] border-white outline outline-8 outline-[#FACC15] shadow-xl flex flex-col items-center justify-center text-[#854D0E]">
                            <span className="text-2xl font-black leading-none mb-1">{getBallLetter(latestBall)}</span>
                            <span className="text-8xl font-black leading-none tracking-tighter">{latestBall}</span>
                          </div>
                       </motion.div>
                    ) : (
                       <div className="text-xl font-black text-[#DED9D1] uppercase tracking-widest">Awaiting First Ball</div>
                    )}
                 </AnimatePresence>
              </div>

              <div className="bg-white rounded-[40px] border-4 border-[#E8E2D9] p-6 shadow-sm flex flex-col">
                 <div className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em] mb-4 text-center">Active Pattern</div>
                 <div className="flex-1 flex items-center justify-center">
                    {!room.hidePattern ? (
                       <PatternVisualizer patterns={room.patterns} className="scale-125 origin-center" />
                    ) : (
                       <div className="text-[#DED9D1] flex flex-col items-center gap-2">
                          <Eye size={32} className="opacity-30" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Hidden</span>
                       </div>
                    )}
                 </div>
                 <div className="mt-4 pt-4 border-t-2 border-[#FAF7F2] text-center">
                    <div className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest leading-none mb-1">Mode</div>
                    <div className="text-lg font-black text-[#EA580C] uppercase tracking-tighter">{room.mode}</div>
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[40px] border-4 border-[#E8E2D9] p-8 shadow-sm flex-1 min-h-0 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.3em]">Master Number Board</h3>
                <div className="text-xs font-black text-[#EA580C] tabular-nums bg-[#EA580C]/10 px-3 py-1 rounded-full">
                   {room.calledNumbers.length} / 75
                </div>
              </div>
              <div className="grid grid-cols-15 gap-2">
                 {Array.from({length: 75}, (_, i) => i + 1).map(num => (
                   <div 
                     key={num} 
                     className={`aspect-square flex items-center justify-center text-lg font-black rounded-lg border-2 transition-all ${
                       room.calledNumbers.includes(num) 
                         ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm' 
                         : 'bg-[#FAF7F2] text-[#DED9D1] border-[#E8E2D9]'
                     }`}
                   >
                     {num}
                   </div>
                 ))}
              </div>
           </div>

        </section>

        {/* Right Panel: Players & Stats */}
        <section className="bg-white border-l-2 border-[#E8E2D9] flex flex-col overflow-hidden">
           
           <div className="p-6 border-b-2 border-[#FAF7F2] bg-[#FAF7F2]/30">
              <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Session Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white p-4 rounded-2xl border-2 border-[#E8E2D9] shadow-sm">
                    <Ticket size={20} className="text-[#EA580C] mb-2" />
                    <div className="text-2xl font-black tabular-nums">{room.stats.totalCardsSold}</div>
                    <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">Cards Sold</div>
                 </div>
                 <div className="bg-white p-4 rounded-2xl border-2 border-[#E8E2D9] shadow-sm">
                    <Users size={20} className="text-[#0D9488] mb-2" />
                    <div className="text-2xl font-black tabular-nums">{Object.values(room.players).length}</div>
                    <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">Players</div>
                 </div>
              </div>
           </div>

           <div className="flex-1 p-6 overflow-y-auto">
              <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Connected Players</h3>
              <div className="space-y-2">
                 {Object.values(room.players).map(p => (
                   <div key={p.id} className="flex items-center gap-3 bg-[#FAF7F2] border-2 border-white p-3 rounded-2xl shadow-sm">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs" style={{ backgroundColor: p.avatarColor || '#ccc' }}>
                        {p.nickname.substring(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="font-black text-sm text-[#3D3A35] truncate flex items-center gap-2">
                            {p.nickname}
                            {!p.connected && <span className="text-[8px] font-bold bg-[#A19B91]/20 text-[#A19B91] px-1.5 py-0.5 rounded italic">OFFLINE</span>}
                         </div>
                         <div className="text-[10px] text-[#A19B91] font-bold uppercase tracking-wider flex justify-between">
                            <span>{p.activeCards.length} cards</span>
                            {room.status === 'next_round' && (
                               <span className={p.nextRoundChoice === 'change' ? 'text-[#EA580C]' : 'text-[#0D9488]'}>
                                  {p.nextRoundChoice === 'change' ? 'CHANGING' : 'READY'}
                               </span>
                            )}
                         </div>
                      </div>
                   </div>
                 ))}
                 {Object.values(room.players).length === 0 && (
                    <div className="text-center py-8 text-[#DED9D1] font-bold italic text-sm">No players yet</div>
                 )}
              </div>
           </div>

           <div className="p-6 border-t-2 border-[#FAF7F2] bg-[#FAF7F2]/30 max-h-48 overflow-y-auto">
              <h3 className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-3">Hall of Fame</h3>
              <div className="space-y-2">
                 {room.stats.winners.slice(-5).reverse().map((w, i) => (
                   <div key={i} className="flex items-center justify-between text-xs">
                      <div className="font-bold flex items-center gap-2">
                         <Trophy size={12} className="text-[#FACC15]" />
                         {w.name}
                      </div>
                      <div className="text-[10px] text-[#A19B91] font-black uppercase tracking-tighter">{w.pattern}</div>
                   </div>
                 ))}
                 {room.stats.winners.length === 0 && (
                    <div className="text-[10px] text-[#DED9D1] font-bold italic">Round results will appear here</div>
                 )}
              </div>
           </div>
        </section>
      </main>

      {/* Settings Modal Setup */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
           <div className="bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl relative border-4 border-[#3D3A35]">
              <div className="flex justify-between items-center mb-8">
                 <h2 className="text-3xl font-black uppercase tracking-tighter">Room Config</h2>
                 <button onClick={() => setShowSettings(false)} className="text-[#A19B91] hover:text-[#3D3A35]">
                    <Square size={24} className="rotate-45" />
                 </button>
              </div>
              
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Round Name</label>
                       <input
                         value={room.roundName}
                         onChange={e => updateSettings({ roundName: e.target.value })}
                         className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-black text-sm focus:border-[#0D9488] outline-none"
                         maxLength={40}
                       />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Prize Info</label>
                       <input
                         value={room.prizeText}
                         onChange={e => updateSettings({ prizeText: e.target.value })}
                         placeholder="Optional prize"
                         className="w-full p-3 bg-[#FAF7F2] rounded-xl border-2 border-[#E8E2D9] font-black text-sm focus:border-[#0D9488] outline-none placeholder:text-[#DED9D1]"
                         maxLength={80}
                       />
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Game Mode</label>
                    <div className="flex gap-2">
                       {['Bingo', 'Blackout', 'Dikit'].map(m => (
                          <button
                             key={m}
                             onClick={() => updateSettings({ mode: m })}
                             className={`flex-1 py-3 rounded-xl text-xs font-black border-2 transition-all ${room.mode === m ? 'bg-[#EA580C] border-[#EA580C] text-white shadow-md' : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#A19B91]'}`}
                          >
                             {m === 'Bingo' ? 'Standard' : m}
                          </button>
                       ))}
                    </div>
                 </div>

                 {room.mode === 'Bingo' && (
                   <div className="space-y-4 pt-4 border-t-2 border-[#FAF7F2]">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest ml-1">Pattern Library</label>
                        <div className="max-h-64 overflow-y-auto pr-2 custom-scrollbar border-2 border-[#FAF7F2] rounded-2xl p-2 bg-[#FAF7F2]/50">
                           <div className="grid grid-cols-2 gap-2">
                             {[...PRESET_PATTERNS, ...patternLibrary].map(pattern => {
                               const selected = room.patterns.some(item => item.id === pattern.id);
                               const isPreset = PRESET_PATTERNS.some(p => p.id === pattern.id);
                               return (
                                 <div key={pattern.id} className="relative group">
                                   <button
                                     type="button"
                                     onClick={() => togglePattern(pattern)}
                                     className={`w-full px-3 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-wider transition-all relative ${selected ? 'bg-[#0D9488] border-[#0D9488] text-white shadow-md z-10 scale-[1.02]' : 'bg-white border-[#E8E2D9] text-[#7A746B] hover:border-[#A19B91]'}`}
                                   >
                                     {pattern.name}
                                     {selected && <div className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full" />}
                                   </button>
                                   {!isPreset && (
                                      <button 
                                         onClick={(e) => { e.stopPropagation(); deleteFromLibrary(pattern.id); }}
                                         className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg"
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
                        <div className="flex justify-between items-center">
                           <span className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest">Draw Custom</span>
                           <input
                             value={customName}
                             onChange={e => setCustomName(e.target.value)}
                             className="bg-white px-3 py-1 rounded-lg border-2 border-[#E8E2D9] font-bold text-[10px] focus:border-[#0D9488] outline-none"
                             maxLength={28}
                             placeholder="Pattern Name"
                           />
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
                        <button
                          type="button"
                          onClick={addCustomPattern}
                          className="w-full bg-[#3D3A35] text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest active:translate-y-1 shadow-md"
                        >
                          Add to Round
                        </button>
                      </div>
                   </div>
                 )}

                 <div className="pt-4 border-t-2 border-[#FAF7F2]">
                    <div className="flex items-center justify-between bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9]">
                       <div className="flex flex-col">
                          <span className="text-xs font-black text-[#3D3A35] uppercase tracking-widest">Mystery Mode</span>
                          <span className="text-[10px] font-bold text-[#A19B91] uppercase tracking-tighter">Hide winning pattern from screens</span>
                       </div>
                       <button
                          onClick={() => updateSettings({ hidePattern: !room.hidePattern })}
                          className={`w-14 h-8 rounded-full transition-all relative ${room.hidePattern ? 'bg-[#0D9488]' : 'bg-[#DED9D1]'}`}
                       >
                          <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${room.hidePattern ? 'left-7' : 'left-1'}`} />
                       </button>
                    </div>
                 </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="mt-8 w-full bg-[#3D3A35] text-white py-4 rounded-2xl font-black text-lg uppercase tracking-widest shadow-xl active:scale-[0.98] transition-all"
              >
                 Save & Close
              </button>
           </div>
        </div>
      )}

      {/* Claims Verification Modal */}
      {room.claims.length > 0 && !winner && (
        <div className="fixed inset-0 bg-[#3D3A35]/80 backdrop-blur-md flex justify-center items-center z-50 p-4">
           <div className="bg-white rounded-[48px] w-full max-w-xl overflow-hidden shadow-2xl flex flex-col border-[8px] border-[#EA580C]">
              <div className="bg-[#EA580C] text-white p-8 text-center">
                 <h2 className="text-5xl font-black uppercase tracking-tighter italic drop-shadow-md mb-2">Bingo Claim!</h2>
                 <p className="text-xl font-bold opacity-90">{room.claims[0].playerName} called Bingo</p>
              </div>

              <div className="p-8 overflow-y-auto flex flex-col items-center gap-8">
                 <div className="bg-[#FAF7F2] p-8 rounded-[40px] border-4 border-[#E8E2D9] shadow-inner scale-110">
                    <div className="grid grid-cols-5 gap-2">
                      {['B','I','N','G','O'].map(l => <div key={l} className="text-center font-black text-[#A19B91] text-xl mb-2">{l}</div>)}
                      {room.claims[0].card.map((row: any)=> row.map((num: any, idx: number) => {
                         const called = num === 0 || room.calledNumbers.includes(num);
                         return (
                           <div key={idx} className={`w-14 h-14 flex items-center justify-center font-black text-xl rounded-xl border-2 transition-all ${num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : called ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg scale-105' : 'bg-white border-[#E8E2D9] text-[#DED9D1]'}`}>
                              {num === 0 ? 'FR' : num}
                           </div>
                         )
                      }))}
                    </div>
                 </div>
                 
                 <div className="w-full bg-[#FAF7F2] p-4 rounded-2xl border-2 border-[#E8E2D9] flex justify-between items-center px-8">
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em]">Claimed Pattern</span>
                       <span className="text-2xl font-black text-[#EA580C] uppercase italic leading-none">{room.claims[0].pattern}</span>
                    </div>
                    <Trophy className="text-[#EA580C]" size={40} />
                 </div>
              </div>

              <div className="p-8 bg-[#FAF7F2] border-t-4 border-[#E8E2D9] flex gap-4">
                 <button onClick={() => verifyClaim(room.claims[0].id, false)} className="flex-1 py-5 bg-white border-4 border-[#E8E2D9] text-[#7A746B] rounded-[24px] font-black text-lg uppercase tracking-widest active:translate-y-1 transition-all">
                    Reject
                 </button>
                 <button onClick={() => verifyClaim(room.claims[0].id, true)} className="flex-1 py-5 bg-[#0D9488] text-white rounded-[24px] font-black text-2xl uppercase tracking-widest shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none transition-all">
                    Verify & Win
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Sidequest Hit Overlay (Transient) */}
      <AnimatePresence>
         {dikitAlert && (
            <motion.div 
               initial={{ x: 300, opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               exit={{ x: 300, opacity: 0 }}
               className="fixed bottom-6 right-6 z-[55] bg-[#0D9488] text-white p-6 rounded-[32px] shadow-2xl border-4 border-white flex flex-col items-center gap-4 w-80"
            >
               <div className="text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">Sidequest Win!</div>
                  <div className="text-2xl font-black italic">{dikitAlert.playerName}</div>
               </div>

               <div className="bg-white/10 p-4 rounded-2xl border border-white/20 scale-90">
                  <div className="grid grid-cols-5 gap-1">
                     {dikitAlert.card.map((row: any)=> row.map((num: any, idx: number) => {
                        const called = num === 0 || room.calledNumbers.includes(num);
                        return (
                           <div key={idx} className={`w-8 h-8 flex items-center justify-center font-black text-[10px] rounded-lg border ${num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md' : 'bg-[#0D9488]/20 border-white/20 text-white/40'}`}>
                              {num === 0 ? 'FR' : num}
                           </div>
                        )
                     }))}
                  </div>
               </div>

               <button onClick={dismissDikit} className="text-xs font-black uppercase tracking-widest bg-white/20 hover:bg-white/30 px-6 py-2 rounded-full transition-all">
                  Dismiss
               </button>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && room.status !== 'next_round' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-[60] p-4">
             <motion.div initial={{scale:0.8, y:50}} animate={{scale:1, y:0}} className="bg-white rounded-[64px] border-[12px] border-[#FACC15] w-full max-w-lg p-12 shadow-2xl text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/10 to-transparent opacity-50" />
                <div className="relative z-10">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-[#FACC15] to-[#EA580C] rounded-full flex items-center justify-center mb-8 shadow-2xl scale-110">
                    <Trophy className="text-white" size={64} />
                  </div>
                  <h2 className="text-7xl font-black text-[#3D3A35] mb-4 uppercase italic tracking-tighter">BINGO!</h2>
                  <p className="text-2xl text-[#7A746B] font-bold mb-10 leading-tight">
                     Round Winner<br />
                     <span className="text-4xl font-black text-[#0D9488] mt-2 block">{winner.playerName}</span>
                  </p>
                  <button onClick={dismissWinner} className="w-full py-5 bg-[#3D3A35] text-white rounded-[24px] font-black text-xl uppercase tracking-[0.2em] hover:bg-black active:scale-95 transition-all shadow-xl">
                     Continue Game
                  </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
