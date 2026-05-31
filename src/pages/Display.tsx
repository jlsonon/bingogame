import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getBallLetter } from '../lib/bingo';
import { Trophy, Users, Ticket, PlayCircle, Monitor, Eye } from 'lucide-react';
import { SOUNDS, playSound, playVoiceBall } from '../lib/sounds';

function Countdown({ endsAt }: { endsAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((endsAt || now) - now) / 1000));
  return <span className="tabular-nums">{seconds}s</span>;
}

export default function Display() {
  const { code } = useParams();
  const navigate = useNavigate();
  
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const latestBall = useGameStore(s => s.latestBall);
  const winner = useGameStore(s => s.winner);
  const dikitAlert = useGameStore(s => s.dikitAlert);
  const connect = useGameStore(s => s.connect);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);
  const dismissDikit = useGameStore(s => s.dismissDikit);

  const [lastBalls, setLastBalls] = useState<number[]>([]);
  const [maleVoice, setMaleVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const [showHypeIntro, setShowHypeIntro] = useState(false);
  const [hypeCountdown, setHypeCountdown] = useState(3);
  const [showPatternFlash, setShowPatternFlash] = useState(false);

  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
     if (room?.status === 'playing' && (prevStatus.current === 'waiting' || prevStatus.current === 'next_round')) {
        startHypeFlow();
     }
     prevStatus.current = room?.status || null;
  }, [room?.status]);

  const startHypeFlow = () => {
     setShowHypeIntro(true);
     setHypeCountdown(3);
     const timer = setInterval(() => {
        setHypeCountdown(prev => {
           if (prev <= 1) {
              clearInterval(timer);
              setTimeout(() => {
                 setShowHypeIntro(false);
                 setShowPatternFlash(true);
                 setTimeout(() => setShowPatternFlash(false), 3000);
              }, 800);
              return 0;
           }
           return prev - 1;
        });
     }, 1000);
  };

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
       const preferred = voices.find(v => v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Male'));
       setMaleVoice(preferred || voices[0]);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [connect]);

  // Voice Trigger logic
  useEffect(() => {
    if (latestBall && audioEnabled) {
      playSound(SOUNDS.BALL_DRAW, 0.4);
      
      const voiceTriggered = playVoiceBall(latestBall);
      
      if (!voiceTriggered) {
        window.speechSynthesis.cancel();
        const letter = getBallLetter(latestBall);
        const utterance = new SpeechSynthesisUtterance(`${letter}... ${latestBall}`);
        if (maleVoice) utterance.voice = maleVoice;
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [latestBall, maleVoice, audioEnabled]);

  const enableAudio = () => {
     setAudioEnabled(true);
     window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
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
      confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 }, colors: ['#FACC15', '#EA580C', '#0D9488'] });
    }
  }, [winner, room?.mode]);

  if (!room) return null;

  const joinUrl = `${window.location.origin}/?code=${room.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&bgcolor=FAF7F2&color=3D3A35`;

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col overflow-hidden relative">
      <AnimatePresence>
         {showHypeIntro && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-[#EA580C] flex flex-col items-center justify-center text-white">
               <motion.div key={hypeCountdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[30vw] leading-none drop-shadow-[0_20px_50px_rgba(0,0,0,0.3)]">{hypeCountdown > 0 ? hypeCountdown : "GO!"}</motion.div>
               <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="font-black text-4xl uppercase tracking-[0.5em] mt-8">Get Ready...</motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence>
         {showPatternFlash && (
            <motion.div initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="fixed inset-0 z-[105] bg-[#3D3A35]/95 backdrop-blur-xl flex flex-col items-center justify-center text-white p-12 text-center">
               <div className="mb-12"><div className="text-xl font-black uppercase tracking-[0.4em] text-[#EA580C] mb-4">Target Pattern</div><h2 className="font-display text-9xl uppercase tracking-tighter italic">{room.mode}</h2></div>
               <div className="bg-white p-16 rounded-[64px] shadow-[0_0_100px_rgba(250,204,21,0.2)]"><PatternVisualizer patterns={room.patterns} className="scale-[3] origin-center" /></div>
               <div className="mt-16 text-2xl font-bold opacity-60 uppercase tracking-widest animate-pulse">Round Starting Now</div>
            </motion.div>
         )}
      </AnimatePresence>

      {!audioEnabled && (
         <div className="fixed inset-0 z-[100] bg-[#3D3A35]/60 backdrop-blur-md flex items-center justify-center">
            <button onClick={enableAudio} className="bg-[#EA580C] text-white px-12 py-8 rounded-[40px] font-display text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex flex-col items-center gap-4 border-4 border-white tracking-widest uppercase italic">
               <Monitor size={64} />ENABLE ANNOUNCER
            </button>
         </div>
      )}

      <header className="h-24 bg-white border-b-4 border-[#E8E2D9] px-12 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-[#EA580C] rounded-2xl flex items-center justify-center shadow-lg rotate-[-5deg]"><span className="text-3xl font-display text-white italic">L</span></div>
          <div><h1 className="text-4xl font-display uppercase tracking-tighter leading-none">Lucky Bingo</h1><p className="text-[#A19B91] font-black text-[10px] uppercase tracking-[0.4em] mt-1">Live Venue Display</p></div>
        </div>
        <div className="flex items-center gap-12">
          <div className="flex flex-col items-end"><span className="text-xs font-black text-[#A19B91] uppercase tracking-widest">Room Code</span><span className="text-6xl font-display tracking-tighter text-[#3D3A35] leading-none tabular-nums">{room.id}</span></div>
          <div className="h-12 w-1 bg-[#E8E2D9] rounded-full" />
          <div className="flex flex-col items-end"><span className="text-xs font-black text-[#A19B91] uppercase tracking-widest">Players</span><div className="flex items-center gap-2"><Users className="text-[#0D9488]" size={24} /><span className="text-5xl font-display text-[#3D3A35] leading-none tabular-nums">{Object.values(room.players).filter(p => p.connected).length}</span></div></div>
        </div>
      </header>

      <main className="flex-1 p-8 grid grid-cols-[1fr_420px] gap-8 min-h-0">
        <div className="flex flex-col gap-8 min-h-0">
          <div className="grid grid-cols-[400px_1fr] gap-8 shrink-0">
            <div className="aspect-square bg-white rounded-[48px] border-4 border-[#E8E2D9] shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white to-[#FAF7F2]" />
              <AnimatePresence mode="wait">
                {latestBall ? (
                  <motion.div key={latestBall} initial={{ scale: 0.5, y: 100, opacity: 0, rotate: -20 }} animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }} exit={{ scale: 1.2, opacity: 0, transition: { duration: 0.2 } }} className="relative z-10 flex flex-col items-center">
                    <div className="w-64 h-64 rounded-full bg-[#FACC15] border-[12px] border-white outline outline-[12px] outline-[#FACC15] shadow-2xl flex flex-col items-center justify-center text-[#854D0E] relative">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/40 pointer-events-none" />
                      <div className="absolute top-8 left-12 w-16 h-8 bg-white/30 rounded-[100%] blur-sm -rotate-45 pointer-events-none" />
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-5xl font-display leading-none mb-2 z-10">{getBallLetter(latestBall)}</motion.span>
                      <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-[160px] font-display leading-none tracking-tighter z-10">{latestBall}</motion.span>
                    </div>
                  </motion.div>
                ) : (<div className="relative z-10 flex flex-col items-center gap-4 text-[#DED9D1]"><PlayCircle size={100} strokeWidth={1.5} /><span className="text-2xl font-black uppercase tracking-widest">Waiting to start</span></div>)}
              </AnimatePresence>
            </div>
            <div className="bg-white rounded-[48px] border-4 border-[#E8E2D9] p-8 shadow-xl flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FAF7F2] rounded-bl-[100px] -mr-8 -mt-8 border-b-4 border-l-4 border-[#E8E2D9]" />
                <div className="flex-1 flex flex-col">
                   <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-8">Game Context</h3>
                   <div className="space-y-6">
                      <div><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-[0.2em] block mb-1">Current Round</label><div className="text-4xl font-display text-[#3D3A35] uppercase italic">{room.roundName}</div></div>
                      {room.prizeText && (<div><label className="text-[10px] font-black text-[#7A746B] uppercase tracking-[0.2em] block mb-1">Playing For</label><div className="text-3xl font-display text-[#EA580C] uppercase tracking-tighter">{room.prizeText}</div></div>)}
                   </div>
                   <div className="mt-auto">
                      <h3 className="text-sm font-black text-[#A19B91] uppercase tracking-[0.2em] mb-4">Previous Numbers</h3>
                      <div className="flex gap-4 h-20">
                         <AnimatePresence initial={false} mode="popLayout">
                            {lastBalls.map((n, i) => (<motion.div key={`${n}-${room.calledNumbers.length - i}`} initial={{ opacity: 0, x: 40, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -40, scale: 0.5 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-20 h-20 rounded-2xl bg-white border-2 border-[#E8E2D9] shadow-sm flex items-center justify-center text-4xl font-display text-[#7A746B] relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent pointer-events-none" />{n}</motion.div>))}
                         </AnimatePresence>
                         {lastBalls.length === 0 && (<div className="h-20 flex items-center text-[#DED9D1] font-bold italic">No history yet</div>)}
                      </div>
                   </div>
                </div>
              </div>
          </div>
          <div className="bg-white rounded-[40px] p-8 border-4 border-[#E8E2D9] shadow-lg flex-1 min-h-0 overflow-y-auto">
             <div className="grid grid-cols-[auto_1fr] gap-10 h-full">
                <div className="flex flex-col justify-between py-4 shrink-0">
                   {['B','I','N','G','O'].map(l => (<div key={l} className="text-6xl font-display text-[#EA580C] w-16 text-center drop-shadow-md leading-none">{l}</div>))}
                </div>
                <div className="grid grid-cols-15 gap-2.5 flex-1">
                   {Array.from({length: 75}, (_, i) => i + 1).map(num => (
                     <div key={num} className={`aspect-square flex items-center justify-center text-3xl font-display rounded-xl border-2 transition-all duration-300 relative overflow-hidden ${room.calledNumbers.includes(num) ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-lg scale-105' : 'bg-[#FAF7F2] text-[#DED9D1] border-[#E8E2D9]'}`}>{room.calledNumbers.includes(num) && (<><div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" /><div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" /></>)}{num}</div>))}
                </div>
             </div>
          </div>
        </div>
        <div className="flex flex-col gap-8 min-h-0">
          <div className="bg-white rounded-[48px] p-8 border-4 border-[#E8E2D9] shadow-xl text-center flex flex-col items-center">
            <h3 className="text-xl font-black text-[#3D3A35] uppercase tracking-tight mb-6">Scan to Play</h3>
            <motion.div animate={{ y: [0, -10, 0, 10, 0], x: [0, 5, 0, -5, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="bg-[#FAF7F2] p-6 rounded-[32px] border-2 border-[#E8E2D9] mb-6 shadow-inner"><img src={qrUrl} alt="Join QR Code" className="w-64 h-64 mix-blend-multiply" /></motion.div>
            <p className="text-[#A19B91] font-bold text-sm uppercase tracking-widest mb-2">Or enter code on mobile</p><div className="text-5xl font-display text-[#EA580C] tracking-[0.2em]">{room.id}</div>
          </div>
          <div className="bg-white rounded-[48px] p-8 border-4 border-[#E8E2D9] shadow-xl flex-1 flex flex-col relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FACC15] to-transparent opacity-50" />
             <h3 className="text-xs font-black text-[#A19B91] uppercase tracking-[0.3em] mb-6">Target Pattern</h3>
             <div className="flex-1 flex flex-col items-center justify-center gap-8">
                {!room.hidePattern ? (<div className="bg-[#FAF7F2] p-8 rounded-[40px] border-4 border-white shadow-inner"><PatternVisualizer patterns={room.patterns} className="scale-[2] origin-center" /></div>) : (<div className="text-[#DED9D1] flex flex-col items-center gap-4"><Eye size={64} className="opacity-20" /><span className="text-xs font-black uppercase tracking-[0.5em] text-center">Pattern Mystery</span></div>)}
                <div className="text-center italic"><div className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest mb-1">Game Mode</div><div className="text-3xl font-display text-[#EA580C] uppercase tracking-tight">{room.mode}</div></div>
             </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
         {dikitAlert && (
            <motion.div initial={{ y: -200, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -200, opacity: 0 }} className="fixed top-24 left-1/2 -translate-x-1/2 z-[120] bg-[#0D9488] text-white p-8 rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-8 border-white flex flex-col items-center gap-6 w-full max-w-2xl">
               <div className="text-center">
                  <div className="text-xs font-black uppercase tracking-[0.4em] opacity-80 mb-2">{dikitAlert.length > 1 ? 'MULTIPLE SIDEQUEST WINS!' : 'Sidequest Hit!'}</div>
                  <div className="text-6xl font-display italic tracking-tighter">{dikitAlert.map((w: any) => w.playerName).join(' & ')}</div>
                  <div className="text-sm font-black uppercase tracking-[0.3em] opacity-60 mt-2 italic">
                     Game resuming in <Countdown endsAt={room.dikitEndsAt} />
                  </div>
               </div>
               <div className="flex gap-8 overflow-x-auto w-full pb-4 px-4 scrollbar-hide justify-center">
                  {dikitAlert.map((alert: any, aIdx: number) => (
                     <div key={aIdx} className="bg-white/10 p-6 rounded-[32px] border-2 border-white/20 shrink-0"><div className="text-center text-sm font-black mb-4 uppercase tracking-widest">{alert.playerName}</div><div className="grid grid-cols-5 gap-1.5">{alert.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-10 h-10 flex items-center justify-center font-display text-xs rounded-xl border-2 ${num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md scale-105' : 'bg-[#0D9488]/20 border-white/20 text-white/40'}`}>{num === 0 ? 'FR' : num}</div>) }))}</div></div>
                  ))}
               </div>
            </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence>
        {winner && room.status !== 'next_round' && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-[#3D3A35]/95 backdrop-blur-3xl flex justify-center items-center z-[130] p-12">
             <motion.div initial={{scale:0.8, y:100}} animate={{scale:1, y:0}} className="bg-white rounded-[80px] border-[16px] border-[#FACC15] w-full max-w-6xl p-16 shadow-2xl text-center relative overflow-hidden flex flex-col max-h-[95vh]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FACC15]/20 via-transparent to-[#EA580C]/10 opacity-50" />
                <div className="relative z-10 flex flex-col min-h-0">
                  <div className="w-40 h-48 mx-auto relative mb-8 shrink-0"><motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-[#FACC15]"><Trophy size={160} strokeWidth={2.5} /></motion.div></div>
                  <h2 className="text-[120px] font-display text-[#3D3A35] leading-none mb-4 uppercase italic tracking-tighter drop-shadow-sm">{winner.length > 1 ? 'WE HAVE WINNERS!' : 'BINGO!'}</h2>
                  <p className="text-4xl text-[#7A746B] font-bold mb-12 uppercase tracking-widest">{winner.map((w: any) => w.playerName).join(' & ')}</p>
                  <div className="flex-1 overflow-y-auto min-h-0 mb-8 px-4 scrollbar-hide"><div className="flex flex-wrap gap-12 justify-center py-4">{winner.map((w: any, wIdx: number) => (<div key={wIdx} className="bg-[#FAF7F2] p-8 rounded-[48px] border-4 border-[#E8E2D9] shadow-2xl scale-110"><div className="text-2xl font-display text-[#3D3A35] mb-6 uppercase italic tracking-wider">{w.playerName}</div><div className="grid grid-cols-5 gap-2">{w.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-14 h-14 flex items-center justify-center font-display text-xl rounded-2xl border-2 transition-all ${num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : called ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg scale-105' : 'bg-white border-[#E8E2D9] text-[#DED9D1]'}`}>{num === 0 ? 'FR' : num}</div>) }))}</div></div>))}</div></div>
                  <div className="shrink-0 text-xs font-black uppercase tracking-[0.5em] text-[#A19B91] mt-4 animate-bounce">Awaiting Host to start next round</div>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
