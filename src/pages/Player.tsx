import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BingoCard } from '../components/BingoCard';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { generateRandomCard, checkValidWin, getBallLetter, checkDikitSidequest, calculateCardsCost, calculateTotalCollected, formatPeso, hasCardPricing } from '../lib/bingo';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Plus, Loader, LayoutGrid, Eye, History, Trophy, CheckCircle2, Users, Ticket, Lock, Coins, Swords, Maximize2, Grid2x2, ChevronLeft, ChevronRight, Pause } from 'lucide-react';
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
  const updateMarkedCells = useGameStore(s => s.updateMarkedCells);
  const claimBingo = useGameStore(s => s.claimBingo);
  const claimDikit = useGameStore(s => s.claimDikit);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);
  const setNextRoundChoice = useGameStore(s => s.setNextRoundChoice);
  const setPlayerReady = useGameStore(s => s.setPlayerReady);
  const leaveRoom = useGameStore(s => s.leaveRoom);
  const dismissWinner = useGameStore(s => s.dismissWinner);
  const hallOfFame = useGameStore(s => s.hallOfFame);
  const dismissDikit = useGameStore(s => s.dismissDikit);

  const [cards, setCards] = useState<number[][][]>([]);
  const [markedCells, setMarkedCells] = useState<Record<number, number[]>>({});
  const [activeTab, setActiveTab] = useState<'cards' | 'pattern' | 'history' | 'stats'>('cards');
  const [autoMark, setAutoMark] = useState(localStorage.getItem('bingo_auto_mark') === 'true');
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<'grid' | 'focus'>('grid');
  const [focusedCardIdx, setFocusedCardIdx] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [roundChoices, setRoundChoices] = useState<Record<number, boolean>>({});
  const [nearWinAlert, setNearWinAlert] = useState<string | null>(null);
  const [claimedDikitIndices, setClaimedDikitIndices] = useState<number[]>([]);
  const cardsInitializedRef = useRef(false);
  const prevRoundRef = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Screen Wake Lock API
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        console.error(`${err?.name}, ${err?.message}`);
      }
    };
    requestWakeLock();
    return () => { wakeLock?.release(); };
  }, []);

  // Reset round-specific data when roundNumber changes or room resets to waiting
  useEffect(() => {
     if (!room) return;
     const roundChanged = prevRoundRef.current !== null && prevRoundRef.current !== room.roundNumber;
     const resetToWaiting = prevStatusRef.current !== null && prevStatusRef.current !== 'waiting' && room.status === 'waiting';
     prevRoundRef.current = room.roundNumber;
     prevStatusRef.current = room.status;

     if (roundChanged || resetToWaiting) {
        setClaimedDikitIndices([]);
        setMarkedCells(prev => {
           const reset: Record<number, number[]> = {};
           Object.keys(prev).forEach(idx => { reset[Number(idx)] = [0]; });
           return reset;
        });
     }
  }, [room?.roundNumber, room?.status]);

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

    if (!cardsInitializedRef.current) {
       cardsInitializedRef.current = true;
       const storedCountStr = localStorage.getItem('bingo_initial_cards');
       const storedCount = storedCountStr !== null ? parseInt(storedCountStr) : 1;

       if (me.activeCards.length > 0 && (room.status === 'playing' || me.activeCards.length === storedCount)) {
          setCards(me.activeCards);
          if (me.markedCells && Object.keys(me.markedCells).length > 0) {
            setMarkedCells(me.markedCells);
          } else {
            const initialMarked: Record<number, number[]> = {};
            me.activeCards.forEach((card, i) => {
              const calledOnCard = card.flat().filter(num => num !== 0 && room.calledNumbers.includes(num));
              initialMarked[i] = [0, ...calledOnCard];
            });
            setMarkedCells(initialMarked);
          }
       } else {
          const count = Math.min(Math.max(storedCount, 0), 4);
          const newCards = Array.from({ length: count }, () => generateRandomCard());
          setCards(newCards);
          updateMyCards(newCards);
          const initialMarked: Record<number, number[]> = {};
          newCards.forEach((_, i) => { initialMarked[i] = [0]; });
          setMarkedCells(initialMarked);
       }
    }
  }, [socket, code, room, me, navigate, rejoinRoom, updateMyCards]);

  useEffect(() => {
     if (cards.length > 0 && ['waiting', 'next_round'].includes(room?.status || '')) {
        updateMyCards(cards);
     }
  }, [cards, room?.status, updateMyCards]);

  useEffect(() => {
    if (winner) {
      if (room?.mode === 'Blackout') {
         playSound(SOUNDS.JACKPOT_WIN, 1.0);
      } else {
         playSound(SOUNDS.BINGO_WIN, 0.8);
      }
      const iWon = winner.some((w: any) => w.playerId === me?.id);
      if (iWon) {
         confetti({ particleCount: 300, spread: 100, origin: { y: 0.5 }, disableForReducedMotion: true });
      } else {
         confetti({ particleCount: 50, spread: 40, origin: { y: 1 }, colors: ['#94a3b8'], disableForReducedMotion: true });
      }
    }
  }, [winner, me]);

  useEffect(() => {
    return () => {
      if (leaveConfirmTimerRef.current) clearTimeout(leaveConfirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('bingo_auto_mark', String(autoMark));
  }, [autoMark]);

  useEffect(() => {
     if (Object.keys(markedCells).length > 0) {
        updateMarkedCells(markedCells);
     }
  }, [markedCells]);

  useEffect(() => {
    if (!latestBall) return;
    
    // Check if the ball is on any of the player's cards
    const isOnCard = cards.some(card => card.flat().includes(latestBall));
    if (isOnCard && 'vibrate' in navigator) {
       navigator.vibrate([30]); // Short & Sharp
    }
    
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

  const isPlayingOrClaimPause = Boolean(
    room?.status === 'playing' ||
    (room?.status === 'paused' && ((room.claims?.length || 0) > 0 || (room.verifiedWinners?.length || 0) > 0))
  );

  const toggleCell = (cardIdx: number, num: number) => {
    if (!isPlayingOrClaimPause || num === 0) return;
    
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

  const hasCalledBalls = Boolean(room?.calledNumbers && room.calledNumbers.length > 0);
  const winningCardIdx = useMemo(() => {
    if (!hasCalledBalls || !room || !me) return -1;
    return cardStatus.findIndex((s, i) => {
      if (!s.win.valid) return false;
      const alreadyClaimed =
        (room.claims || []).some((c: any) => c.playerId === me.id && c.cardIndex === i) ||
        (room.verifiedWinners || []).some((w: any) => w.playerId === me.id && w.cardIndex === i);
      return !alreadyClaimed;
    });
  }, [cardStatus, hasCalledBalls, room, me]);
  const dikitCardIdx = useMemo(() => {
    if (!hasCalledBalls) return -1;
    return cardStatus.findIndex((s, i) => s.dikit && !claimedDikitIndices.includes(i));
  }, [cardStatus, claimedDikitIndices, hasCalledBalls]);

  useEffect(() => {
    if (winningCardIdx !== -1 && room?.status === 'playing') {
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]); // Long Heartbeat
    }
    const nearWinIdx = hasCalledBalls ? cardStatus.findIndex(status => status.win.cellsAway === 1) : -1;
    if (nearWinIdx !== -1 && room?.status === 'playing') {
       if (nearWinAlert === null) {
         playSound(SOUNDS.NEAR_BINGO, 0.6);
         if ('vibrate' in navigator) navigator.vibrate([50, 100, 50]); // Double Pulse
       }
       setNearWinAlert(`Card ${nearWinIdx + 1} is 1 away!`);
    } else {
       setNearWinAlert(null);
    }
  }, [cardStatus, room?.status, winningCardIdx, nearWinAlert, hasCalledBalls]);

  const handleClaim = () => {
    if (winningCardIdx !== -1 && isPlayingOrClaimPause) {
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
    setRoundChoices(prev => {
      const next = { ...prev };
      if (next[idx]) {
        delete next[idx];
      } else {
        next[idx] = true;
      }
      setNextRoundChoice(Object.keys(next).length > 0 ? 'change' : 'keep');
      return next;
    });
  };

  const applyRoundChoices = () => {
     const nextCards = cards.map((card, i) => roundChoices[i] ? generateRandomCard() : card);
     const nextMarked: Record<number, number[]> = {};
     nextCards.forEach((_, i) => { nextMarked[i] = [0]; });
     setCards(nextCards);
     setMarkedCells(nextMarked);
     setRoundChoices({});
  };

  const isGameOn = room?.status === 'playing' || room?.status === 'paused';

  const setCardQuantity = (count: number) => {
    if (isGameOn || !['waiting', 'next_round'].includes(room?.status || '')) return;
    const clamped = Math.min(Math.max(count, 0), 4);
    localStorage.setItem('bingo_initial_cards', String(clamped));
    const newCards = Array.from({ length: clamped }, () => generateRandomCard());
    const initialMarked: Record<number, number[]> = {};
    newCards.forEach((_, i) => { initialMarked[i] = [0]; });
    setCards(newCards);
    setMarkedCells(initialMarked);
    updateMyCards(newCards);
    playSound(SOUNDS.BALL_DRAW, 0.5);
  };

  if (!room || !me) return null;

  const isSpectator = cards.length === 0;
  const pricingEnabled = hasCardPricing(room);
  const myCardCost = calculateCardsCost(cards.length, room);
  const totalCollected = room.stats?.totalPotCollected ?? calculateTotalCollected(room.players, room);
  const dikitPrize = room.dikitPrize || 0;
  const bingoPrize = room.bingoPrize || 0;

  const isCardInDikitFight = (cardIdx: number) => {
    return room?.dikitFight?.status === 'active' &&
           room.dikitFight.contenders.some(c => c.playerId === me?.id && c.cardIndex === cardIdx);
  };

  const calledSet = new Set(room.calledNumbers || []);
  const falseMarkCardNumbers = cards
    .map((_, idx) => ((markedCells[idx] || []).some(m => m !== 0 && !calledSet.has(m)) ? idx + 1 : null))
    .filter((n): n is number => n !== null);

  const clearFalseMarks = () => {
    setMarkedCells(prev => {
      const cleaned: Record<number, number[]> = {};
      cards.forEach((_, idx) => {
        cleaned[idx] = (prev[idx] || [0]).filter(m => m === 0 || calledSet.has(m));
        if (!cleaned[idx].includes(0)) cleaned[idx].unshift(0);
      });
      return cleaned;
    });
  };

  const handleLeaveClick = () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      if (leaveConfirmTimerRef.current) clearTimeout(leaveConfirmTimerRef.current);
      leaveConfirmTimerRef.current = setTimeout(() => setConfirmLeave(false), 4000);
      return;
    }
    setConfirmLeave(false);
    if (leaveConfirmTimerRef.current) clearTimeout(leaveConfirmTimerRef.current);
    leaveRoom();
    navigate('/');
  };

  const safeFocusedIdx = cards.length > 0 ? Math.min(focusedCardIdx, cards.length - 1) : 0;
  const isManualPause = room.status === 'paused' && !claimAlert && (room.claims?.length || 0) === 0;
  const showClaimBar =
    (room.status === 'playing' || (room.status === 'paused' && ((room.claims?.length || 0) > 0 || (room.verifiedWinners?.length || 0) > 0))) &&
    (winningCardIdx !== -1 || dikitCardIdx !== -1) &&
    activeTab === 'cards';

  return (
    <div className="fixed inset-0 h-[100dvh] max-h-[100dvh] w-full bg-[#FAF7F2] flex flex-col font-sans touch-manipulation text-[#3D3A35] select-none overflow-hidden">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestBall ? `New ball called: ${getBallLetter(latestBall)} ${latestBall}` : ''}
      </div>

      {/* Offline/Reconnecting Overlay */}
      {!socket?.connected && (
         <div role="dialog" aria-modal="true" aria-label="Connection Lost" className="fixed inset-0 z-[200] bg-[#3D3A35]/80 backdrop-blur-md flex items-center justify-center p-6 text-center">
            <div className="bg-white rounded-[32px] p-8 border-4 border-[#EA580C] shadow-2xl max-w-xs">
               <Loader className="animate-spin text-[#EA580C] mx-auto mb-4" size={48} />
               <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Connection Lost</h2>
               <p className="text-sm font-bold text-[#6B655D]">Hang tight! Reconnecting you to the Bingo Hall...</p>
            </div>
         </div>
      )}

      {/* Immersive Top Ribbon - Latest Call Persistent */}
      <div className="bg-[#3D3A35] text-white h-14 sm:h-16 shrink-0 relative overflow-hidden flex items-center justify-between px-3 sm:px-4 z-30 shadow-lg paper-texture">
         <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-display text-xs border-2 border-white/25 shadow-inner" style={{ backgroundColor: me.avatarColor || '#6B655D' }}>
               {me.nickname.substring(0,2).toUpperCase()}
            </div>
            <div className="flex flex-col leading-none">
               <span className="font-bold text-[10px] uppercase tracking-widest text-white/75">Player</span>
               <span className="font-display text-sm tracking-tight truncate max-w-[88px]">{me.nickname}</span>
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
                     <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/95">Latest Call</span>
                     <span className="text-2xl font-display leading-none tabular-nums">{latestBall}</span>
                  </div>
               </motion.div>
            ) : (
               <div className="relative z-10 bg-white/15 px-4 py-1.5 rounded-full border border-white/20">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/85">Waiting...</span>
               </div>
            )}
         </AnimatePresence>

         <div className="flex flex-col items-end relative z-10">
            <span className="text-[10px] font-black text-[#FACC15] tracking-widest uppercase">Room</span>
            <span className="font-display text-xl leading-none tracking-wider text-white tabular-nums">{room.id}</span>
         </div>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden relative min-h-0">
         <AnimatePresence mode="wait">
            {activeTab === 'cards' && (
               <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-1.5 sm:p-2 gap-1 min-h-0 overflow-hidden">
                  {room.status === 'next_round' ? (
                     <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
                        <div className="text-center pt-1">
                           <Trophy size={40} className="text-[#FACC15] mx-auto mb-1.5" />
                           <h2 className="text-2xl sm:text-3xl font-display uppercase tracking-tight">Round Complete!</h2>
                           <p className="text-xs font-bold text-[#6B655D] uppercase tracking-widest mt-0.5 tabular-nums">
                              Next round starts in <span className="text-[#C2410C]"><Countdown endsAt={room.nextRoundEndsAt} /></span>
                           </p>
                        </div>
                        {cards.length > 0 ? (
                           <div className="bg-white rounded-[28px] border-2 border-[#E8E2D9] p-4 shadow-sm space-y-3">
                              <h3 className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider text-center">
                                 Tap any card to swap for fresh numbers
                              </h3>
                              <div className="space-y-2.5">
                                 {cards.map((card, i) => (
                                    <button
                                       key={i}
                                       type="button"
                                       aria-pressed={Boolean(roundChoices[i])}
                                       onClick={() => toggleRoundChoice(i)}
                                       className={`w-full p-3 rounded-2xl border-2 flex items-center justify-between gap-3 transition-all text-left ${roundChoices[i] ? 'bg-[#EA580C]/10 border-[#EA580C] text-[#C2410C]' : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#3D3A35]'}`}
                                    >
                                       <div className="flex items-center gap-3 min-w-0">
                                          <div className="grid grid-cols-5 gap-[2px] bg-white p-1 rounded-lg border border-[#E8E2D9] shrink-0" aria-hidden="true">
                                             {card.flat().map((num, idx) => (
                                                <div
                                                   key={idx}
                                                   className={`w-4 h-4 flex items-center justify-center rounded-[2px] text-[8px] font-bold tabular-nums ${num === 0 ? 'bg-[#FACC15] text-[#854D0E]' : 'bg-[#FAF7F2] text-[#3D3A35]'}`}
                                                >
                                                   {num === 0 ? '★' : num}
                                                </div>
                                             ))}
                                          </div>
                                          <div className="min-w-0">
                                             <div className="text-sm font-black uppercase tracking-wider">Card {i + 1}</div>
                                             <div className="text-[11px] font-semibold text-[#6B655D]">
                                                {roundChoices[i] ? 'Will deal new numbers' : 'Keeping these numbers'}
                                             </div>
                                          </div>
                                       </div>
                                       <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full shrink-0 ${roundChoices[i] ? 'bg-[#EA580C] text-white' : 'bg-white border border-[#DED9D1] text-[#6B655D]'}`}>
                                          {roundChoices[i] ? 'Swap' : 'Keep'}
                                       </span>
                                    </button>
                                 ))}
                              </div>
                           </div>
                        ) : (
                           <div className="bg-white rounded-[28px] border-2 border-[#E8E2D9] p-5 shadow-sm text-center">
                              <h3 className="text-[11px] font-bold text-[#6B655D] uppercase tracking-widest mb-3">Join the Next Round?</h3>
                              <div className="grid grid-cols-4 gap-2 max-w-[280px] mx-auto">
                                 {[1, 2, 3, 4].map(num => {
                                    const cost = calculateCardsCost(num, room);
                                    return (
                                       <button key={num} type="button" onClick={() => setCardQuantity(num)} className="py-2 px-1 rounded-xl bg-[#FAF7F2] border-2 border-[#E8E2D9] hover:border-[#EA580C] hover:bg-[#EA580C] hover:text-white text-[#3D3A35] transition-all flex flex-col items-center justify-center leading-none gap-0.5">
                                          <span className="font-display text-lg">{num}</span>
                                          {pricingEnabled && (
                                             <span className="text-[10px] font-bold opacity-85 tabular-nums">{formatPeso(cost)}</span>
                                          )}
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>
                        )}
                        {Object.values(roundChoices).some(Boolean) ? (
                           <button type="button" onClick={applyRoundChoices} className="w-full py-4 rounded-[22px] font-black text-base uppercase tracking-widest shadow-xl transition-all active:scale-95 bg-[#3D3A35] text-white shrink-0">Swap Selected Cards</button>
                        ) : (
                           <button type="button" onClick={() => setPlayerReady()} disabled={me.isReady} className={`w-full py-4 rounded-[22px] font-black text-base uppercase tracking-widest shadow-xl transition-all active:scale-95 shrink-0 ${!me.isReady ? 'bg-[#0D9488] text-white shadow-[0_6px_0_#0F766E]' : 'bg-white border-4 border-[#0D9488] text-[#0F766E]'}`}>{!me.isReady ? "I'm Ready" : "Waiting for others..."}</button>
                        )}
                        <p className="text-center text-xs font-semibold text-[#6B655D] pb-2">
                           {Object.values(roundChoices).some(Boolean) ? 'Selected cards will get new numbers' : cards.length > 0 ? 'Keeping your current cards · Use tabs below anytime' : 'Watching as Spectator'}
                        </p>
                     </div>
                  ) : isSpectator ? (
                     <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center gap-5 overflow-y-auto">
                        <div className="w-20 h-20 bg-[#E8E2D9] rounded-[28px] flex items-center justify-center text-[#7A746B] shadow-inner">
                           <Eye size={40} />
                        </div>
                        <div>
                          <h2 className="text-3xl font-display uppercase tracking-tight text-[#3D3A35]">Spectator Mode</h2>
                          <p className="text-xs sm:text-sm font-semibold text-[#6B655D] leading-relaxed max-w-xs mt-1.5">
                             You're watching the game live. Follow the calls and winning patterns in the tabs below.
                          </p>
                        </div>
                        {!isGameOn && ['waiting', 'next_round'].includes(room.status) && (
                           <div className="bg-white border-2 border-[#E8E2D9] rounded-2xl p-4 w-full max-w-[300px] shadow-sm">
                              <div className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider mb-2">Want to Play? Pick Cards</div>
                              <div className="grid grid-cols-4 gap-2">
                                 {[1, 2, 3, 4].map(num => {
                                    const cost = calculateCardsCost(num, room);
                                    return (
                                       <button
                                          key={num}
                                          type="button"
                                          onClick={() => setCardQuantity(num)}
                                          className="py-2 px-1 rounded-xl bg-[#FAF7F2] border-2 border-[#E8E2D9] hover:border-[#EA580C] hover:bg-[#EA580C] hover:text-white transition-all active:scale-95 flex flex-col items-center justify-center leading-none gap-0.5 text-[#3D3A35]"
                                       >
                                          <span className="font-display text-lg">{num}</span>
                                          {pricingEnabled && (
                                             <span className="text-[10px] font-bold opacity-85 tabular-nums">{formatPeso(cost)}</span>
                                          )}
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>
                        )}
                        <div className="bg-white border-2 border-[#E8E2D9] rounded-2xl p-4 w-full max-w-[240px]">
                           <div className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider mb-1 text-center">Numbers Called</div>
                           <div className="text-3xl font-display text-[#EA580C] tabular-nums">{room.calledNumbers.length} / 75</div>
                        </div>
                     </div>
                  ) : (
                     <>
                        <AnimatePresence>
                           {nearWinAlert && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full bg-[#EA580C]/10 border border-[#EA580C]/25 rounded-xl py-1 text-center overflow-hidden shrink-0">
                                 <span className="text-[10px] font-black text-[#C2410C] uppercase tracking-[0.16em] flex items-center justify-center gap-1.5"><Trophy size={11} />{nearWinAlert}</span>
                              </motion.div>
                           )}
                        </AnimatePresence>
                        {isManualPause && (
                           <div role="status" className="w-full max-w-[440px] mx-auto bg-[#3D3A35] text-white rounded-xl px-3 py-1.5 text-center shrink-0 text-[11px] font-bold flex items-center justify-center gap-1.5">
                              <Pause size={12} className="text-[#FACC15]" />
                              <span>Game Paused by Host — waiting to resume</span>
                           </div>
                        )}
                        {room.status === 'waiting' && (
                           <div role="status" className="w-full max-w-[440px] mx-auto bg-[#0D9488]/10 border border-[#0D9488]/25 text-[#0F766E] rounded-xl px-3 py-1 text-center shrink-0 text-[11px] font-bold">
                              Waiting for Host to start the round
                           </div>
                        )}
                        {falseMarkCardNumbers.length > 0 && (
                           <div role="status" className="w-full max-w-[440px] mx-auto bg-amber-50 border border-amber-400 text-amber-900 rounded-xl px-2.5 py-1 shrink-0 text-[11px] font-bold flex items-center justify-between gap-2">
                              <span className="truncate">Uncalled mark on Card {falseMarkCardNumbers.join(', ')}</span>
                              <button
                                 type="button"
                                 onClick={clearFalseMarks}
                                 className="bg-amber-700 hover:bg-amber-800 text-white px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 active:scale-95"
                              >
                                 Clear
                              </button>
                           </div>
                        )}
                        <div className="flex-1 w-full relative min-h-0 flex flex-col items-center justify-center overflow-hidden">
                            {/* Card Count Selector: unlocked when waiting/next_round, locked and unclickable when game is on */}
                            <div className={`flex items-center justify-between gap-1.5 bg-white border border-[#E8E2D9] px-2.5 py-1 rounded-xl shrink-0 w-full max-w-[440px] mx-auto mb-1 shadow-sm transition-all ${isGameOn ? 'bg-[#FAF7F2]/90 border-dashed opacity-95' : ''}`}>
                               <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D] flex items-center gap-1 shrink-0">
                                     {isGameOn && <Lock size={10} className="text-[#C2410C]" />}
                                     Cards:
                                  </span>
                                  <div className="flex gap-1">
                                     {[1, 2, 3, 4].map(num => {
                                        const cost = calculateCardsCost(num, room);
                                        return (
                                           <button
                                              key={num}
                                              type="button"
                                              disabled={isGameOn}
                                              onClick={() => {
                                                 if (isGameOn) return;
                                                 setCardQuantity(num);
                                              }}
                                              className={`${pricingEnabled ? 'px-2 py-0.5 min-w-[38px]' : 'w-7 h-7'} rounded-md border transition-all flex flex-col items-center justify-center leading-none ${cards.length === num ? 'bg-[#EA580C] border-[#EA580C] text-white shadow-sm' : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#6B655D]'} ${isGameOn ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer active:scale-95'}`}
                                              title={isGameOn ? 'Cards are locked during active game' : `Select ${num} card${num > 1 ? 's' : ''}${pricingEnabled ? ` (${formatPeso(cost)})` : ''}`}
                                           >
                                              <span className="font-display text-xs leading-none">{num}</span>
                                              {pricingEnabled && (
                                                 <span className={`text-[10px] font-bold leading-none mt-0.5 tabular-nums ${cards.length === num ? 'text-white/95' : 'text-[#6B655D]'}`}>
                                                    {formatPeso(cost)}
                                                 </span>
                                              )}
                                           </button>
                                        );
                                     })}
                                  </div>
                               </div>
                               <div className="flex items-center gap-1.5 shrink-0">
                                  {pricingEnabled && myCardCost > 0 && (
                                     <span className="text-[10px] font-black text-[#C2410C] bg-[#EA580C]/10 px-1.5 py-0.5 rounded-md tabular-nums">
                                        {formatPeso(myCardCost)}
                                     </span>
                                  )}
                                  {cards.length >= 2 && (
                                     <button
                                        type="button"
                                        onClick={() => setCardViewMode(m => (m === 'grid' ? 'focus' : 'grid'))}
                                        aria-pressed={cardViewMode === 'focus'}
                                        className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border transition-all flex items-center gap-1 active:scale-95 ${cardViewMode === 'focus' ? 'bg-[#3D3A35] border-[#3D3A35] text-white' : 'bg-[#FAF7F2] border-[#DED9D1] text-[#3D3A35] hover:border-[#6B655D]'}`}
                                        title={cardViewMode === 'focus' ? 'Switch back to 2×2 grid' : 'Zoom in on one card at a time'}
                                     >
                                        {cardViewMode === 'focus' ? <Grid2x2 size={11} /> : <Maximize2 size={11} />}
                                        <span>{cardViewMode === 'focus' ? 'Grid' : 'Focus'}</span>
                                     </button>
                                  )}
                                  <button
                                     type="button"
                                     disabled={isGameOn}
                                     onClick={() => {
                                        if (isGameOn) return;
                                        setCardQuantity(cards.length || 1);
                                     }}
                                     className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md transition-all flex items-center gap-1 ${isGameOn ? 'text-[#6B655D] bg-[#F3EFE9] border border-[#E8E2D9] cursor-not-allowed pointer-events-none' : 'text-[#0F766E] bg-[#0D9488]/10 hover:bg-[#0D9488]/20 cursor-pointer active:scale-95'}`}
                                     title={isGameOn ? 'Card numbers are locked during active game' : 'Generate new random card numbers'}
                                  >
                                     {isGameOn ? (
                                        <>
                                           <Lock size={9} className="text-[#6B655D]" />
                                           <span>Locked</span>
                                        </>
                                     ) : (
                                        'New'
                                     )}
                                  </button>
                               </div>
                            </div>
                            {/* Dikit Fight Active Alert Banner */}
                            {room?.dikitFight?.status === "active" && (
                               <div className="w-full max-w-[440px] bg-[#0D9488]/15 border border-[#0D9488]/40 rounded-xl px-2.5 py-1 text-center shrink-0 mb-1 flex items-center justify-between gap-1 shadow-sm">
                                  <span className="text-[10px] font-black text-[#0F766E] uppercase tracking-wider flex items-center gap-1 shrink-0">
                                     <Swords size={12} aria-hidden="true" /> DIKIT FIGHT
                                  </span>
                                  <span className="text-[10px] font-bold text-[#3D3A35] truncate max-w-[240px]">
                                     {room.dikitFight.roundBingoPending
                                        ? "Bingo Won! Fighting for Dikit..."
                                        : room.dikitFight.contenders.map(c => c.playerName).join(" vs ")}
                                  </span>
                               </div>
                            )}

                           {cards.length >= 2 && cardViewMode === 'focus' && (
                              <div className="w-full h-full max-w-[420px] flex flex-col items-center justify-center min-h-0 overflow-hidden gap-1">
                                 <div className="flex items-center justify-between gap-1.5 w-full max-w-[360px] shrink-0 px-1">
                                    <button
                                       type="button"
                                       aria-label="Previous card"
                                       onClick={() => setFocusedCardIdx((safeFocusedIdx - 1 + cards.length) % cards.length)}
                                       className="w-8 h-8 rounded-lg bg-white border border-[#DED9D1] text-[#3D3A35] flex items-center justify-center active:scale-95 shrink-0"
                                    >
                                       <ChevronLeft size={16} />
                                    </button>
                                    <div className="flex items-center gap-1 flex-1 justify-center">
                                       {cards.map((_, idx) => {
                                          const isNear = hasCalledBalls && cardStatus[idx]?.win.cellsAway === 1;
                                          const isWin = cardStatus[idx]?.win.valid;
                                          return (
                                             <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setFocusedCardIdx(idx)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1 ${
                                                   safeFocusedIdx === idx
                                                      ? 'bg-[#3D3A35] text-white shadow-sm'
                                                      : isWin
                                                         ? 'bg-[#EA580C] text-white'
                                                         : isNear
                                                            ? 'bg-[#FACC15] text-[#854D0E]'
                                                            : 'bg-white border border-[#E8E2D9] text-[#6B655D]'
                                                }`}
                                             >
                                                <span>C{idx + 1}</span>
                                                {isNear && <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />}
                                             </button>
                                          );
                                       })}
                                    </div>
                                    <button
                                       type="button"
                                       aria-label="Next card"
                                       onClick={() => setFocusedCardIdx((safeFocusedIdx + 1) % cards.length)}
                                       className="w-8 h-8 rounded-lg bg-white border border-[#DED9D1] text-[#3D3A35] flex items-center justify-center active:scale-95 shrink-0"
                                    >
                                       <ChevronRight size={16} />
                                    </button>
                                 </div>
                                 <div className="flex items-center justify-between w-full max-w-[340px] px-1 shrink-0 h-5">
                                    <div className="flex items-center gap-1.5">
                                       <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B655D]">Card {safeFocusedIdx + 1} of {cards.length}</span>
                                       {isCardInDikitFight(safeFocusedIdx) && (
                                          <span className="bg-[#0D9488] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse inline-flex items-center gap-1"><Swords size={10} />In Dikit Fight</span>
                                       )}
                                    </div>
                                    {hasCalledBalls && cardStatus[safeFocusedIdx]?.win.cellsAway === 1 && (
                                       <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse">1 Away</span>
                                    )}
                                 </div>
                                 <div className="flex-1 min-h-0 w-full flex items-center justify-center card-fit-wrapper">
                                    <div className="card-fit-square relative flex items-center justify-center">
                                       <BingoCard
                                          card={cards[safeFocusedIdx]}
                                          markedCells={markedCells[safeFocusedIdx] || []}
                                          calledNumbers={room.calledNumbers || []}
                                          onToggleCell={(num) => toggleCell(safeFocusedIdx, num)}
                                          readOnly={!isPlayingOrClaimPause}
                                          highlightLatest={latestBall}
                                       />
                                       {cardStatus[safeFocusedIdx]?.win.valid && (
                                          <div className="absolute inset-0 border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                       )}
                                    </div>
                                 </div>
                              </div>
                           )}

                           {cards.length === 1 && (
                              <div className="w-full h-full max-w-[420px] flex flex-col items-center justify-center min-h-0 overflow-hidden">
                                 <div className="flex items-center justify-between w-full max-w-[340px] px-1 shrink-0 h-5 mb-0.5">
                                    <div className="flex items-center gap-1.5">
                                       <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D]">Card 1</span>
                                       {isCardInDikitFight(0) && (
                                          <span className="bg-[#0D9488] text-white text-[10px] font-black px-2 rounded-full uppercase animate-pulse inline-flex items-center gap-1"><Swords size={10} />In Dikit Fight</span>
                                       )}
                                    </div>
                                    {hasCalledBalls && cardStatus[0]?.win.cellsAway === 1 && (
                                       <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-2 rounded-full uppercase animate-pulse">1 Away</span>
                                    )}
                                 </div>
                                 <div className="flex-1 min-h-0 w-full flex items-center justify-center card-fit-wrapper">
                                    <div className="card-fit-square relative flex items-center justify-center">
                                       <BingoCard
                                          card={cards[0]}
                                          markedCells={markedCells[0] || []}
                                          calledNumbers={room.calledNumbers || []}
                                          onToggleCell={(num) => toggleCell(0, num)}
                                          readOnly={!isPlayingOrClaimPause}
                                          highlightLatest={latestBall}
                                       />
                                       {cardStatus[0]?.win.valid && (
                                          <div className="absolute inset-0 border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                       )}
                                    </div>
                                 </div>
                              </div>
                           )}

                           {cards.length === 2 && cardViewMode === 'grid' && (
                              <div className="w-full h-full max-w-[440px] flex flex-col justify-between items-center gap-1 min-h-0 overflow-hidden">
                                 {/* Card 1 - Above */}
                                 <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
                                    <div className="flex items-center justify-between w-full max-w-[340px] px-1 shrink-0 h-5 mb-0.5">
                                       <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D]">Card 1</span>
                                          {isCardInDikitFight(0) && (
                                             <span className="bg-[#0D9488] text-white text-[10px] font-black px-2 rounded-full uppercase animate-pulse inline-flex items-center gap-1"><Swords size={10} />Fight</span>
                                          )}
                                       </div>
                                       {hasCalledBalls && cardStatus[0]?.win.cellsAway === 1 && (
                                          <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-2 rounded-full uppercase animate-pulse">1 Away</span>
                                       )}
                                    </div>
                                    <div className="flex-1 min-h-0 w-full flex items-center justify-center card-fit-wrapper">
                                       <div className="card-fit-square relative flex items-center justify-center">
                                          <BingoCard
                                             card={cards[0]}
                                             markedCells={markedCells[0] || []}
                                             calledNumbers={room.calledNumbers || []}
                                             onToggleCell={(num) => toggleCell(0, num)}
                                             readOnly={!isPlayingOrClaimPause}
                                             highlightLatest={latestBall}
                                          />
                                          {cardStatus[0]?.win.valid && (
                                             <div className="absolute inset-0 border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                          )}
                                       </div>
                                    </div>
                                 </div>

                                 {/* Card 2 - Below */}
                                 <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
                                    <div className="flex items-center justify-between w-full max-w-[340px] px-1 shrink-0 h-5 mb-0.5">
                                       <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D]">Card 2</span>
                                          {isCardInDikitFight(1) && (
                                             <span className="bg-[#0D9488] text-white text-[10px] font-black px-2 rounded-full uppercase animate-pulse inline-flex items-center gap-1"><Swords size={10} />Fight</span>
                                          )}
                                       </div>
                                       {hasCalledBalls && cardStatus[1]?.win.cellsAway === 1 && (
                                          <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-2 rounded-full uppercase animate-pulse">1 Away</span>
                                       )}
                                    </div>
                                    <div className="flex-1 min-h-0 w-full flex items-center justify-center card-fit-wrapper">
                                       <div className="card-fit-square relative flex items-center justify-center">
                                          <BingoCard
                                             card={cards[1]}
                                             markedCells={markedCells[1] || []}
                                             calledNumbers={room.calledNumbers || []}
                                             onToggleCell={(num) => toggleCell(1, num)}
                                             readOnly={!isPlayingOrClaimPause}
                                             highlightLatest={latestBall}
                                          />
                                          {cardStatus[1]?.win.valid && (
                                             <div className="absolute inset-0 border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                          )}
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           )}

                           {cards.length === 3 && cardViewMode === 'grid' && (
                              <div className="w-full h-full max-w-[480px] flex flex-col gap-1 min-h-0 overflow-hidden">
                                 {/* Card 1 - Top Center */}
                                 <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
                                    <div className="flex items-center justify-between w-full max-w-[280px] px-1 shrink-0 h-4 mb-0.5">
                                       <div className="flex items-center gap-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D]">Card 1</span>
                                          {isCardInDikitFight(0) && (
                                             <span className="bg-[#0D9488] text-white text-[10px] font-black px-1.5 rounded-full uppercase animate-pulse inline-flex items-center gap-0.5"><Swords size={9} />Fight</span>
                                          )}
                                       </div>
                                       {hasCalledBalls && cardStatus[0]?.win.cellsAway === 1 && (
                                          <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-1.5 rounded-full uppercase animate-pulse">1 Away</span>
                                       )}
                                    </div>
                                    <div className="flex-1 min-h-0 w-full flex items-center justify-center card-fit-wrapper">
                                       <div className="card-fit-square relative flex items-center justify-center">
                                          <BingoCard
                                             card={cards[0]}
                                             markedCells={markedCells[0] || []}
                                             calledNumbers={room.calledNumbers || []}
                                             onToggleCell={(num) => toggleCell(0, num)}
                                             readOnly={!isPlayingOrClaimPause}
                                             highlightLatest={latestBall}
                                          />
                                          {cardStatus[0]?.win.valid && (
                                             <div className="absolute inset-0 border-2 sm:border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                          )}
                                       </div>
                                    </div>
                                 </div>

                                 {/* Cards 2 & 3 - Bottom Row */}
                                 <div className="w-full flex-1 grid grid-cols-2 gap-1 min-h-0 overflow-hidden">
                                    {[1, 2].map((idx) => {
                                       const isNearWin = hasCalledBalls && cardStatus[idx]?.win.cellsAway === 1;
                                       return (
                                          <div key={idx} className="w-full h-full flex flex-col items-center justify-center min-h-0 min-w-0 overflow-hidden">
                                             <div className="flex items-center justify-between w-full px-1 shrink-0 h-4 mb-0.5">
                                                <div className="flex items-center gap-1">
                                                   <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D]">Card {idx + 1}</span>
                                                   {isCardInDikitFight(idx) && (
                                                      <span className="bg-[#0D9488] text-white text-[10px] font-black px-1.5 rounded-full uppercase animate-pulse inline-flex items-center gap-0.5"><Swords size={9} />Fight</span>
                                                   )}
                                                </div>
                                                {isNearWin && (
                                                   <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-1.5 rounded-full uppercase animate-pulse">1 Away</span>
                                                )}
                                             </div>
                                             <div className="flex-1 min-h-0 min-w-0 w-full h-full flex items-center justify-center card-fit-wrapper">
                                                <div className="card-fit-square relative flex items-center justify-center">
                                                   <BingoCard
                                                      card={cards[idx]}
                                                      markedCells={markedCells[idx] || []}
                                                      calledNumbers={room.calledNumbers || []}
                                                      onToggleCell={(num) => toggleCell(idx, num)}
                                                      readOnly={!isPlayingOrClaimPause}
                                                      highlightLatest={latestBall}
                                                   />
                                                   {cardStatus[idx]?.win.valid && (
                                                      <div className="absolute inset-0 border-2 sm:border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                                   )}
                                                </div>
                                             </div>
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           )}

                           {cards.length === 4 && cardViewMode === 'grid' && (
                              <div className="w-full h-full max-w-[480px] grid grid-cols-2 grid-rows-2 gap-1 p-0.5 min-h-0 overflow-hidden">
                                 {cards.map((card, idx) => {
                                    const isNearWin = hasCalledBalls && cardStatus[idx]?.win.cellsAway === 1;
                                    return (
                                       <div key={idx} className="w-full h-full flex flex-col items-center justify-center min-h-0 min-w-0 overflow-hidden">
                                          <div className="flex items-center justify-between w-full px-1 shrink-0 h-4 mb-0.5">
                                             <div className="flex items-center gap-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B655D]">Card {idx + 1}</span>
                                                {isCardInDikitFight(idx) && (
                                                   <span className="bg-[#0D9488] text-white text-[10px] font-black px-1.5 rounded-full uppercase animate-pulse inline-flex items-center gap-0.5"><Swords size={9} />Fight</span>
                                                )}
                                             </div>
                                             {isNearWin && (
                                                <span className="bg-[#FACC15] text-[#854D0E] text-[10px] font-black px-1.5 rounded-full uppercase animate-pulse">1 Away</span>
                                             )}
                                          </div>
                                          <div className="flex-1 min-h-0 min-w-0 w-full h-full flex items-center justify-center card-fit-wrapper">
                                             <div className="card-fit-square relative flex items-center justify-center">
                                                <BingoCard
                                                   card={card}
                                                   markedCells={markedCells[idx] || []}
                                                   calledNumbers={room.calledNumbers || []}
                                                   onToggleCell={(num) => toggleCell(idx, num)}
                                                   readOnly={!isPlayingOrClaimPause}
                                                   highlightLatest={latestBall}
                                                />
                                                {cardStatus[idx]?.win.valid && (
                                                   <div className="absolute inset-0 border-2 sm:border-4 border-[#EA580C] rounded-[8cqw] pointer-events-none animate-pulse z-20" />
                                                )}
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           )}
                        </div>
                        <div className="flex justify-center shrink-0 py-0.5 sm:py-1">
                           <button type="button" onClick={() => setAutoMark(!autoMark)} aria-pressed={autoMark} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border font-bold text-[10px] uppercase tracking-wider transition-all ${autoMark ? 'bg-[#0D9488] border-[#0D9488] text-white shadow-sm' : 'bg-white border-[#E8E2D9] text-[#6B655D]'}`}>
                              <CheckCircle2 size={12} fill={autoMark ? "currentColor" : "none"} />Auto-Marking {autoMark ? 'ON' : 'OFF'}
                           </button>
                        </div>
                     </>
                  )}
               </motion.div>
            )}
            {activeTab === 'pattern' && (
               <motion.div key="pattern" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-4 sm:gap-6 overflow-y-auto custom-scrollbar">
                  <div className="text-center shrink-0 pt-2">
                     <h3 className="text-xs font-bold text-[#6B655D] uppercase tracking-[0.22em] mb-1">Winning Patterns</h3>
                     <div className="flex items-center justify-center gap-2">
                        <p className="text-2xl font-black text-[#EA580C] uppercase tracking-tighter italic">{room.mode === 'Bingo' ? 'Standard Bingo' : room.mode}</p>
                        {!room.hidePattern && room.mode === 'Bingo' && (
                           <span className="text-[10px] font-black uppercase bg-[#0D9488]/10 text-[#0D9488] px-2.5 py-0.5 rounded-full tabular-nums">
                              {room.patterns.length} Active
                           </span>
                        )}
                     </div>
                  </div>
                  {!room.hidePattern ? (
                    <div className="bg-white p-4 sm:p-6 rounded-[28px] sm:rounded-[36px] border-4 border-[#E8E2D9] shadow-lg w-full max-w-xl">
                       {room.mode === 'Bingo' ? (
                          <PatternVisualizer patterns={room.patterns} size="md" />
                       ) : (
                          <div className="py-8 text-center">
                             <div className="text-3xl font-display text-[#EA580C] uppercase italic">{room.mode}</div>
                             <p className="text-xs font-bold text-[#6B655D] uppercase tracking-widest mt-2">
                                {room.mode === 'Blackout' ? 'Mark all 25 squares to win!' : 'Mark any 2 adjacent horizontal numbers!'}
                             </p>
                          </div>
                       )}
                    </div>
                  ) : (
                    <div className="bg-white p-10 rounded-[36px] border-4 border-dashed border-[#E8E2D9] flex flex-col items-center gap-4 text-[#6B655D] w-full max-w-sm">
                       <Eye size={56} className="opacity-50" /><span className="text-xs font-bold uppercase tracking-[0.28em]">Mystery Pattern</span>
                    </div>
                  )}
                  {(dikitPrize > 0 || bingoPrize > 0 || totalCollected > 0) && (
                    <div className="bg-white p-4 rounded-[28px] border-2 border-[#E8E2D9] shadow-sm w-full max-w-xl shrink-0 space-y-2.5">
                       <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.18em] flex items-center gap-1.5">
                             <Coins size={13} className="text-[#EA580C]" />
                             Round Prizes
                          </span>
                          {totalCollected > 0 && (
                             <span className="text-[11px] font-black text-[#3D3A35] bg-[#FAF7F2] border border-[#E8E2D9] px-2.5 py-0.5 rounded-full tabular-nums">
                                Pot: {formatPeso(totalCollected)}
                             </span>
                          )}
                       </div>
                       <div className="grid grid-cols-2 gap-2.5">
                          <div className="bg-[#0D9488]/10 border border-[#0D9488]/20 rounded-2xl p-3 text-center">
                             <div className="text-[10px] font-black text-[#0D9488] uppercase tracking-wider">⚔️ Dikit Prize</div>
                             <div className="text-2xl font-display text-[#0D9488] tabular-nums mt-0.5">{dikitPrize > 0 ? formatPeso(dikitPrize) : '—'}</div>
                          </div>
                          <div className="bg-[#EA580C]/10 border border-[#EA580C]/20 rounded-2xl p-3 text-center">
                             <div className="text-[10px] font-black text-[#EA580C] uppercase tracking-wider">🏆 Bingo Prize</div>
                             <div className="text-2xl font-display text-[#EA580C] tabular-nums mt-0.5">{bingoPrize > 0 ? formatPeso(bingoPrize) : '—'}</div>
                          </div>
                       </div>
                    </div>
                  )}
                  {room.prizeText && <div className="bg-[#FACC15]/20 px-6 py-4 rounded-2xl border-2 border-[#FACC15] text-center w-full max-w-xl shrink-0"><p className="text-[11px] font-bold text-[#854D0E] uppercase tracking-widest mb-1">Prize Note</p><p className="text-xl font-black text-[#854D0E]">{room.prizeText}</p></div>}
               </motion.div>
            )}
            {activeTab === 'history' && (
               <motion.div key="history" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-1 flex flex-col p-6 overflow-hidden">
                  <h3 className="text-xs font-bold text-[#6B655D] uppercase tracking-[0.2em] mb-6">Call History</h3>
                  <div className="grid grid-cols-5 gap-3 overflow-y-auto pr-2 custom-scrollbar pb-12">
                     {[...room.calledNumbers].reverse().map((n, i) => (
                        <div key={i} className="aspect-square bg-white border-2 border-[#E8E2D9] rounded-xl flex flex-col items-center justify-center shadow-sm">
                           <span className="text-[10px] font-bold text-[#6B655D] leading-none mb-0.5">{getBallLetter(n)}</span>
                           <span className="text-lg font-display text-[#3D3A35] leading-none tabular-nums">{n}</span>
                        </div>
                     ))}
                     {room.calledNumbers.length === 0 && <div className="col-span-5 py-20 text-center text-[#6B655D] font-semibold italic">No numbers called yet</div>}
                  </div>
               </motion.div>
            )}
            {activeTab === 'stats' && (
               <motion.div key="stats" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="flex-1 flex flex-col p-6 sm:p-8 gap-5 overflow-y-auto">
                  <div className="text-center mb-1">
                     <h3 className="text-xs font-bold text-[#6B655D] uppercase tracking-[0.22em] mb-1">Game Stats</h3>
                     <p className="text-xs font-semibold text-[#6B655D]">Round Overview</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2] pointer-events-none" />
                        <Users size={20} className="text-[#0D9488] mb-2 relative z-10" />
                        <div className="text-4xl font-display tabular-nums relative z-10">{Object.values(room.players).length}</div>
                        <div className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider relative z-10">{Object.values(room.players).length === 1 ? 'Player' : 'Players'}</div>
                     </div>
                     <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2] pointer-events-none" />
                        <Ticket size={20} className="text-[#EA580C] mb-2 relative z-10" />
                        <div className="text-4xl font-display tabular-nums relative z-10">{room.stats?.totalCardsSold || 0}</div>
                        <div className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider relative z-10">{(room.stats?.totalCardsSold || 0) === 1 ? 'Card Sold' : 'Cards Sold'}</div>
                     </div>
                  </div>
                  {(pricingEnabled || totalCollected > 0 || dikitPrize > 0 || bingoPrize > 0) && (
                     <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                           <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider flex items-center gap-1.5">
                              <Coins size={14} className="text-[#EA580C]" />
                              Pot &amp; Prizes
                           </span>
                           <span className="text-2xl font-display text-[#3D3A35] tabular-nums">{formatPeso(totalCollected)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <div className="bg-[#0D9488]/10 rounded-2xl p-3">
                              <div className="text-[10px] font-black text-[#0D9488] uppercase tracking-wider">⚔️ Dikit Prize</div>
                              <div className="text-xl font-display text-[#0D9488] tabular-nums">{dikitPrize > 0 ? formatPeso(dikitPrize) : 'Not set'}</div>
                           </div>
                           <div className="bg-[#EA580C]/10 rounded-2xl p-3">
                              <div className="text-[10px] font-black text-[#EA580C] uppercase tracking-wider">🏆 Bingo Prize</div>
                              <div className="text-xl font-display text-[#EA580C] tabular-nums">{bingoPrize > 0 ? formatPeso(bingoPrize) : 'Not set'}</div>
                           </div>
                        </div>
                        {pricingEnabled && (
                           <div className="pt-2 border-t border-[#FAF7F2] flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#6B655D]">
                              <span>1 Card: {formatPeso(calculateCardsCost(1, room))} · 2: {formatPeso(calculateCardsCost(2, room))} · 4: {formatPeso(calculateCardsCost(4, room))}</span>
                              {cards.length > 0 && (
                                 <span className="font-black text-[#EA580C]">My Cost: {formatPeso(myCardCost)}</span>
                              )}
                           </div>
                        )}
                     </div>
                  )}
                  <div className="bg-white p-5 rounded-[32px] border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2] pointer-events-none" />
                     <div className="flex items-center justify-between relative z-10">
                        <LayoutGrid size={20} className="text-[#EA580C] mb-2" />
                        {cards.length > 0 && ['waiting', 'next_round'].includes(room.status) && (
                           <button 
                              type="button"
                              onClick={() => {
                                 const newCards = Array.from({ length: cards.length }, () => generateRandomCard());
                                 const emptyMarked: Record<number, number[]> = {};
                                 newCards.forEach((_, i) => { emptyMarked[i] = [0]; });
                                 setMarkedCells(emptyMarked);
                                 setCards(newCards);
                                 playSound(SOUNDS.BALL_DRAW, 0.5);
                              }}
                              className="px-3 py-1 bg-[#EA580C] text-white text-[10px] font-black uppercase rounded-lg shadow-md active:scale-95 transition-all"
                           >
                              Change Cards
                           </button>
                        )}
                     </div>
                     <div className="text-4xl font-display tabular-nums relative z-10">{cards.length}</div>
                     <div className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider relative z-10">My Cards</div>
                  </div>
                  <div className="bg-white p-6 rounded-[40px] border-4 border-[#E8E2D9] shadow-inner relative overflow-hidden paper-texture">
                     <div className="flex items-center gap-3 mb-6 relative z-10">
                        <Trophy size={20} className="text-[#FACC15]" />
                        <h4 className="text-xs font-black text-[#3D3A35] uppercase tracking-widest">Hall of Fame</h4>
                     </div>
                     <div className="space-y-4 relative z-10">
                        {hallOfFame.slice(-10).reverse().map((w, i) => (
                           <div key={i} className="flex items-center justify-between p-4 bg-[#FAF7F2] border-2 border-white rounded-[24px] shadow-sm paper-texture overflow-hidden relative">
                              <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent pointer-events-none" />
                              <div className="relative z-10">
                                 <div className="text-sm font-black text-[#3D3A35] uppercase italic">{w.name}</div>
                                 <div className="text-[11px] font-bold text-[#6B655D] uppercase tracking-tight">{w.pattern}</div>
                              </div>
                              <div className="text-[10px] font-black text-[#EA580C] bg-[#EA580C]/10 px-3 py-1 rounded-full border border-[#EA580C]/20 relative z-10">
                                 {new Date(w.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </div>
                           </div>
                        ))}
                        {hallOfFame.length === 0 && <div className="text-center py-6 text-[#6B655D] font-semibold italic text-xs">Waiting for the first all-time winner!</div>}
                     </div>
                  </div>
                  <button
                     type="button"
                     onClick={handleLeaveClick}
                     className={`w-full py-4 mt-2 rounded-[24px] font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-sm border-2 ${confirmLeave ? 'bg-[#B91C1C] border-[#B91C1C] text-white' : 'bg-red-50 text-[#B91C1C] border-red-200'}`}
                  >
                     {confirmLeave ? 'Tap Again to Leave Room' : 'Leave Room'}
                  </button>
               </motion.div>
            )}
         </AnimatePresence>
      </main>

      <AnimatePresence>
         {showClaimBar && (
            <motion.div
               initial={{ y: 40, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 40, opacity: 0 }}
               className="shrink-0 px-3 pt-1.5 pb-2 bg-[#FAF7F2] border-t border-[#E8E2D9] z-30 flex flex-col gap-1.5 max-w-md w-full mx-auto"
            >
               {dikitCardIdx !== -1 && room.status === 'playing' && (
                  <button type="button" onClick={handleDikitClaim} className="w-full bg-[#0D9488] text-white py-2.5 rounded-2xl font-black text-base uppercase tracking-[0.1em] shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none">
                     Dikit Hit!
                  </button>
               )}
               {winningCardIdx !== -1 && (
                  <button type="button" onClick={() => setShowClaimConfirm(true)} className="w-full bg-gradient-to-r from-[#EA580C] to-[#C2410C] text-white py-3.5 rounded-2xl font-black text-xl uppercase tracking-[0.14em] shadow-[0_6px_0_#9A3412] active:translate-y-[5px] active:shadow-none animate-bingo-glow">
                     {room.status === 'paused' ? 'I ALSO HAVE BINGO!' : 'BINGO AVAILABLE!'}
                  </button>
               )}
            </motion.div>
         )}
      </AnimatePresence>

      <nav className="h-14 sm:h-16 bg-white border-t-2 border-[#E8E2D9] grid grid-cols-4 gap-1 px-2 shrink-0 z-30 pb-safe relative" aria-label="Player tabs">
         {[{ id: 'cards', icon: LayoutGrid, label: 'Cards' },{ id: 'pattern', icon: Eye, label: 'Pattern' },{ id: 'history', icon: History, label: 'Calls' },{ id: 'stats', icon: Trophy, label: 'Stats' },].map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as any)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-0.5 transition-all ${activeTab === tab.id ? 'text-[#C2410C]' : 'text-[#6B655D] hover:text-[#3D3A35]'}`}>
               <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.75 : 2} /><span className="text-[10px] font-bold uppercase tracking-tight">{tab.label}</span>
            </button>
         ))}
      </nav>

      <AnimatePresence>
         {showClaimConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#3D3A35]/80 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Confirm Bingo Claim">
               <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white rounded-[40px] border-4 border-[#EA580C] p-8 w-full max-w-sm text-center shadow-2xl">
                  <Trophy size={48} className="text-[#EA580C] mx-auto mb-4" /><h3 className="text-3xl font-black uppercase tracking-tighter mb-2 italic">Ready to Win?</h3><p className="text-sm font-semibold text-[#6B655D] mb-8 leading-relaxed">This will pause the game for everyone and notify the Host. Are you sure you have Bingo?</p>
                  <div className="flex flex-col gap-3"><button type="button" onClick={handleClaim} className="w-full py-5 bg-[#EA580C] text-white rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_6px_0_#9A3412] active:translate-y-[4px] active:shadow-none">YES, BINGO!</button><button type="button" onClick={() => setShowClaimConfirm(false)} className="w-full py-4 bg-[#FAF7F2] border-2 border-[#E8E2D9] text-[#6B655D] hover:text-[#3D3A35] rounded-2xl font-black text-sm uppercase tracking-widest">Wait, Go Back</button></div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {claimAlert && !winner && room.status === 'paused' && (
         <div className="fixed top-16 sm:top-[4.5rem] left-3 right-3 sm:left-4 sm:right-4 z-40 bg-[#3D3A35] text-white p-3 rounded-2xl shadow-2xl border-2 border-[#FACC15] flex items-center justify-between gap-3 max-w-lg mx-auto">
            <div className="flex items-center gap-3 min-w-0">
               <Loader className="w-5 h-5 text-[#FACC15] animate-spin shrink-0" />
               <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#FACC15]">
                     Bingo Claim In Progress
                  </div>
                  <div className="text-sm font-bold truncate">
                     {claimAlert.playerId === me.id ? "Host is verifying your card..." : `${claimAlert.playerName} called Bingo!`}
                  </div>
               </div>
            </div>
            {winningCardIdx !== -1 && (
               <button
                 type="button"
                 onClick={() => setShowClaimConfirm(true)}
                 className="bg-[#EA580C] text-white px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider shrink-0 shadow-lg hover:brightness-110 active:scale-95"
               >
                 I Also Won!
               </button>
            )}
         </div>
      )}

      <AnimatePresence>
         {dikitAlert && (
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className="fixed top-16 sm:top-[4.5rem] left-3 right-3 sm:left-4 sm:right-4 max-w-md mx-auto z-[55] bg-[#0D9488] text-white p-4 rounded-2xl shadow-2xl border-2 border-white flex flex-col gap-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
               <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center shrink-0"><Trophy size={22} /></div>
                  <div className="flex-1 min-w-0">
                     <div className="text-[10px] font-black uppercase tracking-widest text-white/90">
                        {dikitAlert.length > 1 ? 'MULTIPLE DIKIT WINS!' : 'Dikit Sidebet Hit!'}
                     </div>
                     <div className="text-lg font-black truncate leading-tight">
                        {dikitAlert.map((w: any) => w.playerName).join(' & ')}
                     </div>
                     <div className="text-[10px] font-bold uppercase tracking-wider text-white/90 mt-0.5">
                        {dikitPrize > 0
                           ? `Prize: ${formatPeso(dikitPrize)}${dikitAlert.length > 1 ? ` (${formatPeso(dikitPrize / dikitAlert.length)} each)` : ''} · Game continues`
                           : 'Sidebet winner announced · Game continues'}
                     </div>
                  </div>
                  <button type="button" onClick={() => dismissDikit()} aria-label="Dismiss Dikit announcement" className="text-white/85 hover:text-white shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors">
                     <Plus size={20} className="rotate-45" />
                  </button>
               </div>
               <div className="flex gap-3 overflow-x-auto w-full pb-1 snap-x custom-scrollbar justify-center">
                  {dikitAlert.map((alert: any, aIdx: number) => (
                     <div key={alert.id || aIdx} className="bg-white/10 p-3 rounded-2xl border border-white/20 shrink-0 snap-center">
                        <div className="text-center text-xs font-bold mb-1.5">
                           {alert.playerName} <span className="opacity-85">· Card {(alert.cardIndex ?? 0) + 1}</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                           {['B','I','N','G','O'].map(l => (
                              <div key={l} className="text-center font-black text-[10px] text-white/85">{l}</div>
                           ))}
                           {alert.card.map((row: number[], rIdx: number) => row.map((num: number, cIdx: number) => {
                              const called = num === 0 || room.calledNumbers.includes(num);
                              return (
                                 <div key={`${rIdx}-${cIdx}`} className={`w-6 h-6 flex items-center justify-center font-black text-[10px] rounded-md border tabular-nums ${num === 0 ? 'bg-[#FACC15] text-[#854D0E] border-[#FACC15]' : called ? 'bg-white text-[#0F766E] border-white shadow-md' : 'bg-[#0F766E] border-white/25 text-white/85'}`}>
                                    {num === 0 ? '★' : num}
                                 </div>
                              );
                           }))}
                        </div>
                     </div>
                  ))}
               </div>
            </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence>
        {winner && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} role="dialog" aria-modal="true" aria-label="Bingo Winner" className="fixed inset-0 bg-[#3D3A35]/90 backdrop-blur-xl flex justify-center items-center z-[60] p-4 sm:p-6">
             <motion.div initial={{scale:0.85, y:40}} animate={{scale:1, y:0}} className="bg-white rounded-[36px] border-[8px] border-[#FACC15] w-full max-w-md p-5 sm:p-7 shadow-2xl text-center relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/10 to-transparent opacity-50 pointer-events-none" />
                <div className="relative z-10 flex flex-col min-h-0 flex-1">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto bg-gradient-to-br from-[#FACC15] to-[#EA580C] rounded-full flex items-center justify-center mb-3 shadow-xl shrink-0">
                    <Trophy className="text-white" size={30} />
                  </div>
                  
                  <h2 className="text-3xl sm:text-4xl font-display text-[#3D3A35] mb-1 uppercase tracking-tight shrink-0">
                    {winner.some((w: any) => w.playerId === me?.id)
                      ? (winner.length > 1 ? 'YOU & OTHERS WON!' : 'YOU WON!')
                      : (winner.length > 1 ? `${winner.length} BINGO WINNERS!` : 'BINGO WINNER!')}
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-[#6B655D] mb-2 shrink-0">
                    <span className="font-black text-[#C2410C]">{winner.map((w: any) => w.playerName).join(', ')}</span>
                  </p>
                  {bingoPrize > 0 && (
                    <div className="inline-flex items-center justify-center gap-1.5 mx-auto mb-2 px-3 py-1 rounded-full bg-[#EA580C]/10 border border-[#EA580C]/30 text-xs font-black text-[#C2410C] tabular-nums shrink-0">
                      <Trophy size={13} aria-hidden="true" /> Prize: {formatPeso(bingoPrize)}
                      {winner.length > 1 && <span className="text-[10px] font-bold">({formatPeso(bingoPrize / winner.length)} each)</span>}
                    </div>
                  )}
                  {room.status === 'next_round' && (
                    <div className="inline-flex items-center justify-center gap-1.5 mx-auto mb-3 px-3 py-1 rounded-full bg-[#FAF7F2] border border-[#E8E2D9] text-[10px] font-black uppercase tracking-widest text-[#6B655D] shrink-0 tabular-nums">
                      Next round auto-starting in <span className="text-[#C2410C]"><Countdown endsAt={room.nextRoundEndsAt} /></span>
                    </div>
                  )}

                  {/* Winning Bingo Cards Display */}
                  <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar mb-4 space-y-3 pr-1">
                    {winner.map((w: any, wIdx: number) => {
                      const isMe = w.playerId === me?.id;
                      return (
                        <div key={w.id || wIdx} className={`p-3 rounded-2xl border-2 shadow-sm ${isMe ? 'bg-[#0D9488]/5 border-[#0D9488]' : 'bg-[#FAF7F2] border-[#E8E2D9]'}`}>
                          <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                            <span className="text-xs font-black text-[#3D3A35] flex items-center gap-1.5 truncate">
                              {w.playerName} {isMe && <span className="text-[10px] bg-[#0D9488] text-white px-1.5 py-0.5 rounded-full font-bold">YOU</span>}
                            </span>
                            <span className="text-[10px] font-bold text-[#C2410C] bg-[#EA580C]/10 px-2 py-0.5 rounded-full shrink-0">
                              Card {(w.cardIndex ?? 0) + 1} · {w.pattern || 'Bingo'}
                            </span>
                          </div>
                          <div className="grid grid-cols-5 gap-1 mx-auto max-w-[200px]">
                            {['B','I','N','G','O'].map(l => (
                              <div key={l} className="text-center font-black text-[10px] text-[#C2410C]">{l}</div>
                            ))}
                            {w.card.map((row: number[], rIdx: number) => row.map((num: number, cIdx: number) => {
                              const called = num === 0 || (room.calledNumbers || []).includes(num);
                              return (
                                <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center font-display text-[10px] rounded-md border transition-all tabular-nums ${
                                  num === 0 ? 'bg-[#FACC15] text-[#854D0E] border-[#FACC15]' : called ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm' : 'bg-white border-[#E8E2D9] text-[#7A746B]'
                                }`}>
                                  {num === 0 ? '★' : num}
                                </div>
                              );
                            }))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button type="button" onClick={dismissWinner} className="w-full py-4 bg-[#3D3A35] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl shrink-0 mt-auto">
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
