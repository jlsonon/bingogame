import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BingoCard } from '../components/BingoCard';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { generateRandomCard, checkValidWin, getBallLetter, checkDikitSidequest } from '../lib/bingo';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Plus, Trash2, ArrowLeft, ArrowRight, Loader, LayoutGrid, Eye, History, Settings2, Trophy, CheckCircle2, Users, Ticket } from 'lucide-react';
import { SOUNDS, playSound } from '../lib/sounds';

function Countdown({ endsAt }: { endsAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((endsAt || now) - now) / 1000));
  return <span className="tabular-nums">{seconds}s</span>;
}

export default function Player() {
  const { code } = useParams();
  const navigate = useNavigate();
  
  // Atomic Selectors for Performance
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const me = useGameStore(s => s.me);
  const latestBall = useGameStore(s => s.latestBall);
  const winner = useGameStore(s => s.winner);
  const claimAlert = useGameStore(s => s.claimAlert);
  const dikitAlert = useGameStore(s => s.dikitAlert);
  
  const updateMyCards = useGameStore(s => s.updateMyCards);
  const claimBingo = useGameStore(s => s.claimBingo);
  const claimDikit = useGameStore(s => s.claimDikit);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);
  const setNextRoundChoice = useGameStore(s => s.setNextRoundChoice);
  const setPlayerReady = useGameStore(s => s.setPlayerReady);
  const leaveRoom = useGameStore(s => s.leaveRoom);
  const dismissWinner = useGameStore(s => s.dismissWinner);
  const dismissDikit = useGameStore(s => s.dismissDikit);

  const [cards, setCards] = useState<number[][][]>([]);
  const [markedCells, setMarkedCells] = useState<Record<number, number[]>>({});
  const [activeTab, setActiveTab] = useState<'cards' | 'pattern' | 'history' | 'stats'>('cards');
  const [autoMark, setAutoMark] = useState(localStorage.getItem('bingo_auto_mark') === 'true');
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  
  const [roundChoices, setRoundChoices] = useState<Record<number, boolean>>({});
  const [nearWinAlert, setNearWinAlert] = useState<string | null>(null);
  const [claimedDikitIndices, setClaimedDikitIndices] = useState<number[]>([]);

  // Screen Wake Lock API
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.error(`${err?.name}, ${err?.message}`);
      }
    };
    requestWakeLock();
    return () => { wakeLock?.release(); };
  }, []);

  // Reset round-specific data when roundNumber changes
  useEffect(() => {
     if (room?.roundNumber) {
        setClaimedDikitIndices([]);
        setMarkedCells(prev => {
           const reset: Record<number, number[]> = {};
           Object.keys(prev).forEach(idx => { reset[Number(idx)] = [0]; });
           return reset;
        });
     }
  }, [room?.roundNumber, room?.status === 'waiting']);

  useEffect(() => {
    if (!socket || !code) return;
    if (!room || !me) {
      rejoinRoom(code, 'player').then(success => {
        if (!success) navigate(`/?code=${code}`);
      });
      return;
    }
    if (me.isHost) {
      navigate(`/host/${room.id}`);
      return;
    }

    if (cards.length === 0 && me.activeCards.length > 0) {
       setCards(me.activeCards);
       const initialMarked: Record<number, number[]> = {};
       me.activeCards.forEach((card, i) => {
         const calledOnCard = card.flat().filter(num => num !== 0 && room.calledNumbers.includes(num));
         initialMarked[i] = [0, ...calledOnCard];
       });
       setMarkedCells(initialMarked);
    } else if (cards.length === 0) {
       const initialCount = parseInt(localStorage.getItem('bingo_initial_cards') || '1');
       const newCards = Array.from({ length: initialCount }, () => generateRandomCard());
       setCards(newCards);
       updateMyCards(newCards);
       const initialMarked: Record<number, number[]> = {};
       newCards.forEach((_, i) => { initialMarked[i] = [0]; });
       setMarkedCells(initialMarked);
    }
  }, [socket, code, room, me, navigate, rejoinRoom]);

  useEffect(() => {
     if (cards.length > 0) {
        updateMyCards(cards);
     }
  }, [cards]);

  useEffect(() => {
    if (winner) {
      if (room?.mode === 'Blackout') {
         playSound(SOUNDS.JACKPOT_WIN, 1.0);
      } else {
         playSound(SOUNDS.BINGO_WIN, 0.8);
      }
      const iWon = winner.some((w: any) => w.playerId === me?.id);
      if (iWon) {
         confetti({ particleCount: 300, spread: 100, origin: { y: 0.5 } });
      } else {
         confetti({ particleCount: 50, spread: 40, origin: { y: 1 }, colors: ['#94a3b8']});
      }
    }
  }, [winner, me]);

  useEffect(() => {
    localStorage.setItem('bingo_auto_mark', String(autoMark));
  }, [autoMark]);

  useEffect(() => {
    if (!latestBall) return;
    if ('vibrate' in navigator) navigator.vibrate(80);
    if (!autoMark) return;

    setMarkedCells(prev => {
      const next = { ...prev };
      cards.forEach((card, cardIndex) => {
        if (!card.flat().includes(latestBall)) return;
        const current = next[cardIndex] || [0];
        if (!current.includes(latestBall)) {
          next[cardIndex] = [...current, latestBall];
        }
      });
      return next;
    });
  }, [latestBall, autoMark, cards]);

  const toggleCell = (cardIdx: number, num: number) => {
    if (room?.status !== 'playing' || num === 0) return;
    
    setMarkedCells(prev => {
      const current = prev[cardIdx] || [];
      if (current.includes(num)) {
        return { ...prev, [cardIdx]: current.filter(n => n !== num) };
      } else {
        return { ...prev, [cardIdx]: [...current, num] };
      }
    });
  };

  const cardStatus = useMemo(() => {
    if (!room || cards.length === 0) return [];
    return cards.map((card, index) => {
      const win = checkValidWin(card, markedCells[index] || [], room.calledNumbers || [], room.mode, room.patterns);
      const dikit = checkDikitSidequest(card, markedCells[index] || [], room.calledNumbers || []);
      const hasLatest = latestBall ? (markedCells[index] || []).includes(latestBall) : false;
      const markedCount = (markedCells[index] || []).filter(num => num !== 0).length;
      return { win, dikit, hasLatest, markedCount };
    });
  }, [cards, markedCells, room, latestBall]);

  const winningCardIdx = useMemo(() => cardStatus.findIndex(s => s.win.valid), [cardStatus]);
  const dikitCardIdx = useMemo(() => cardStatus.findIndex((s, i) => s.dikit && !claimedDikitIndices.includes(i)), [cardStatus, claimedDikitIndices]);

  useEffect(() => {
    if (winningCardIdx !== -1 && room?.status === 'playing') {
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    }
    const nearWinIdx = cardStatus.findIndex(status => status.win.cellsAway === 1);
    if (nearWinIdx !== -1 && room?.status === 'playing') {
       if (nearWinAlert === null) playSound(SOUNDS.NEAR_BINGO, 0.6);
       setNearWinAlert(`Card ${nearWinIdx + 1} is 1 away!`);
    } else {
       setNearWinAlert(null);
    }
  }, [cardStatus, room?.status, winningCardIdx, nearWinAlert]);

  const handleClaim = () => {
    if (winningCardIdx !== -1 && room?.status === 'playing') {
       claimBingo(winningCardIdx, markedCells[winningCardIdx] || []);
       setShowClaimConfirm(false);
    }
  };

  const handleDikitClaim = () => {
    if (dikitCardIdx !== -1 && room?.status === 'playing') {
       playSound(SOUNDS.DIKIT_HIT, 1.0);
       setClaimedDikitIndices(prev => [...prev, dikitCardIdx]);
       claimDikit(dikitCardIdx, markedCells[dikitCardIdx] || []);
    }
  };

  const toggleRoundChoice = (idx: number) => {
    setRoundChoices(prev => ({ ...prev, [idx]: !prev[idx] }));
    setNextRoundChoice('change'); 
  };

  const applyRoundChoices = () => {
     const nextCards = cards.map((card, i) => roundChoices[i] ? generateRandomCard() : card);
     const nextMarked: Record<number, number[]> = {};
     nextCards.forEach((_, i) => { nextMarked[i] = [0]; });
     setCards(nextCards);
     setMarkedCells(nextMarked);
     setRoundChoices({});
  };

  if (!room || !me) return null;

  const isSpectator = cards.length === 0;

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-sans touch-manipulation text-[#3D3A35] select-none">
      {/* Offline/Reconnecting Overlay */}
      {!socket?.connected && (
         <div className="fixed inset-0 z-[200] bg-[#3D3A35]/80 backdrop-blur-md flex items-center justify-center p-6 text-center">
            <div className="bg-white rounded-[32px] p-8 border-4 border-[#EA580C] shadow-2xl max-w-xs">
               <Loader className="animate-spin text-[#EA580C] mx-auto mb-4" size={48} />
               <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Connection Lost</h2>
               <p className="text-sm font-bold text-[#7A746B]">Hang tight! Reconnecting you to the Bingo Hall...</p>
            </div>
         </div>
      )}

      {/* Immersive Top Ribbon - Latest Call Persistent */}
      <div className="bg-[#3D3A35] text-white h-16 shrink-0 relative overflow-hidden flex items-center justify-between px-4 z-30 shadow-lg">
         <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] pointer-events-none" />
         <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-display text-xs border-2 border-white/20 shadow-inner" style={{ backgroundColor: me.avatarColor || '#ccc' }}>
               {me.nickname.substring(0,2).toUpperCase()}
            </div>
            <div className="flex flex-col leading-none">
               <span className="font-black text-[10px] uppercase tracking-widest opacity-60">Player</span>
               <span className="font-display text-sm tracking-tight truncate max-w-[80px]">{me.nickname}</span>
            </div>
         </div>

         <AnimatePresence mode="wait">
            {latestBall ? (
               <motion.div 
                 key={latestBall}
                 initial={{ y: 40, opacity: 0, scale: 0.8 }}
                 animate={{ y: 0, opacity: 1, scale: 1 }}
                 exit={{ y: -40, opacity: 0, scale: 1.2 }}
                 className="flex items-center gap-3 bg-[#EA580C] pl-2 pr-6 py-1.5 rounded-full border-2 border-white/30 shadow-[0_0_20px_rgba(234,88,12,0.4)] relative z-10"
               >
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#EA580C] font-display text-lg shadow-inner">
                     {getBallLetter(latestBall)}
                  </div>
                  <div className="flex flex-col leading-none">
                     <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-80">Latest Call</span>
                     <span className="text-2xl font-display leading-none">{latestBall}</span>
                  </div>
               </motion.div>
            ) : (
               <div className="relative z-10 bg-white/10 px-4 py-2 rounded-full border border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 italic">Waiting...</span>
               </div>
            )}
         </AnimatePresence>

         <div className="flex flex-col items-end relative z-10">
            <span className="text-[10px] font-black text-[#EA580C] tracking-widest uppercase">Room</span>
            <span className="font-display text-xl leading-none tracking-wider text-white/90">{room.id}</span>
         </div>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden relative">
         <AnimatePresence mode="wait">
            {latestBall && (
               <div className="sr-only" aria-live="assertive">
                  New ball called: {getBallLetter(latestBall)} {latestBall}
               </div>
            )}
            {activeTab === 'cards' && (
               <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-2 gap-2 min-h-0">
                  {isSpectator ? (
                     <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
                        <div className="w-24 h-24 bg-[#E8E2D9] rounded-[32px] flex items-center justify-center text-[#7A746B] shadow-inner mb-2">
                           <Eye size={48} />
                        </div>
                        <h2 className="text-3xl font-display uppercase tracking-tight text-[#3D3A35]">Spectator Mode</h2>
                        <p className="text-sm font-bold text-[#A19B91] uppercase tracking-widest leading-relaxed max-w-xs">
                           You're watching the game live! You can follow the calls and pattern in the other tabs.
                        </p>
                        <div className="bg-white border-2 border-[#E8E2D9] rounded-2xl p-4 w-full max-w-[240px]">
                           <div className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest mb-1 text-center">Numbers Called</div>
                           <div className="text-3xl font-display text-[#EA580C]">{room.calledNumbers.length} / 75</div>
                        </div>
                     </div>
                  ) : (
                     <>
                        <AnimatePresence>
                           {nearWinAlert && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full bg-[#EA580C]/10 border-2 border-[#EA580C]/20 rounded-2xl py-1 text-center overflow-hidden shrink-0">
                                 <span className="text-[9px] font-black text-[#EA580C] uppercase tracking-[0.2em] flex items-center justify-center gap-2"><Trophy size={10} />{nearWinAlert}</span>
                              </motion.div>
                           )}
                        </AnimatePresence>
                        <div className={`flex-1 grid gap-2 min-h-0 place-items-center ${cards.length === 1 ? 'grid-cols-1 grid-rows-1' : cards.length === 2 ? 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1' : 'grid-cols-2 grid-rows-2'}`}>
                           {cards.map((card, idx) => (
                              <div key={idx} className="relative w-full h-full flex items-center justify-center min-h-0 overflow-hidden">
                                 <div className="w-full h-full max-w-[400px] max-h-[400px] aspect-square flex items-center justify-center">
                                    <BingoCard card={card} markedCells={markedCells[idx] || []} calledNumbers={room.calledNumbers || []} onToggleCell={(num) => toggleCell(idx, num)} readOnly={room.status !== 'playing'} highlightLatest={latestBall} />
                                 </div>
                                 {cardStatus[idx]?.win.valid && <div className="absolute inset-0 border-4 border-[#EA580C] rounded-[24px] sm:rounded-[40px] pointer-events-none animate-pulse z-20" />}
                              </div>
                           ))}
                           {cards.length === 3 && (
                              <div className="w-full h-full bg-[#E8E2D9]/20 border-2 border-dashed border-[#7A746B] rounded-[24px] flex flex-col items-center justify-center p-4 text-center">
                                 <span className="text-[12px] font-black text-[#3D3A35] uppercase tracking-widest mb-1">Card 4 Empty</span>
                                 <span className="text-[8px] font-bold text-[#7A746B] uppercase leading-tight">Host can increase limits in settings</span>
                              </div>
                           )}
                        </div>
                        <div className="flex justify-center shrink-0 py-1">
                           <button onClick={() => setAutoMark(!autoMark)} className={`flex items-center gap-2 px-4 py-1.5 rounded-full border-2 font-black text-[9px] uppercase tracking-widest transition-all ${autoMark ? 'bg-[#0D9488] border-[#0D9488] text-white shadow-sm' : 'bg-white border-[#E8E2D9] text-[#7A746B]'}`}>
                              <CheckCircle2 size={12} fill={autoMark ? "currentColor" : "none"} />Auto-Marking {autoMark ? 'ON' : 'OFF'}
                           </button>
                        </div>
                     </>
                  )}
               </motion.div>
            )}
            {activeTab === 'pattern' && (
               <motion.div key="pattern" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
                  <div className="text-center">
                     <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-2">Winning Pattern</h3>
                     <p className="text-2xl font-black text-[#EA580C] uppercase tracking-tighter italic">{room.mode}</p>
                  </div>
                  {!room.hidePattern ? (
                    <div className="bg-white p-8 rounded-[40px] border-4 border-[#E8E2D9] shadow-xl">
                       <PatternVisualizer patterns={room.patterns} className="scale-[2] origin-center" />
                    </div>
                  ) : (
                    <div className="bg-white p-12 rounded-[40px] border-4 border-dashed border-[#E8E2D9] flex flex-col items-center gap-4 text-[#DED9D1]">
                       <Eye size={64} className="opacity-20" /><span className="text-xs font-black uppercase tracking-[0.4em]">Mystery Pattern</span>
                    </div>
                  )}
                  {room.prizeText && <div className="bg-[#FACC15]/20 px-6 py-4 rounded-2xl border-2 border-[#FACC15] text-center"><p className="text-[10px] font-black text-[#854D0E] uppercase tracking-widest mb-1">Prize</p><p className="text-xl font-black text-[#854D0E]">{room.prizeText}</p></div>}
               </motion.div>
            )}
            {activeTab === 'history' && (
               <motion.div key="history" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-1 flex flex-col p-6 overflow-hidden">
                  <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.2em] mb-6">Call History</h3>
                  <div className="grid grid-cols-5 gap-3 overflow-y-auto pr-2 custom-scrollbar pb-12">
                     {[...room.calledNumbers].reverse().map((n, i) => (
                        <div key={i} className="aspect-square bg-white border-2 border-[#E8E2D9] rounded-xl flex flex-col items-center justify-center shadow-sm">
                           <span className="text-[8px] font-black text-[#A19B91] leading-none mb-0.5">{getBallLetter(n)}</span>
                           <span className="text-lg font-display text-[#3D3A35] leading-none">{n}</span>
                        </div>
                     ))}
                     {room.calledNumbers.length === 0 && <div className="col-span-5 py-20 text-center text-[#DED9D1] font-bold italic">No numbers called yet</div>}
                  </div>
               </motion.div>
            )}
            {activeTab === 'stats' && (
               <motion.div key="stats" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-1 flex flex-col p-8 gap-6 overflow-y-auto">
                  <div className="text-center mb-2">
                     <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-1">Session Intel</h3>
                     <p className="text-[10px] font-bold text-[#DED9D1] uppercase tracking-widest italic">Live Game Data</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2] pointer-events-none" />
                        <Users size={20} className="text-[#0D9488] mb-2 relative z-10" />
                        <div className="text-4xl font-display tabular-nums relative z-10">{Object.values(room.players).length}</div>
                        <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider relative z-10">Players</div>
                     </div>
                     <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2] pointer-events-none" />
                        <Ticket size={20} className="text-[#EA580C] mb-2 relative z-10" />
                        <div className="text-4xl font-display tabular-nums relative z-10">{room.stats?.totalCardsSold || 0}</div>
                        <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider relative z-10">Cards Sold</div>
                     </div>
                  </div>
                  <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2] pointer-events-none" />
                     <div className="flex items-center justify-between relative z-10">
                        <LayoutGrid size={20} className="text-[#EA580C] mb-2" />
                        <button 
                           onClick={() => {
                              const newCards = Array.from({ length: cards.length }, () => generateRandomCard());
                              const emptyMarked: Record<number, number[]> = {};
                              newCards.forEach((_, i) => { emptyMarked[i] = [0]; });
                              setMarkedCells(emptyMarked);
                              setCards(newCards);
                              playSound(SOUNDS.BALL_HIT, 0.5);
                           }}
                           className="px-3 py-1 bg-[#EA580C] text-white text-[10px] font-black uppercase rounded-lg shadow-md active:scale-95 transition-all"
                        >
                           Change Cards
                        </button>
                     </div>
                     <div className="text-4xl font-display tabular-nums relative z-10">{cards.length}</div>
                     <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider relative z-10">My Cards</div>
                  </div>
                  <div className="bg-white p-6 rounded-[40px] border-4 border-[#E8E2D9] shadow-inner relative overflow-hidden">
                     <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] pointer-events-none" />
                     <div className="flex items-center gap-3 mb-6 relative z-10">
                        <Trophy size={20} className="text-[#FACC15]" />
                        <h4 className="text-xs font-black text-[#3D3A35] uppercase tracking-widest">Hall of Fame</h4>
                     </div>
                     <div className="space-y-4 relative z-10">
                        {room.stats?.winners?.slice(-5).reverse().map((w, i) => (
                           <div key={i} className="flex items-center justify-between p-4 bg-[#FAF7F2] border-2 border-white rounded-[24px] shadow-sm paper-texture overflow-hidden relative">
                              <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent pointer-events-none" />
                              <div className="relative z-10">
                                 <div className="text-sm font-black text-[#3D3A35] uppercase italic">{w.name}</div>
                                 <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-tight">{w.pattern}</div>
                              </div>
                              <div className="text-[10px] font-black text-[#EA580C] bg-[#EA580C]/10 px-3 py-1 rounded-full border border-[#EA580C]/20 relative z-10">RD {w.round}</div>
                           </div>
                        ))}
                        {(room.stats?.winners?.length || 0) === 0 && <div className="text-center py-6 text-[#DED9D1] font-bold italic text-xs">Waiting for the first winner!</div>}
                     </div>
                  </div>
                  <button onClick={() => { leaveRoom(); navigate('/'); }} className="w-full py-4 mt-2 bg-red-50 text-red-500 border-2 border-red-200 rounded-[24px] font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-sm">Leave Room</button>
               </motion.div>
            )}
         </AnimatePresence>

         <AnimatePresence>
            {room.status === 'next_round' && (
               <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="absolute inset-0 z-40 bg-[#FAF7F2] p-6 flex flex-col gap-6 overflow-y-auto">
                  <div className="text-center pt-4"><Trophy size={48} className="text-[#FACC15] mx-auto mb-2" /><h2 className="text-3xl font-black uppercase tracking-tighter italic">Round Complete!</h2><p className="text-xs font-black text-[#A19B91] uppercase tracking-widest mt-1">Next round starts in <Countdown endsAt={room.nextRoundEndsAt} /></p></div>
                  <div className="bg-white rounded-[32px] border-4 border-[#E8E2D9] p-6 shadow-sm"><h3 className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest mb-4 text-center">Prepare your cards</h3><div className="space-y-3">{cards.map((_, i) => (<button key={i} onClick={() => toggleRoundChoice(i)} className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${roundChoices[i] ? 'bg-[#EA580C]/10 border-[#EA580C] text-[#EA580C]' : 'bg-[#FAF7F2] border-white text-[#7A746B]'}`}><div className="flex items-center gap-3"><span className="text-sm font-black uppercase tracking-widest">Card {i + 1}</span>{roundChoices[i] && <span className="text-[10px] font-black bg-[#EA580C] text-white px-2 py-0.5 rounded-full uppercase">NEW</span>}</div><div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${roundChoices[i] ? 'bg-[#EA580C] border-[#EA580C] text-white' : 'bg-white border-[#E8E2D9]'}`}>{roundChoices[i] && <Plus size={16} strokeWidth={4} />}</div></button>))}</div></div>
                  <button onClick={applyRoundChoices} disabled={Object.keys(roundChoices).length === 0} className={`w-full py-5 rounded-[24px] font-black text-lg uppercase tracking-widest shadow-xl transition-all active:scale-95 ${Object.keys(roundChoices).length > 0 ? 'bg-[#3D3A35] text-white' : 'hidden'}`}>Confirm Changes</button>
                  {Object.keys(roundChoices).length === 0 && (<button onClick={() => setPlayerReady()} disabled={me.isReady} className={`w-full py-5 rounded-[24px] font-black text-lg uppercase tracking-widest shadow-xl transition-all active:scale-95 ${!me.isReady ? 'bg-[#0D9488] text-white shadow-[0_6px_0_#0F766E]' : 'bg-white border-4 border-[#0D9488] text-[#0D9488]'}`}>{!me.isReady ? "I'm Ready" : "Waiting for others..."}</button>)}
                  <p className="text-center text-[10px] font-bold text-[#A19B91] uppercase tracking-widest">{Object.keys(roundChoices).length > 0 ? 'Cards will be refreshed' : 'Keeping current cards'}</p>
               </motion.div>
            )}
         </AnimatePresence>
      </main>

      <nav className="h-16 bg-white border-t-2 border-[#E8E2D9] grid grid-cols-4 gap-1 px-2 shrink-0 z-30 pb-safe">
         {[{ id: 'cards', icon: LayoutGrid, label: 'Cards' },{ id: 'pattern', icon: Eye, label: 'Pattern' },{ id: 'history', icon: History, label: 'Calls' },{ id: 'stats', icon: Trophy, label: 'Stats' },].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center justify-center gap-1 transition-all ${activeTab === tab.id ? 'text-[#EA580C] scale-110' : 'text-[#A19B91]'}`}>
               <tab.icon size={20} strokeWidth={activeTab === tab.id ? 3 : 2} /><span className="text-[9px] font-black uppercase tracking-tighter">{tab.label}</span>
            </button>
         ))}
      </nav>

      <AnimatePresence>
         {room.status === 'playing' && (winningCardIdx !== -1 || dikitCardIdx !== -1) && activeTab === 'cards' && (
            <motion.div initial={{ y: 100, scale: 0.8 }} animate={{ y: 0, scale: 1 }} exit={{ y: 100, scale: 0.8 }} className="fixed bottom-20 left-4 right-4 z-40 flex flex-col gap-2">
               {dikitCardIdx !== -1 && (<button onClick={handleDikitClaim} className="w-full bg-[#0D9488] text-white py-3 rounded-2xl font-black text-lg uppercase tracking-[0.1em] shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none">Dikit Hit!</button>)}
               {winningCardIdx !== -1 && (<button onClick={() => setShowClaimConfirm(true)} className="w-full bg-gradient-to-r from-[#EA580C] to-[#C2410C] text-white py-5 rounded-[24px] font-black text-2xl uppercase tracking-[0.15em] shadow-[0_8px_0_#9A3412] active:translate-y-[6px] active:shadow-none animate-bounce">BINGO AVAILABLE!</button>)}
            </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence>
         {showClaimConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#3D3A35]/80 backdrop-blur-sm flex items-center justify-center p-6">
               <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white rounded-[40px] border-4 border-[#EA580C] p-8 w-full max-w-sm text-center shadow-2xl">
                  <Trophy size={48} className="text-[#EA580C] mx-auto mb-4" /><h3 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Ready to Win?</h3><p className="text-sm font-bold text-[#7A746B] mb-8 leading-relaxed">This will pause the game for everyone and notify the Host. Are you sure you have Bingo?</p>
                  <div className="flex flex-col gap-3"><button onClick={handleClaim} className="w-full py-5 bg-[#EA580C] text-white rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_6px_0_#9A3412] active:translate-y-[4px] active:shadow-none">YES, BINGO!</button><button onClick={() => setShowClaimConfirm(false)} className="w-full py-4 bg-[#FAF7F2] text-[#A19B91] rounded-2xl font-black text-sm uppercase tracking-widest">Wait, Go Back</button></div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {claimAlert && !winner && (
         <div className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-50 p-6">
            <div className="text-white text-center flex flex-col items-center"><Loader className="w-16 h-16 text-[#FACC15] animate-spin mb-6" /><h2 className="text-4xl font-black uppercase tracking-tighter italic mb-4">Bingo Claim!</h2><p className="text-xl font-bold opacity-80 mb-12">{claimAlert.playerId === me.id ? "Checking your card..." : `${claimAlert.playerName} is claiming a win!`}</p><div className="bg-white/10 px-8 py-3 rounded-full text-xs font-black uppercase tracking-[0.4em] border border-white/20">Verification in progress</div></div>
         </div>
      )}

      <AnimatePresence>
         {dikitAlert && (
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className="fixed top-14 left-4 right-4 z-[55] bg-[#0D9488] text-white p-4 rounded-2xl shadow-2xl border-2 border-white flex flex-col gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0"><Trophy size={24} /></div>
                  <div className="flex-1 min-w-0">
                     <div className="text-[10px] font-black uppercase tracking-widest opacity-80">
                        {dikitAlert.length > 1 ? 'MULTIPLE SIDEQUEST WINS!' : 'Sidequest Hit!'}
                     </div>
                     <div className="text-lg font-black truncate leading-tight">
                        {dikitAlert.map((w: any) => w.playerName).join(' & ')}
                     </div>
                     <div className="text-[9px] font-bold uppercase tracking-widest opacity-70 mt-0.5">
                        Game resuming in <Countdown endsAt={room.dikitEndsAt} />
                     </div>
                  </div>
                  <button onClick={() => dismissDikit()} className="text-white/50 hover:text-white shrink-0">
                     <Plus size={20} className="rotate-45" />
                  </button>
               </div>
               <div className="flex gap-4 overflow-x-auto w-full pb-2 snap-x">
                  {dikitAlert.map((alert: any, aIdx: number) => (
                     <div key={aIdx} className="bg-white/10 p-4 rounded-2xl border border-white/20 shrink-0 snap-center"><div className="text-center text-xs font-bold mb-2">{alert.playerName}</div><div className="grid grid-cols-5 gap-1">{alert.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-6 h-6 flex items-center justify-center font-black text-[8px] rounded-md border ${num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md' : 'bg-[#0D9488]/20 border-white/20 text-white/40'}`}>{num === 0 ? 'FR' : num}</div>)}))}</div></div>
                  ))}
               </div>
            </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence>
        {winner && room.status !== 'next_round' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-[60] p-6">
             <motion.div initial={{scale:0.8, y:50}} animate={{scale:1, y:0}} className="bg-white rounded-[48px] border-[8px] border-[#FACC15] w-full max-w-sm p-10 shadow-2xl text-center relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/10 to-transparent opacity-50" />
                <div className="relative z-10 flex flex-col min-h-0">
                  <div className="w-24 h-24 mx-auto bg-[#FACC15] rounded-full flex items-center justify-center mb-6 shadow-xl shrink-0"><Trophy className="text-white" size={48} /></div>
                  {winner.some((w: any) => w.playerId === me?.id) ? (<><h2 className="text-5xl font-display text-[#3D3A35] mb-2 uppercase italic tracking-tighter shrink-0">YOU WON!</h2><p className="text-xl text-[#7A746B] font-bold mb-10 leading-tight shrink-0">Congratulations!</p></>) : (<><h2 className="text-5xl font-display text-[#3D3A35] mb-2 uppercase italic tracking-tighter shrink-0">{winner.length > 1 ? 'WINNERS!' : 'ROUND OVER'}</h2><p className="text-xl text-[#7A746B] font-bold mb-4 leading-tight shrink-0"><span className="font-bold text-[#EA580C]">{winner.map((w: any) => w.playerName).join(', ')}</span> claimed Bingo.</p><div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar mb-8"><div className="flex flex-col gap-4">{winner.map((w: any, wIdx: number) => (<div key={wIdx} className="bg-[#FAF7F2] p-4 rounded-3xl border-2 border-[#E8E2D9] shadow-inner"><div className="text-sm font-black text-[#3D3A35] mb-2">{w.playerName}</div><div className="grid grid-cols-5 gap-1 mx-auto max-w-[200px]">{w.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`aspect-square flex items-center justify-center font-display text-[10px] rounded-md border transition-all ${num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : called ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'bg-white border-[#E8E2D9] text-[#DED9D1]'}`}>{num === 0 ? 'FR' : num}</div>)}))}</div></div>))}</div></div></>)}
                  <button onClick={dismissWinner} className="w-full py-5 bg-[#3D3A35] text-white rounded-[24px] font-black text-lg uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl shrink-0 mt-auto">Awesome</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="h-24" />
    </div>
  );
}
