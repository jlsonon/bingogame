import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { getBallLetter } from '../lib/bingo';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Trophy, Users, Ticket, PlayCircle, Monitor, Eye } from 'lucide-react';

export default function Display() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { socket, room, latestBall, winner, dikitAlert, dismissDikit, connect, rejoinRoom } = useGameStore();
  const [lastBalls, setLastBalls] = useState<number[]>([]);
  const [maleVoice, setMaleVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);

  useEffect(() => {
    if (!socket || !code) return;
    if (!room) {
      rejoinRoom(code, 'player').then(success => {
        if (!success) navigate('/');
      });
    }
  }, [socket, code, room, rejoinRoom, navigate]);

  useEffect(() => {
    connect();
    
    const loadVoices = () => {
       const voices = window.speechSynthesis.getVoices();
       const preferred = voices.find(v => 
          v.name.includes('David') || 
          v.name.includes('Daniel') || 
          v.name.includes('Microsoft David') ||
          (v.name.includes('Male') && v.lang.startsWith('en')) ||
          (v.name.includes('Google UK English Male'))
       );
       setMaleVoice(preferred || voices.find(v => v.lang.startsWith('en')) || voices[0]);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [connect]);

  // Voice Trigger logic
  useEffect(() => {
    if (latestBall && audioEnabled) {
      // Cancel any ongoing speech to avoid overlap/queueing
      window.speechSynthesis.cancel();

      const letter = getBallLetter(latestBall);
      const utterance = new SpeechSynthesisUtterance(`${letter}... ${latestBall}`);
      if (maleVoice) utterance.voice = maleVoice;
      utterance.rate = 0.8;
      utterance.pitch = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }, [latestBall, maleVoice, audioEnabled]);

  const enableAudio = () => {
     setAudioEnabled(true);
     // Required to unlock audio on some browsers
     const silence = new SpeechSynthesisUtterance("");
     window.speechSynthesis.speak(silence);
  };

  useEffect(() => {
    if (room?.calledNumbers) {
      setLastBalls(room.calledNumbers.slice(-6, -1).reverse());
    }
  }, [room?.calledNumbers]);

  useEffect(() => {
    if (winner) {
      confetti({
        particleCount: 200,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FACC15', '#EA580C', '#0D9488']
      });
    }
  }, [winner]);

  if (!room) {
    return (
      <div className="min-h-screen bg-[#3D3A35] flex flex-col items-center justify-center text-white p-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-24 h-24 bg-[#EA580C] rounded-3xl mx-auto flex items-center justify-center shadow-2xl rotate-[-10deg]">
            <span className="text-5xl font-black italic">L</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter uppercase tracking-widest">Lucky Bingo</h1>
          <p className="text-[#A19B91] font-bold text-xl">Connecting to room {code?.toUpperCase()}...</p>
          <div className="w-12 h-12 border-4 border-[#EA580C] border-t-transparent rounded-full animate-spin mx-auto" />
        </motion.div>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/play/${room.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&bgcolor=FAF7F2&color=3D3A35`;

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col overflow-hidden relative">
      {/* Audio Unlock Overlay */}
      {!audioEnabled && (
         <div className="fixed inset-0 z-[100] bg-[#3D3A35]/60 backdrop-blur-md flex items-center justify-center">
            <button 
               onClick={enableAudio}
               className="bg-[#EA580C] text-white px-12 py-8 rounded-[40px] font-black text-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex flex-col items-center gap-4 border-4 border-white"
            >
               <Monitor size={64} />
               ENABLE BINGO ANNOUNCER
               <span className="text-sm font-bold opacity-80">(Required to play voice)</span>
            </button>
         </div>
      )}

      {/* Top Bar */}
      <header className="h-24 bg-white border-b-4 border-[#E8E2D9] px-12 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-[#EA580C] rounded-2xl flex items-center justify-center shadow-lg rotate-[-5deg]">
            <span className="text-3xl font-black text-white italic">L</span>
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter leading-none">Lucky Bingo</h1>
            <p className="text-[#A19B91] font-bold text-sm uppercase tracking-widest mt-1">Live Venue Display</p>
          </div>
        </div>

        <div className="flex items-center gap-12">
          <div className="flex flex-col items-end">
            <span className="text-xs font-black text-[#A19B91] uppercase tracking-widest">Room Code</span>
            <span className="text-5xl font-black tracking-tighter text-[#3D3A35] leading-none tabular-nums">{room.id}</span>
          </div>
          <div className="h-12 w-1 bg-[#E8E2D9] rounded-full" />
          <div className="flex flex-col items-end">
            <span className="text-xs font-black text-[#A19B91] uppercase tracking-widest">Players</span>
            <div className="flex items-center gap-2">
              <Users className="text-[#0D9488]" size={24} />
              <span className="text-4xl font-black text-[#3D3A35] leading-none tabular-nums">
                {Object.values(room.players).filter(p => p.connected).length}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-8 grid grid-cols-[1fr_420px] gap-8 min-h-0">
        
        {/* Left Section: Calling & Board */}
        <div className="flex flex-col gap-8 min-h-0">
          
          {/* Active Area */}
          <div className="grid grid-cols-[400px_1fr] gap-8 shrink-0">
            
            {/* Current Ball */}
            <div className="aspect-square bg-white rounded-[48px] border-4 border-[#E8E2D9] shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2]" />
              <AnimatePresence mode="wait">
                {latestBall ? (
                  <motion.div
                    key={latestBall}
                    initial={{ scale: 0.5, y: 100, opacity: 0, rotate: -20 }}
                    animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
                    exit={{ scale: 1.2, opacity: 0, transition: { duration: 0.2 } }}
                    className="relative z-10 flex flex-col items-center"
                  >
                    <div className="w-64 h-64 rounded-full bg-[#FACC15] border-[12px] border-white outline outline-[12px] outline-[#FACC15] shadow-2xl flex flex-col items-center justify-center text-[#854D0E]">
                      <motion.span 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-4xl font-black leading-none mb-2"
                      >
                        {getBallLetter(latestBall)}
                      </motion.span>
                      <motion.span 
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="text-[140px] font-black leading-none tracking-tighter"
                      >
                        {latestBall}
                      </motion.span>
                    </div>
                  </motion.div>
                ) : (
                  <div className="relative z-10 flex flex-col items-center gap-4 text-[#DED9D1]">
                    <PlayCircle size={100} strokeWidth={1.5} />
                    <span className="text-2xl font-black uppercase tracking-widest">Waiting to start</span>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Info & Last Balls */}
            <div className="flex flex-col gap-6">
              <div className="bg-[#FAF7F2] rounded-[40px] p-8 border-4 border-white shadow-inner flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-4xl font-black text-[#3D3A35] leading-tight mb-2">{room.roundName}</h2>
                    <div className="flex items-center gap-3">
                      <span className="bg-[#EA580C] text-white px-4 py-1.5 rounded-full text-lg font-black uppercase tracking-tighter">
                        {room.mode}
                      </span>
                      {room.prizeText && (
                        <span className="text-2xl font-bold text-[#EA580C] flex items-center gap-2">
                          <Trophy size={28} /> {room.prizeText}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#A19B91] uppercase tracking-widest mb-1">Balls Called</div>
                    <div className="text-5xl font-black text-[#3D3A35] tabular-nums">{room.calledNumbers.length}/75</div>
                  </div>
                </div>

                <div className="mt-auto">
                  <h3 className="text-sm font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Previous Numbers</h3>
                  <div className="flex gap-4">
                    {lastBalls.map((n, i) => (
                      <motion.div 
                        key={`${n}-${i}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="w-20 h-20 rounded-2xl bg-white border-2 border-[#E8E2D9] shadow-sm flex items-center justify-center text-3xl font-black text-[#7A746B]"
                      >
                        {n}
                      </motion.div>
                    ))}
                    {lastBalls.length === 0 && (
                      <div className="h-20 flex items-center text-[#DED9D1] font-bold italic">No history yet</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pattern Visualization */}
              <div className="bg-white rounded-[32px] p-6 border-2 border-[#E8E2D9] shadow-sm">
                <h3 className="text-sm font-black text-[#A19B91] uppercase tracking-widest mb-4">Winning Patterns</h3>
                {!room.hidePattern ? (
                   <PatternVisualizer patterns={room.patterns} />
                ) : (
                   <div className="h-32 flex flex-col items-center justify-center text-[#DED9D1] gap-2">
                      <Eye size={40} className="opacity-20" />
                      <span className="text-xs font-black uppercase tracking-[0.3em]">Mystery Pattern</span>
                   </div>
                )}
              </div>
            </div>
          </div>

          {/* Number Board */}
          <div className="bg-white rounded-[40px] p-8 border-4 border-[#E8E2D9] shadow-lg flex-1 min-h-0">
             <div className="grid grid-cols-[auto_1fr] gap-6 h-full">
                <div className="flex flex-col justify-between py-2">
                   {['B','I','N','G','O'].map(l => (
                     <div key={l} className="text-4xl font-black text-[#EA580C] w-12 text-center">{l}</div>
                   ))}
                </div>
                <div className="grid grid-cols-15 gap-2 flex-1">
                   {Array.from({length: 75}, (_, i) => i + 1).map(num => (
                     <div 
                       key={num} 
                       className={`aspect-square flex items-center justify-center text-2xl font-black rounded-xl border-2 transition-all duration-300 ${
                         room.calledNumbers.includes(num) 
                           ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-lg scale-105' 
                           : 'bg-[#FAF7F2] text-[#DED9D1] border-[#E8E2D9]'
                       }`}
                     >
                       {num}
                     </div>
                   ))}
                </div>
             </div>
          </div>

        </div>

        {/* Right Section: Join & Stats */}
        <div className="flex flex-col gap-8 min-h-0">
          
          {/* Join Info */}
          <div className="bg-white rounded-[48px] p-8 border-4 border-[#E8E2D9] shadow-xl text-center flex flex-col items-center">
            <h3 className="text-xl font-black text-[#3D3A35] uppercase tracking-tight mb-6">Scan to Play</h3>
            <div className="bg-[#FAF7F2] p-6 rounded-[32px] border-2 border-[#E8E2D9] mb-6">
              <img src={qrUrl} alt="Join QR Code" className="w-64 h-64 mix-blend-multiply" />
            </div>
            <p className="text-[#A19B91] font-bold text-sm uppercase tracking-widest mb-2">Or enter code on mobile</p>
            <div className="text-4xl font-black text-[#EA580C] tracking-[0.2em]">{room.id}</div>
          </div>

          {/* Session Stats */}
          <div className="bg-[#3D3A35] rounded-[48px] p-8 text-white shadow-2xl flex-1 flex flex-col">
            <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-8">Session Intel</h3>
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[#FACC15]">
                  <Ticket size={32} />
                  <span className="text-lg font-bold">Cards Active</span>
                </div>
                <span className="text-4xl font-black tabular-nums">{room.stats?.totalCardsSold || 0}</span>
              </div>
              <div className="flex items-center justify-between text-[#0D9488]">
                <div className="flex items-center gap-4">
                  <PlayCircle size={32} />
                  <span className="text-lg font-bold">Rounds Played</span>
                </div>
                <span className="text-4xl font-black tabular-nums">{room.stats?.gamesPlayed || 0}</span>
              </div>
            </div>

            <div className="mt-auto pt-8 border-t border-white/10">
              <h4 className="text-xs font-black text-[#A19B91] uppercase tracking-widest mb-4">Latest Winners</h4>
              <div className="space-y-3">
                {room.stats?.winners?.slice(-3).reverse().map((w, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 p-3 rounded-2xl border border-white/5">
                    <div>
                      <div className="font-black text-white">{w.name}</div>
                      <div className="text-[10px] font-bold text-[#A19B91] uppercase tracking-wider">{w.pattern}</div>
                    </div>
                    <Trophy className="text-[#FACC15]" size={20} />
                  </div>
                ))}
                {(room.stats?.winners?.length || 0) === 0 && (
                  <div className="text-[#7A746B] italic text-sm">No winners yet this session</div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Overlays */}
      <AnimatePresence>
        {winner && room.status !== 'next_round' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#3D3A35]/90 backdrop-blur-xl flex items-center justify-center p-12"
          >
             <motion.div
               initial={{ scale: 0.8, y: 100 }}
               animate={{ scale: 1, y: 0 }}
               className="bg-white rounded-[64px] border-[12px] border-[#FACC15] p-16 shadow-[0_0_100px_rgba(250,204,21,0.3)] text-center max-w-4xl w-full relative overflow-hidden"
             >
                <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-[#FACC15] via-[#EA580C] to-[#FACC15]" />
                <Trophy className="text-[#FACC15] mx-auto mb-8 drop-shadow-lg" size={160} />
                <h2 className="text-8xl font-black text-[#3D3A35] tracking-tighter mb-4 uppercase italic">Bingo!</h2>
                <p className="text-3xl text-[#7A746B] font-bold mb-12">
                   Round winner is <span className="text-[#EA580C] font-black">{winner.playerName}</span>
                </p>
                <div className="flex gap-6 justify-center items-center">
                   <div className="bg-[#FAF7F2] px-8 py-4 rounded-3xl border-2 border-[#E8E2D9]">
                      <div className="text-xs font-black text-[#A19B91] uppercase tracking-widest mb-1">Pattern</div>
                      <div className="text-2xl font-black text-[#3D3A35]">{winner.pattern}</div>
                   </div>
                   {room.prizeText && (
                     <div className="bg-[#FACC15]/20 px-8 py-4 rounded-3xl border-2 border-[#FACC15]">
                        <div className="text-xs font-black text-[#854D0E] uppercase tracking-widest mb-1">Prize</div>
                        <div className="text-2xl font-black text-[#854D0E]">{room.prizeText}</div>
                     </div>
                   )}
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claim Overlay */}
      <AnimatePresence>
        {room.claims.length > 0 && !winner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-[#EA580C]/80 backdrop-blur-md flex items-center justify-center p-12"
          >
             <div className="text-white text-center space-y-8">
                <motion.div 
                   animate={{ scale: [1, 1.1, 1] }}
                   transition={{ repeat: Infinity, duration: 1 }}
                   className="w-40 h-40 bg-white rounded-full mx-auto flex items-center justify-center text-[#EA580C] shadow-2xl"
                >
                   <Trophy size={80} />
                </motion.div>
                <h2 className="text-7xl font-black uppercase tracking-tighter">Bingo Claim!</h2>
                <p className="text-3xl font-bold opacity-90">{room.claims[0].playerName} is claiming a win...</p>
                <div className="text-xl font-black uppercase tracking-[0.4em] bg-white/20 px-8 py-3 rounded-full inline-block">
                   Verification in progress
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidequest Alert */}
      <AnimatePresence>
         {dikitAlert && !winner && (
            <motion.div 
               initial={{ x: -500, opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               exit={{ x: -500, opacity: 0 }}
               className="fixed bottom-12 left-12 z-40 bg-[#0D9488] text-white p-10 rounded-[48px] shadow-[0_20px_50px_rgba(13,148,136,0.3)] border-4 border-white flex flex-col items-center gap-6"
            >
               <div className="text-center">
                  <div className="text-sm font-black uppercase tracking-[0.4em] opacity-80 mb-2">Sidequest Win!</div>
                  <div className="text-5xl font-black italic tracking-tighter">{dikitAlert.playerName}</div>
               </div>

               <div className="bg-white/10 p-6 rounded-[32px] border-2 border-white/20">
                  <div className="grid grid-cols-5 gap-1.5">
                     {dikitAlert.card.map((row: any)=> row.map((num: any, idx: number) => {
                        const called = num === 0 || room.calledNumbers.includes(num);
                        return (
                           <div key={idx} className={`w-12 h-12 flex items-center justify-center font-black text-sm rounded-xl border-2 ${num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md' : 'bg-[#0D9488]/20 border-white/20 text-white/30'}`}>
                              {num === 0 ? 'FR' : num}
                           </div>
                        )
                     }))}
                  </div>
               </div>
               
               <div className="text-xl font-black uppercase tracking-[0.2em]">Hit Dikit!</div>
            </motion.div>
         )}
      </AnimatePresence>
    </div>
  );
}
