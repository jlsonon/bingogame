import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BingoCard } from '../components/BingoCard';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { generateRandomCard, checkValidWin, getBallLetter, checkDikitSidequest } from '../lib/bingo';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Plus, Trash2, ArrowLeft, ArrowRight, Loader, LayoutGrid, Eye, History, Settings2, Trophy, CheckCircle2, Users, Ticket } from 'lucide-react';

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
  const { socket, room, me, updateMyCards, claimBingo, claimDikit, latestBall, winner, dismissWinner, claimAlert, dikitAlert, rejoinRoom, setNextRoundChoice } = useGameStore();

  const [cards, setCards] = useState<number[][][]>([]);
  const [markedCells, setMarkedCells] = useState<Record<number, number[]>>({}); // cardIndex -> marked cells
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'cards' | 'pattern' | 'history' | 'stats'>('cards');
  const [autoMark, setAutoMark] = useState(localStorage.getItem('bingo_auto_mark') === 'true');
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  
  // For round transition checkbox logic
  const [roundChoices, setRoundChoices] = useState<Record<number, boolean>>({});
  const [nearWinAlert, setNearWinAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !code) return;
    if (!room || !me) {
      rejoinRoom(code, 'player').then(success => {
        if (!success) navigate('/');
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
      if (winner.playerId === me?.id) {
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
    
    // Play local sound for ball call?
    
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

  const toggleCell = (num: number) => {
    if (room?.status !== 'playing' || num === 0) return;
    
    setMarkedCells(prev => {
      const current = prev[currentCardIdx] || [];
      if (current.includes(num)) {
        return { ...prev, [currentCardIdx]: current.filter(n => n !== num) };
      } else {
        return { ...prev, [currentCardIdx]: [...current, num] };
      }
    });
  };

  const currentWinCheck = useMemo(() => {
    if (!room || cards.length === 0 || !room.calledNumbers || !cards[currentCardIdx]) return { valid: false, pattern: '', cellsAway: 99 };
    return checkValidWin(cards[currentCardIdx], markedCells[currentCardIdx] || [], room.calledNumbers, room.mode, room.patterns);
  }, [cards, currentCardIdx, markedCells, room?.calledNumbers, room?.mode, room?.patterns]);

  const currentDikitCheck = useMemo(() => {
    if (!room || cards.length === 0 || !cards[currentCardIdx]) return false;
    return checkDikitSidequest(cards[currentCardIdx], markedCells[currentCardIdx] || []);
  }, [cards, currentCardIdx, markedCells, room]);

  const cardStatus = useMemo(() => {
    if (!room || cards.length === 0) return [];
    return cards.map((card, index) => {
      const win = checkValidWin(card, markedCells[index] || [], room.calledNumbers || [], room.mode, room.patterns || []);
      const hasLatest = latestBall ? card.flat().includes(latestBall) : false;
      const markedCount = (markedCells[index] || []).filter(num => num !== 0).length;
      return { win, hasLatest, markedCount };
    });
  }, [cards, markedCells, room, latestBall]);

  useEffect(() => {
    const winningIndex = cardStatus.findIndex(status => status.win.valid);
    if (winningIndex !== -1 && winningIndex !== currentCardIdx && room?.status === 'playing') {
      setCurrentCardIdx(winningIndex);
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
    }
    
    // Near win detection (Almost Bingo!)
    const nearWinIndex = cardStatus.findIndex(status => status.win.cellsAway === 1);
    if (nearWinIndex !== -1 && room?.status === 'playing') {
       setNearWinAlert(`Card ${nearWinIndex + 1} is 1 away!`);
    } else {
       setNearWinAlert(null);
    }
  }, [cardStatus, currentCardIdx, room?.status]);

  const handleClaim = () => {
    if (currentWinCheck.valid && room?.status === 'playing') {
       claimBingo(currentCardIdx, markedCells[currentCardIdx] || []);
       setShowClaimConfirm(false);
    }
  };

  const handleDikitClaim = () => {
    if (currentDikitCheck && room?.status === 'playing') {
       const { claimDikit } = useGameStore.getState();
       claimDikit(currentCardIdx, markedCells[currentCardIdx] || []);
    }
  };

  const toggleRoundChoice = (idx: number) => {
    setRoundChoices(prev => ({ ...prev, [idx]: !prev[idx] }));
    setNextRoundChoice('change'); // Notify server that user is interacting
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

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-sans touch-manipulation text-[#3D3A35] select-none">
      
      {/* Dynamic Header */}
      <header className="bg-white border-b-2 border-[#E8E2D9] px-4 h-14 flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-sm">
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px] border-2 border-white shadow-sm" style={{ backgroundColor: me.avatarColor || '#ccc' }}>
               {me.nickname.substring(0,2).toUpperCase()}
            </div>
            <div className="font-black text-xs uppercase tracking-tight truncate max-w-[100px]">{me.nickname}</div>
         </div>

         <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
               {latestBall && (
                  <motion.div 
                    key={latestBall}
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex items-center gap-1.5 bg-[#FACC15] px-2.5 py-1 rounded-full border-2 border-white shadow-sm"
                  >
                     <span className="text-[10px] font-black leading-none">{getBallLetter(latestBall)}</span>
                     <span className="text-lg font-black leading-none tabular-nums">{latestBall}</span>
                  </motion.div>
               )}
            </AnimatePresence>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${room.status === 'playing' ? 'bg-[#0D9488]/10 text-[#0D9488]' : 'bg-[#F3EFE9] text-[#A19B91]'}`}>
               {room.status === 'playing' && <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-pulse" />}
               {room.status}
            </div>
         </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
         
         <AnimatePresence mode="wait">
            {activeTab === 'cards' && (
               <motion.div 
                 key="cards" 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 className="flex-1 flex flex-col p-3 gap-3 min-h-0"
               >
                  {/* Card Selector / Quick Switch */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar shrink-0">
                     {cards.map((_, i) => {
                        const status = cardStatus[i];
                        const active = i === currentCardIdx;
                        return (
                           <button
                              key={i}
                              onClick={() => setCurrentCardIdx(i)}
                              className={`flex-1 min-w-[70px] py-2 px-1 rounded-xl border-2 transition-all flex flex-col items-center gap-0.5 ${active ? 'bg-[#3D3A35] border-[#3D3A35] text-white shadow-md scale-105' : status?.win.valid ? 'bg-[#EA580C] border-[#EA580C] text-white animate-pulse' : status?.hasLatest ? 'bg-[#FACC15]/20 border-[#FACC15] text-[#854D0E]' : 'bg-white border-[#E8E2D9] text-[#A19B91]'}`}
                           >
                              <span className="text-[8px] font-black uppercase tracking-widest leading-none">Card</span>
                              <span className="text-sm font-black leading-none">{i + 1}</span>
                              {status?.win.valid && <Trophy size={10} className="mt-0.5" />}
                           </button>
                        );
                     })}
                  </div>

                  {/* Almost Bingo Banner */}
                  <AnimatePresence>
                     {nearWinAlert && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="w-full bg-[#EA580C]/10 border-2 border-[#EA580C]/20 rounded-2xl py-2 text-center overflow-hidden"
                        >
                           <span className="text-[10px] font-black text-[#EA580C] uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                              <Trophy size={12} />
                              {nearWinAlert}
                           </span>
                        </motion.div>
                     )}
                  </AnimatePresence>

                  {/* The Main Card - Optimized for thumb reach */}
                  <div className="flex-1 flex items-center justify-center min-h-0">
                     <div className="w-full max-w-[min(100%,400px)] aspect-square touch-none">
                        {cards[currentCardIdx] ? (
                           <BingoCard 
                              card={cards[currentCardIdx]}
                              markedCells={markedCells[currentCardIdx] || []}
                              calledNumbers={room.calledNumbers || []}
                              onToggleCell={toggleCell}
                              readOnly={room.status !== 'playing'}
                              highlightLatest={latestBall}
                           />
                        ) : (
                           <div className="w-full aspect-square bg-white rounded-[32px] border-2 border-dashed border-[#E8E2D9] flex items-center justify-center">
                              <Loader className="animate-spin text-[#EA580C]" size={32} />
                           </div>
                        )}
                     </div>
                  </div>

                  {/* Auto-mark Toggle */}
                  <div className="flex justify-center shrink-0 mb-2">
                     <button 
                        onClick={() => setAutoMark(!autoMark)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 font-black text-[10px] uppercase tracking-widest transition-all ${autoMark ? 'bg-[#0D9488] border-[#0D9488] text-white shadow-md' : 'bg-white border-[#E8E2D9] text-[#7A746B]'}`}
                     >
                        <CheckCircle2 size={14} fill={autoMark ? "currentColor" : "none"} />
                        Auto-Marking {autoMark ? 'ON' : 'OFF'}
                     </button>
                  </div>
               </motion.div>
            )}

            {activeTab === 'pattern' && (
               <motion.div 
                 key="pattern" 
                 initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                 className="flex-1 flex flex-col items-center justify-center p-8 gap-8"
               >
                  <div className="text-center">
                     <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-2">Winning Pattern</h3>
                     <p className="text-2xl font-black text-[#EA580C] uppercase tracking-tighter italic">{room.mode}</p>
                  </div>
                  <div className="bg-white p-8 rounded-[40px] border-4 border-[#E8E2D9] shadow-xl">
                     <PatternVisualizer patterns={room.patterns} className="scale-[2] origin-center" />
                  </div>
                  {room.prizeText && (
                    <div className="bg-[#FACC15]/20 px-6 py-4 rounded-2xl border-2 border-[#FACC15] text-center">
                       <p className="text-[10px] font-black text-[#854D0E] uppercase tracking-widest mb-1">Prize</p>
                       <p className="text-xl font-black text-[#854D0E]">{room.prizeText}</p>
                    </div>
                  )}
               </motion.div>
            )}

            {activeTab === 'history' && (
               <motion.div 
                 key="history" 
                 initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                 className="flex-1 flex flex-col p-6 overflow-hidden"
               >
                  <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.2em] mb-6">Call History</h3>
                  <div className="grid grid-cols-5 gap-3 overflow-y-auto pr-2 custom-scrollbar pb-12">
                     {[...room.calledNumbers].reverse().map((n, i) => (
                        <div key={i} className="aspect-square bg-white border-2 border-[#E8E2D9] rounded-xl flex flex-col items-center justify-center shadow-sm">
                           <span className="text-[8px] font-black text-[#A19B91] leading-none mb-0.5">{getBallLetter(n)}</span>
                           <span className="text-lg font-black text-[#3D3A35] leading-none">{n}</span>
                        </div>
                     ))}
                     {room.calledNumbers.length === 0 && (
                        <div className="col-span-5 py-20 text-center text-[#DED9D1] font-bold italic">No numbers called yet</div>
                     )}
                  </div>
               </motion.div>
            )}

            {activeTab === 'stats' && (
               <motion.div 
                 key="stats" 
                 initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
                 className="flex-1 flex flex-col p-8 gap-6 overflow-y-auto"
               >
                  <div className="text-center mb-2">
                     <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-1">Session Intel</h3>
                     <p className="text-[10px] font-bold text-[#DED9D1] uppercase tracking-widest italic">Live Game Data</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white p-5 rounded-3xl border-2 border-[#E8E2D9] shadow-sm">
                        <Users size={20} className="text-[#0D9488] mb-2" />
                        <div className="text-3xl font-black tabular-nums">{Object.values(room.players).length}</div>
                        <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">Players</div>
                     </div>
                     <div className="bg-white p-5 rounded-3xl border-2 border-[#E8E2D9] shadow-sm">
                        <Ticket size={20} className="text-[#EA580C] mb-2" />
                        <div className="text-3xl font-black tabular-nums">{room.stats?.totalCardsSold || 0}</div>
                        <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">Cards in Play</div>
                     </div>
                  </div>

                  <div className="bg-white p-6 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm">
                     <div className="flex items-center gap-3 mb-4">
                        <Trophy size={18} className="text-[#FACC15]" />
                        <h4 className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest">Hall of Fame</h4>
                     </div>
                     <div className="space-y-3">
                        {room.stats?.winners?.slice(-5).reverse().map((w, i) => (
                           <div key={i} className="flex items-center justify-between py-2 border-b border-[#FAF7F2] last:border-0">
                              <div>
                                 <div className="text-sm font-black text-[#3D3A35]">{w.name}</div>
                                 <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-tight">{w.pattern}</div>
                              </div>
                              <div className="text-[10px] font-black text-[#EA580C] bg-[#EA580C]/10 px-2 py-0.5 rounded-full">
                                 RD {w.round}
                              </div>
                           </div>
                        ))}
                        {(room.stats?.winners?.length || 0) === 0 && (
                           <div className="text-center py-6 text-[#DED9D1] font-bold italic text-xs">Waiting for the first winner!</div>
                        )}
                     </div>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>

         {/* Round Complete / Next Round Overlay */}
         <AnimatePresence>
            {room.status === 'next_round' && (
               <motion.div 
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 100 }}
                  className="absolute inset-0 z-40 bg-[#FAF7F2] p-6 flex flex-col gap-6 overflow-y-auto"
               >
                  <div className="text-center pt-4">
                     <Trophy size={48} className="text-[#FACC15] mx-auto mb-2" />
                     <h2 className="text-3xl font-black uppercase tracking-tighter italic">Round Complete!</h2>
                     <p className="text-xs font-black text-[#A19B91] uppercase tracking-widest mt-1">Next round starts in <Countdown endsAt={room.nextRoundEndsAt} /></p>
                  </div>

                  <div className="bg-white rounded-[32px] border-4 border-[#E8E2D9] p-6 shadow-sm">
                     <h3 className="text-[10px] font-black text-[#7A746B] uppercase tracking-widest mb-4 text-center">Prepare your cards</h3>
                     <div className="space-y-3">
                        {cards.map((_, i) => (
                           <button 
                              key={i}
                              onClick={() => toggleRoundChoice(i)}
                              className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${roundChoices[i] ? 'bg-[#EA580C]/10 border-[#EA580C] text-[#EA580C]' : 'bg-[#FAF7F2] border-white text-[#7A746B]'}`}
                           >
                              <div className="flex items-center gap-3">
                                 <span className="text-sm font-black uppercase tracking-widest">Card {i + 1}</span>
                                 {roundChoices[i] && <span className="text-[10px] font-black bg-[#EA580C] text-white px-2 py-0.5 rounded-full uppercase">NEW</span>}
                              </div>
                              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${roundChoices[i] ? 'bg-[#EA580C] border-[#EA580C] text-white' : 'bg-white border-[#E8E2D9]'}`}>
                                 {roundChoices[i] && <Plus size={16} strokeWidth={4} />}
                              </div>
                           </button>
                        ))}
                     </div>
                  </div>

                  <button 
                     onClick={applyRoundChoices}
                     disabled={Object.keys(roundChoices).length === 0}
                     className={`w-full py-5 rounded-[24px] font-black text-lg uppercase tracking-widest shadow-xl transition-all active:scale-95 ${Object.keys(roundChoices).length > 0 ? 'bg-[#3D3A35] text-white' : 'bg-white border-2 border-[#E8E2D9] text-[#DED9D1]'}`}
                  >
                     Confirm Changes
                  </button>
                  <p className="text-center text-[10px] font-bold text-[#A19B91] uppercase tracking-widest">
                     {Object.keys(roundChoices).length > 0 ? 'Cards will be refreshed' : 'Keeping current cards'}
                  </p>
               </motion.div>
            )}
         </AnimatePresence>

      </main>

      {/* Sticky Mobile Navigation */}
      <nav className="h-16 bg-white border-t-2 border-[#E8E2D9] grid grid-cols-4 gap-1 px-2 shrink-0 z-30 pb-safe">
         {[
            { id: 'cards', icon: LayoutGrid, label: 'Cards' },
            { id: 'pattern', icon: Eye, label: 'Pattern' },
            { id: 'history', icon: History, label: 'Calls' },
            { id: 'stats', icon: Trophy, label: 'Stats' },
         ].map(tab => (
            <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex flex-col items-center justify-center gap-1 transition-all ${activeTab === tab.id ? 'text-[#EA580C] scale-110' : 'text-[#A19B91]'}`}
            >
               <tab.icon size={20} strokeWidth={activeTab === tab.id ? 3 : 2} />
               <span className="text-[9px] font-black uppercase tracking-tighter">{tab.label}</span>
            </button>
         ))}
      </nav>

      {/* The "Big Orange Button" - Floating Claim */}
      <AnimatePresence>
         {room.status === 'playing' && (currentWinCheck.valid || currentDikitCheck) && activeTab === 'cards' && (
            <motion.div 
               initial={{ y: 100, scale: 0.8 }}
               animate={{ y: 0, scale: 1 }}
               exit={{ y: 100, scale: 0.8 }}
               className="fixed bottom-20 left-4 right-4 z-40 flex flex-col gap-2"
            >
               {currentDikitCheck && (
                  <button 
                     onClick={handleDikitClaim}
                     className="w-full bg-[#0D9488] text-white py-3 rounded-2xl font-black text-lg uppercase tracking-[0.1em] shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none"
                  >
                     Dikit Hit!
                  </button>
               )}
               {currentWinCheck.valid && (
                  <button 
                     onClick={() => setShowClaimConfirm(true)}
                     className="w-full bg-gradient-to-r from-[#EA580C] to-[#C2410C] text-white py-5 rounded-[24px] font-black text-2xl uppercase tracking-[0.15em] shadow-[0_8px_0_#9A3412] active:translate-y-[6px] active:shadow-none animate-bounce"
                  >
                     BINGO AVAILABLE!
                  </button>
               )}
            </motion.div>
         )}
      </AnimatePresence>

      {/* Claim Confirmation Modal */}
      <AnimatePresence>
         {showClaimConfirm && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-50 bg-[#3D3A35]/80 backdrop-blur-sm flex items-center justify-center p-6"
            >
               <motion.div 
                  initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                  className="bg-white rounded-[40px] border-4 border-[#EA580C] p-8 w-full max-w-sm text-center shadow-2xl"
               >
                  <Trophy size={48} className="text-[#EA580C] mx-auto mb-4" />
                  <h3 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Ready to Win?</h3>
                  <p className="text-sm font-bold text-[#7A746B] mb-8 leading-relaxed">
                     This will pause the game for everyone and notify the Host. Are you sure you have Bingo?
                  </p>
                  <div className="flex flex-col gap-3">
                     <button onClick={handleClaim} className="w-full py-5 bg-[#EA580C] text-white rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_6px_0_#9A3412] active:translate-y-[4px] active:shadow-none">
                        YES, BINGO!
                     </button>
                     <button onClick={() => setShowClaimConfirm(false)} className="w-full py-4 bg-[#FAF7F2] text-[#A19B91] rounded-2xl font-black text-sm uppercase tracking-widest">
                        Wait, Go Back
                     </button>
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Global Claim Alert (when someone else claims) */}
      {claimAlert && !winner && (
         <div className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-50 p-6">
            <div className="text-white text-center flex flex-col items-center">
               <Loader className="w-16 h-16 text-[#FACC15] animate-spin mb-6" />
               <h2 className="text-4xl font-black uppercase tracking-tighter italic mb-4">Bingo Claim!</h2>
               <p className="text-xl font-bold opacity-80 mb-12">
                  {claimAlert.playerId === me.id ? "Checking your card..." : `${claimAlert.playerName} is claiming a win!`}
               </p>
               <div className="bg-white/10 px-8 py-3 rounded-full text-xs font-black uppercase tracking-[0.4em] border border-white/20">
                  Verification in progress
               </div>
            </div>
         </div>
      )}

      {/* Dikit Sidequest Toast */}
      <AnimatePresence>
         {dikitAlert && (
            <motion.div 
               initial={{ y: -100, opacity: 0 }}
               animate={{ y: 20, opacity: 1 }}
               exit={{ y: -100, opacity: 0 }}
               className="fixed top-14 left-4 right-4 z-[55] bg-[#0D9488] text-white p-4 rounded-2xl shadow-2xl border-2 border-white flex items-center gap-4"
            >
               <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <Trophy size={24} />
               </div>
               <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Sidequest Hit!</div>
                  <div className="text-lg font-black truncate leading-tight">{dikitAlert.playerName} hit Dikit!</div>
               </div>
               <button onClick={() => useGameStore.getState().dismissDikit()} className="text-white/50 hover:text-white">
                  <Plus size={20} className="rotate-45" />
               </button>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && room.status !== 'next_round' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-[60] p-6">
             <motion.div initial={{scale:0.8, y:50}} animate={{scale:1, y:0}} className="bg-white rounded-[48px] border-[8px] border-[#FACC15] w-full max-w-sm p-10 shadow-2xl text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/10 to-transparent opacity-50" />
                <div className="relative z-10">
                  <div className="w-24 h-24 mx-auto bg-[#FACC15] rounded-full flex items-center justify-center mb-6 shadow-xl">
                    <Trophy className="text-white" size={48} />
                  </div>
                  <h2 className="text-5xl font-black text-[#3D3A35] mb-2 uppercase italic tracking-tighter">BINGO!</h2>
                  <p className="text-xl text-[#7A746B] font-bold mb-10 leading-tight">
                     {winner.playerId === me?.id ? "YOU WON THE ROUND!" : <><span className="text-[#0D9488] font-black">{winner.playerName}</span><br />won the round!</>}
                  </p>
                  <button onClick={dismissWinner} className="w-full py-5 bg-[#3D3A35] text-white rounded-[24px] font-black text-lg uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl">
                     Awesome
                  </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
