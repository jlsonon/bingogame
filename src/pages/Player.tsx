import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BingoCard } from '../components/BingoCard';
import { generateRandomCard, checkValidWin, getBallLetter } from '../lib/bingo';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Plus, Trash2, ArrowLeft, ArrowRight, Loader } from 'lucide-react';

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
  const { socket, room, me, updateMyCards, claimBingo, latestBall, winner, dismissWinner, claimAlert, rejoinRoom, setNextRoundChoice } = useGameStore();

  const [cards, setCards] = useState<number[][][]>([]);
  const [markedCells, setMarkedCells] = useState<Record<number, number[]>>({}); // cardIndex -> marked cells
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [autoMark, setAutoMark] = useState(localStorage.getItem('bingo_auto_mark') === 'true');

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
       // Auto generate 1 card on join
       addRandomCard();
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

  const addRandomCard = () => {
    if (cards.length >= 4) return; // Limit 4 cards for UX
    const newCard = generateRandomCard();
    const newIndex = cards.length;
    setCards([...cards, newCard]);
    setMarkedCells(prev => ({ ...prev, [newIndex]: [0] }));
    setCurrentCardIdx(newIndex);
  };

  const removeCard = () => {
    if (cards.length <= 1) return;
    const newCards = cards.filter((_, i) => i !== currentCardIdx);
    const newMarked = { ...markedCells };
    delete newMarked[currentCardIdx];
    // Re-index marked cells
    const reindexedMarked: Record<number, number[]> = {};
    newCards.forEach((_, i) => {
       reindexedMarked[i] = i >= currentCardIdx ? markedCells[i+1] : markedCells[i];
    });
    setCards(newCards);
    setMarkedCells(reindexedMarked);
    setCurrentCardIdx(Math.max(0, currentCardIdx - 1));
  };

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

  // Check if current card has bingo
  const currentWinCheck = useMemo(() => {
    if (!room || cards.length === 0 || !room.calledNumbers) return { valid: false, pattern: '' };
    return checkValidWin(cards[currentCardIdx], markedCells[currentCardIdx] || [], room.calledNumbers, room.mode, room.patterns);
  }, [cards, currentCardIdx, markedCells, room?.calledNumbers, room?.mode, room?.patterns]);

  const cardStatus = useMemo(() => {
    if (!room) return [];
    return cards.map((card, index) => {
      const win = checkValidWin(card, markedCells[index] || [], room.calledNumbers, room.mode, room.patterns);
      const hasLatest = latestBall ? card.flat().includes(latestBall) : false;
      const markedCount = (markedCells[index] || []).filter(num => num !== 0).length;
      return { win, hasLatest, markedCount };
    });
  }, [cards, markedCells, room, latestBall]);

  useEffect(() => {
    const winningIndex = cardStatus.findIndex(status => status.win.valid);
    if (winningIndex !== -1 && winningIndex !== currentCardIdx && room?.status === 'playing') {
      setCurrentCardIdx(winningIndex);
    }
  }, [cardStatus, currentCardIdx, room?.status]);

  const handleClaim = () => {
    if (currentWinCheck.valid && room?.status === 'playing') {
       claimBingo(currentCardIdx, markedCells[currentCardIdx] || []);
    }
  };

  const changeCardForNextRound = () => {
    const newCard = generateRandomCard();
    const nextCards = [...cards];
    nextCards[currentCardIdx] = newCard;
    setCards(nextCards);
    setMarkedCells(prev => ({ ...prev, [currentCardIdx]: [0] }));
    setNextRoundChoice('change');
  };

  const changeAllCardsForNextRound = () => {
    const nextCards = cards.map(() => generateRandomCard());
    const nextMarked: Record<number, number[]> = {};
    nextCards.forEach((_, index) => {
      nextMarked[index] = [0];
    });
    setCards(nextCards);
    setMarkedCells(nextMarked);
    setNextRoundChoice('change');
  };

  if (!room || !me) return null;

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-sans touch-manipulation text-[#3D3A35]">
      {/* Header */}
      <header className="bg-white border-b-2 border-[#E8E2D9] px-4 h-14 flex items-center justify-between sticky top-0 z-20 shrink-0">
         <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold tracking-tighter border-2 border-white shadow-sm" style={{ backgroundColor: me.avatarColor || '#ccc' }}>
               {me.nickname.substring(0,2).toUpperCase()}
            </div>
            <div className="leading-tight">
               <div className="font-bold text-[#3D3A35] leading-none">{me.nickname}</div>
               <div className="text-[10px] text-[#A19B91] font-bold uppercase tracking-widest">ROOM {room.id}</div>
            </div>
         </div>
         <div className="flex flex-col items-end">
             <div className="text-[10px] font-bold text-[#7A746B] uppercase tracking-widest max-w-40 truncate">
               {room.mode}{room.mode === 'Bingo' ? ` · ${room.patterns.map(pattern => pattern.name).join(', ')}` : ''}
             </div>
             <div className="flex items-center gap-1 font-bold text-xs uppercase tracking-wider mt-0.5">
               {room.status === 'playing' ? <><span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" /> <span className="text-[#0D9488]">LIVE</span></> : <span className="text-[#A19B91]">{room.status.toUpperCase()}</span>}
             </div>
         </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center p-3 gap-3 max-w-md mx-auto w-full relative">
         
         {/* Live Caller Mini */}
         {(room.status === 'playing' || latestBall) && (
           <div className="w-full bg-white rounded-[24px] p-3 border-2 border-[#E8E2D9] flex items-center justify-between shadow-sm">
              <div className="flex flex-col items-start px-2">
                 <span className="text-[10px] font-bold text-[#A19B91] uppercase tracking-[0.2em]">Latest Call</span>
                 <AnimatePresence mode="popLayout">
                    {latestBall ? (
                       <motion.div 
                         key={latestBall}
                         initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
                         animate={{ scale: 1, opacity: 1, rotate: 0 }}
                         className="mt-1 flex items-center gap-3"
                       >
                          <span className="w-24 h-24 rounded-full bg-[#FACC15] border-4 border-white outline outline-4 outline-[#FACC15] shadow-lg flex flex-col items-center justify-center text-[#854D0E]">
                            <span className="text-sm font-black leading-none">{getBallLetter(latestBall)}</span>
                            <span className="text-5xl font-black leading-none">{latestBall}</span>
                          </span>
                       </motion.div>
                    ) : (
                       <div className="text-xl font-bold text-[#DED9D1] mt-1">--</div>
                    )}
                 </AnimatePresence>
              </div>
              <div className="flex gap-1.5 opacity-80">
                 {room.calledNumbers.slice(-4, -1).reverse().map((n, i) => (
                    <div key={i} className="w-9 h-9 rounded-lg bg-white border border-[#DED9D1] flex items-center justify-center font-bold text-[#7A746B] text-sm shadow-sm">
                       {n}
                    </div>
                 ))}
              </div>
           </div>
         )}

         <div className="w-full bg-white rounded-[18px] px-4 py-2.5 border border-[#E8E2D9] flex items-center justify-between gap-3">
            <div className="min-w-0">
               <div className="text-xs font-black text-[#3D3A35] truncate">{room.roundName}</div>
               <div className="text-[10px] text-[#A19B91] font-bold uppercase tracking-wider">
                  {room.calledNumbers.length}/75 called{room.prizeText ? ` · ${room.prizeText}` : ''}
               </div>
            </div>
            <label className="shrink-0 flex items-center gap-2 text-xs font-bold text-[#7A746B]">
               <input
                 type="checkbox"
                 checked={autoMark}
                 onChange={e => setAutoMark(e.target.checked)}
                 className="h-4 w-4 accent-[#0D9488]"
               />
               Auto-mark
            </label>
         </div>

         {room.status === 'waiting' && cards.length > 0 && (
           <div className="bg-[#FDFBF7] border-2 border-[#E8E2D9] p-4 rounded-[24px] w-full text-center shadow-sm">
              <span className="text-[#3D3A35] font-bold">Waiting for host to begin...</span>
           </div>
         )}

         {room.status === 'next_round' && cards.length > 0 && (
           <div className="bg-[#FACC15]/20 border-2 border-[#FACC15]/60 p-4 rounded-[24px] w-full text-center shadow-sm space-y-3">
              {winner && (
                <div className="rounded-2xl bg-white/70 border border-[#FACC15]/50 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#854D0E]">Winner</div>
                  <div className="text-lg font-black text-[#3D3A35]">{winner.playerName}</div>
                  <div className="text-xs font-bold text-[#7A746B]">{winner.pattern}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-[#854D0E]">Next Round</div>
                <div className="text-4xl font-black text-[#854D0E]"><Countdown endsAt={room.nextRoundEndsAt} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setNextRoundChoice('keep')}
                  className={`py-3 rounded-2xl font-black text-xs ${me.nextRoundChoice !== 'change' ? 'bg-[#0D9488] text-white' : 'bg-white text-[#7A746B] border border-[#DED9D1]'}`}
                >
                  Keep All
                </button>
                <button
                  onClick={changeCardForNextRound}
                  className={`py-3 rounded-2xl font-black text-xs ${me.nextRoundChoice === 'change' ? 'bg-[#EA580C] text-white' : 'bg-white text-[#EA580C] border border-[#DED9D1]'}`}
                >
                  Change This
                </button>
                <button
                  onClick={changeAllCardsForNextRound}
                  className="py-3 rounded-2xl font-black text-xs bg-white text-[#EA580C] border border-[#DED9D1]"
                >
                  Change All
                </button>
              </div>
           </div>
         )}

         {/* Card Selector Header */}
         <div className="w-full flex items-center justify-between px-1">
            <button 
               onClick={() => setCurrentCardIdx(Math.max(0, currentCardIdx - 1))}
               disabled={currentCardIdx === 0}
               className="p-3 bg-white border border-[#DED9D1] rounded-full shadow-sm text-[#7A746B] disabled:opacity-30 hover:bg-[#FDFBF7] active:translate-y-1"
            >
               <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
               {cards.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === currentCardIdx ? 'w-6 bg-[#EA580C]' : 'bg-[#DED9D1]'}`} />
               ))}
            </div>
            <button 
               onClick={() => setCurrentCardIdx(Math.min(cards.length - 1, currentCardIdx + 1))}
               disabled={currentCardIdx === cards.length - 1}
               className="p-3 bg-white border border-[#DED9D1] rounded-full shadow-sm text-[#7A746B] disabled:opacity-30 hover:bg-[#FDFBF7] active:translate-y-1"
            >
               <ArrowRight size={20} />
            </button>
         </div>

         {cards.length > 1 && (
           <div className="w-full overflow-x-auto pb-1">
             <div className="flex gap-2 min-w-max px-1">
               {cards.map((_, i) => {
                 const status = cardStatus[i];
                 const active = i === currentCardIdx;
                 return (
                   <button
                     key={i}
                     onClick={() => setCurrentCardIdx(i)}
                     className={`w-24 shrink-0 rounded-2xl border px-3 py-2 text-left ${active ? 'bg-[#3D3A35] border-[#3D3A35] text-white' : status?.win.valid ? 'bg-[#EA580C] border-[#EA580C] text-white' : status?.hasLatest ? 'bg-[#FACC15]/30 border-[#FACC15] text-[#854D0E]' : 'bg-white border-[#E8E2D9] text-[#7A746B]'}`}
                   >
                     <div className="text-xs font-black">Card {i + 1}</div>
                     <div className="text-[10px] font-bold uppercase tracking-wide">
                       {status?.win.valid ? status.win.pattern : status?.hasLatest ? 'Has Call' : `${status?.markedCount || 0} marks`}
                     </div>
                   </button>
                 );
               })}
             </div>
           </div>
         )}

         {/* Card Container */}
         <div className="w-full relative">
            <AnimatePresence mode="wait">
               {cards.length > 0 && cards[currentCardIdx] && (
                  <motion.div
                     key={currentCardIdx}
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -20 }}
                     transition={{ duration: 0.2 }}
                  >
                     <BingoCard 
                        card={cards[currentCardIdx]}
                        markedCells={markedCells[currentCardIdx] || []}
                        calledNumbers={room.calledNumbers}
                        onToggleCell={toggleCell}
                        readOnly={room.status !== 'playing'}
                     />
                  </motion.div>
               )}
            </AnimatePresence>
         </div>

         {/* Card Management */}
         {(room.status === 'waiting' || room.status === 'next_round') && cards.length > 0 && (
            <div className="flex gap-3 w-full px-2">
               {cards.length < 4 && (
                 <button onClick={addRandomCard} className="flex-1 py-3 bg-[#0D9488] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_0_#0F766E] active:translate-y-[4px] active:shadow-none uppercase tracking-wider">
                    <Plus size={18} /> New Card
                 </button>
               )}
               {cards.length > 1 && (
                 <button onClick={removeCard} className="flex-1 py-3 bg-white border border-[#DED9D1] text-[#EA580C] rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_0_#E8E2D9] active:translate-y-[4px] active:shadow-none uppercase tracking-wider">
                    <Trash2 size={18} /> Delete
                 </button>
               )}
            </div>
         )}
      </main>

      {/* Action Footer */}
      {(room.status === 'playing' || currentWinCheck.valid) && (
         <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 pb-safe z-30">
            <button 
               onClick={handleClaim}
               disabled={!currentWinCheck.valid || room.status !== 'playing'}
               className={`w-full max-w-md mx-auto block py-5 rounded-3xl font-black text-xl tracking-widest uppercase transition-all shadow-xl active:scale-95 ${
                 currentWinCheck.valid && room.status === 'playing' 
                   ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-orange-300 animate-pulse' 
                   : 'bg-slate-100 text-slate-300 shadow-none'
               }`}
            >
               {currentWinCheck.valid ? `BINGO - ${currentWinCheck.pattern}` : 'BINGO'}
            </button>
         </div>
      )}

      {/* Claim Alert overlay */}
      {claimAlert && !winner && (
         <div className="fixed inset-0 bg-[#3D3A35]/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-[#FAF7F2] border-4 border-[#3D3A35] rounded-[24px] p-6 md:p-8 max-w-sm w-full text-center shadow-[12px_12px_0px_rgba(61,58,53,0.1)] flex flex-col items-center">
               <Loader className="w-12 h-12 text-[#EA580C] mx-auto animate-spin mb-4" />
               <h2 className="text-2xl font-black text-[#3D3A35] mb-2">Verifying Claim</h2>
               <p className="text-[#7A746B] font-medium mb-6">
                  {claimAlert.playerId === me.id ? "Host is checking your card..." : `${claimAlert.playerName} called Bingo!`}
               </p>
               
               {/* Show the card to everyone to inspect */}
               <div className="w-full scale-[0.85] origin-top -mt-4">
                  <BingoCard 
                     card={claimAlert.card} 
                     markedCells={[]} 
                     calledNumbers={room.calledNumbers} 
                     readOnly 
                  />
               </div>
               
               <p className="text-sm font-bold text-[#854D0E] mt-2 bg-[#FACC15]/20 px-3 py-1 rounded-lg border border-[#FACC15]/50 uppercase tracking-wide">
                  Pattern: {claimAlert.pattern}
               </p>
            </div>
         </div>
      )}

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && room.status !== 'next_round' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-[#3D3A35]/60 backdrop-blur-sm flex justify-center items-center z-[60] p-4">
             <motion.div initial={{scale:0.8, y:50}} animate={{scale:1, y:0}} className="bg-[#FAF7F2] border-4 border-[#3D3A35] rounded-[24px] w-full max-w-sm p-8 shadow-[12px_12px_0px_rgba(61,58,53,0.1)] text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#EA580C]/10 to-[#FACC15]/5 opacity-50" />
                <div className="relative z-10">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#EA580C] to-[#C2410C] rounded-full flex items-center justify-center mb-6 shadow-[0_4px_12px_rgba(234,88,12,0.3)]">
                    <span className="text-5xl">{winner.playerId === me?.id ? '🎉' : '👏'}</span>
                  </div>
                  <h2 className="text-3xl font-black text-[#3D3A35] mb-2 uppercase tracking-tighter">
                     {winner.playerId === me?.id ? 'YOU WON!' : 'ROUND OVER'}
                  </h2>
                  <p className="text-lg text-[#7A746B] font-medium mb-8">
                     <span className="font-bold text-[#EA580C]">{winner.playerName}</span> claimed Bingo.
                  </p>
                  
                  {/* Show winning card preview */}
                  {winner.playerId !== me?.id && (
                     <div className="mb-8 scale-75 origin-top">
                        <BingoCard 
                           card={winner.card} 
                           markedCells={[]} 
                           calledNumbers={room.calledNumbers} 
                           readOnly 
                        />
                     </div>
                  )}

                  <button onClick={dismissWinner} className="w-full py-4 bg-[#3D3A35] text-white rounded-2xl font-bold text-lg hover:bg-[#201E1A] shadow-[0_6px_0_#201E1A] active:translate-y-[6px] active:shadow-none uppercase tracking-widest transition-all">
                     Continue Playing
                  </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Padding for fixed bottom bar */}
      <div className="h-24" />
    </div>
  );
}
