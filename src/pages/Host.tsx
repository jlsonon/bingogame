import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { BallCaller } from '../components/BallCaller';
import { Play, Square, Settings, Share2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

export default function Host() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { socket, room, latestBall, startGame, pauseGame, resumeGame, resetGame, callNextBall, updateSettings, verifyClaim, winner, dismissWinner, me, rejoinRoom } = useGameStore();

  const [showSettings, setShowSettings] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  
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

  if (!room) return null;

  const joinUrl = `${window.location.origin}/play/${room.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopyLabel('Copied');
    window.setTimeout(() => setCopyLabel('Copy'), 1400);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Join LuckyBingo', text: `Room ${room.id}`, url: joinUrl });
      return;
    }
    handleCopy();
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-sans text-[#3D3A35]">
      {/* Header */}
      <header className="bg-white border-b-2 border-[#E8E2D9] h-16 px-4 md:px-8 flex items-center justify-between sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#F3EFE9] border border-[#DED9D1] text-[#3D3A35] font-black text-xl px-4 py-2 rounded-xl tracking-wider tabular-nums flex items-center gap-3">
            <span className="text-xs font-bold text-[#7A746B] uppercase tracking-wider hidden sm:inline">Room Code</span>
            {room.id}
          </div>
          <button onClick={handleCopy} className="p-2 text-[#A19B91] hover:text-[#3D3A35] transition-colors" title={copyLabel}>
             <Copy size={20} />
          </button>
          <button onClick={handleShare} className="p-2 text-[#A19B91] hover:text-[#3D3A35] transition-colors" title="Share invite">
             <Share2 size={20} />
          </button>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-[#3D3A35] hidden sm:block">{me?.nickname} (Host)</span>
            <span className="text-[10px] text-[#0D9488] font-bold uppercase flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#0D9488] inline-block animate-pulse" />
              {Object.values(room.players).filter(p => p.connected).length} Online
            </span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 bg-[#F3EFE9] text-[#7A746B] border border-[#DED9D1] rounded-full flex items-center justify-center hover:bg-[#E8E2D9]">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full flex flex-col md:flex-row gap-6">
        
        {/* Left Column (Controls & Caller) */}
        <div className="flex-1 space-y-6">
           <div className="bg-white rounded-[24px] p-5 border-2 border-[#E8E2D9] shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-widest">Current Round</div>
                <h1 className="text-2xl font-black text-[#3D3A35] truncate">{room.roundName}</h1>
                {room.prizeText && <p className="text-sm font-bold text-[#EA580C] truncate">{room.prizeText}</p>}
              </div>
              <div className="bg-[#FDFBF7] border border-[#E8E2D9] rounded-2xl p-3 flex items-center gap-3">
                <img src={qrUrl} alt="Join room QR code" className="w-20 h-20 rounded-lg bg-white" />
                <div className="text-xs font-bold text-[#7A746B] max-w-32 break-words">{joinUrl}</div>
              </div>
           </div>
           <BallCaller latestBall={latestBall} history={room.calledNumbers} />

           <div className="bg-white rounded-[32px] p-6 border-2 border-[#E8E2D9] shadow-sm relative overflow-hidden">
             
             <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center mb-2">
                   <h2 className="text-xl font-bold text-[#3D3A35]">Game Controls</h2>
                   {room.status === 'playing' && (
                     <div className="flex items-center gap-2 text-[#0D9488] font-bold bg-[#0D9488]/10 px-3 py-1 rounded-full text-sm">
                       <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
                       LIVE
                     </div>
                   )}
                </div>

                {room.status === 'waiting' && (
                  <button onClick={startGame} className="w-full py-5 bg-[#EA580C] text-white rounded-2xl font-black text-xl transition-all shadow-[0_6px_0_#9A3412] active:translate-y-[6px] active:shadow-none flex items-center justify-center gap-2 uppercase tracking-tighter">
                    <Play size={24} fill="currentColor" />
                    Start Game
                  </button>
                )}

                {room.status === 'playing' && (
                  <div className="flex gap-3">
                    <button onClick={pauseGame} className="w-16 flex-shrink-0 py-4 bg-[#F3EFE9] border border-[#DED9D1] text-[#7A746B] rounded-2xl font-bold text-lg transition-all active:translate-y-1 flex items-center justify-center">
                      <Square size={20} fill="currentColor" />
                    </button>
                    {room.autoCallSpeed === 0 && (
                      <button onClick={callNextBall} className="flex-1 py-4 bg-[#EA580C] text-white rounded-2xl font-black text-lg transition-all shadow-[0_6px_0_#9A3412] active:translate-y-[6px] active:shadow-none flex items-center justify-center gap-2 uppercase tracking-tighter">
                        Next Ball
                      </button>
                    )}
                  </div>
                )}

                {room.status === 'paused' && (
                  <div className="flex gap-3">
                     <button onClick={resetGame} className="w-20 py-4 bg-[#F3EFE9] border border-[#DED9D1] text-[#7A746B] rounded-2xl font-bold text-sm transition-all active:translate-y-1 uppercase tracking-wider">
                        Reset
                     </button>
                     <button onClick={resumeGame} className="flex-1 py-4 bg-[#0D9488] text-white rounded-2xl font-black text-lg transition-all shadow-[0_6px_0_#0F766E] active:translate-y-[6px] active:shadow-none flex items-center justify-center gap-2 uppercase tracking-tighter">
                        <Play size={20} fill="currentColor" />
                        Resume
                     </button>
                  </div>
                )}

                {room.status === 'finished' && (
                   <button onClick={resetGame} className="w-full py-5 bg-[#3D3A35] text-white rounded-2xl font-black text-xl transition-all shadow-[0_6px_0_#1C1917] active:translate-y-[6px] active:shadow-none uppercase tracking-tighter">
                      New Round
                   </button>
                )}

             </div>
           </div>
        </div>

        {/* Right Column (Board & Players) */}
        <div className="w-full md:w-80 space-y-6">
           
           <div className="bg-white rounded-[32px] p-5 border-2 border-[#E8E2D9] shadow-sm">
             <h3 className="text-[10px] font-bold text-[#A19B91] uppercase tracking-widest mb-4">Number Board</h3>
             <div className="grid grid-cols-5 gap-1">
               {['B','I','N','G','O'].map(l => <div key={l} className="text-center font-black text-[#A19B91] text-xs">{l}</div>)}
               {Array.from({length: 75}, (_, i) => i + 1).map(num => (
                 <div 
                   key={num} 
                   className={`aspect-square flex items-center justify-center text-xs font-bold rounded border ${room.calledNumbers.includes(num) ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-sm' : 'bg-white text-[#A19B91] border-[#DED9D1]'}`}
                 >
                   {num}
                 </div>
               ))}
             </div>
           </div>

           <div className="bg-white rounded-[32px] p-5 border-2 border-[#E8E2D9] shadow-sm">
              <h3 className="text-[10px] font-bold text-[#A19B91] uppercase tracking-widest mb-3">Players</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                 {Object.values(room.players).map(p => (
                   <div key={p.id} className="flex items-center gap-3 bg-[#FDFBF7] border border-[#E8E2D9] p-2 rounded-xl">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold tracking-tighter" style={{ backgroundColor: p.avatarColor || '#ccc' }}>
                        {p.nickname.substring(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="font-bold text-sm text-[#3D3A35] truncate">{p.nickname} {p.isHost && '(Host)'}</div>
                         <div className="text-[10px] text-[#A19B91] font-bold uppercase tracking-wider">
                            {p.activeCards.length} cards · {p.connected ? 'online' : 'offline'}
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

        </div>
      </main>

      {/* Settings Modal Setup */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
           <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative">
              <h2 className="text-2xl font-black mb-6">Settings</h2>
              
              <div className="space-y-4">
                 <div>
                    <label className="text-sm font-bold text-slate-700 block mb-1.5">Round Name</label>
                    <input
                      value={room.roundName}
                      onChange={e => updateSettings({ roundName: e.target.value })}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                      maxLength={40}
                    />
                 </div>

                 <div>
                    <label className="text-sm font-bold text-slate-700 block mb-1.5">Prize</label>
                    <input
                      value={room.prizeText}
                      onChange={e => updateSettings({ prizeText: e.target.value })}
                      placeholder="Optional prize"
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                      maxLength={80}
                    />
                 </div>

                 <div>
                    <label className="text-sm font-bold text-slate-700 block mb-1.5">Game Mode</label>
                    <select 
                      value={room.mode}
                      onChange={e => updateSettings({ mode: e.target.value })}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                    >
                       <option value="Standard">Standard (Lines + corners)</option>
                       <option value="Blackout">Blackout</option>
                       <option value="Dikit">Dikit Only (2 Adjacent)</option>
                    </select>
                 </div>

                 <div>
                    <label className="text-sm font-bold text-slate-700 block mb-1.5">Auto-Call Speed</label>
                    <select 
                      value={room.autoCallSpeed}
                      onChange={e => updateSettings({ autoCallSpeed: parseInt(e.target.value) })}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                    >
                       <option value={0}>Manual (Button Click)</option>
                       <option value={3}>Fast (3s)</option>
                       <option value={5}>Normal (5s)</option>
                       <option value={8}>Slow (8s)</option>
                    </select>
                 </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="mt-8 w-full bg-slate-900 text-white py-3 rounded-xl font-bold"
              >
                 Done
              </button>
           </div>
        </div>
      )}

      {/* Claims Verification Modal */}
      {room.claims.length > 0 && !winner && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex justify-center items-center z-50 p-4">
           <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              <div className="bg-orange-500 text-white p-4 text-center">
                 <h2 className="text-2xl font-black uppercase tracking-widest text-[#FFF8E7] drop-shadow-md">Bingo Claim!</h2>
                 <p className="font-medium opacity-90">{room.claims[0].playerName} called Bingo</p>
              </div>

              <div className="p-4 overflow-y-auto">
                 <div className="bg-slate-100 p-4 rounded-xl flex justify-center scale-90 origin-top">
                    <div className="grid grid-cols-5 gap-1">
                      {['B','I','N','G','O'].map(l => <div key={l} className="text-center font-black text-slate-400">{l}</div>)}
                      {room.claims[0].card.map((row: any)=> row.map((num: any, idx: number) => {
                         const called = num === 0 || room.calledNumbers.includes(num);
                         return (
                           <div key={idx} className={`w-10 h-10 flex items-center justify-center font-bold text-sm rounded-md ${num === 0 ? 'bg-indigo-600 text-white' : called ? 'bg-orange-500 text-white ring-2 ring-inset ring-orange-300 scale-95' : 'bg-white border text-slate-400'}`}>
                              {num === 0 ? 'FR' : num}
                           </div>
                         )
                      }))}
                    </div>
                 </div>
                 
                 <div className="mt-4 bg-orange-50 p-3 rounded-xl border border-orange-100 flex justify-between items-center">
                    <span className="font-bold text-orange-800">Detected Pattern:</span>
                    <span className="bg-white px-3 py-1 rounded-full text-orange-600 font-bold text-sm shadow-sm border border-orange-200">{room.claims[0].pattern}</span>
                 </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                 <button onClick={() => verifyClaim(room.claims[0].id, false)} className="flex-1 py-4 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300">
                    Reject
                 </button>
                 <button onClick={() => verifyClaim(room.claims[0].id, true)} className="flex-1 py-4 bg-green-500 text-white rounded-xl font-bold text-lg hover:bg-green-600 shadow-md">
                    Verify & Win
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex justify-center items-center z-[60] p-4">
             <motion.div initial={{scale:0.8, y:50}} animate={{scale:1, y:0}} className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-100 to-orange-50 opacity-50" />
                <div className="relative z-10">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-orange-200">
                    <span className="text-5xl">🏆</span>
                  </div>
                  <h2 className="text-4xl font-black text-slate-800 mb-2">BINGO!</h2>
                  <p className="text-xl text-slate-600 font-medium mb-8">
                     <span className="font-bold text-indigo-600">{winner.playerName}</span> won the round!
                  </p>
                  <button onClick={dismissWinner} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-slate-800 active:scale-95 transition-all">
                     Continue
                  </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
