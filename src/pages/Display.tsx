import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { PatternVisualizer } from '../components/PatternVisualizer';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getBallLetter } from '../lib/bingo';
import { Trophy, Users, Ticket, PlayCircle, Monitor, Eye, Settings2 } from 'lucide-react';
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
  
  // Atomic Selectors
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const latestBall = useGameStore(s => s.latestBall);
  const winner = useGameStore(s => s.winner);
  const claimAlert = useGameStore(s => s.claimAlert);
  const connect = useGameStore(s => s.connect);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);
  const dismissDikit = useGameStore(s => s.dismissDikit);

  const [lastBalls, setLastBalls] = useState<number[]>([]);
  const [maleVoice, setMaleVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  // Reveal Spectacle State
  const [revealStatus, setRevealStatus] = useState<'idle' | 'verifying' | 'winner'>('idle');

  useEffect(() => {
    if (claimAlert) {
      setRevealStatus('verifying');
      playSound(SOUNDS.DRUMROLL, 0.7);
    } else if (winner) {
      setRevealStatus('winner');
    } else {
      setRevealStatus('idle');
    }
  }, [claimAlert, winner]);
  
  // Hall Ambience & Ducking
  const ambienceRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioEnabled && room?.ambienceEnabled) {
      if (!ambienceRef.current) {
        ambienceRef.current = new Audio('https://www.soundjay.com/misc/sounds/ambient-crowd-1.mp3');
        ambienceRef.current.loop = true;
        ambienceRef.current.volume = 0.15; // Soft background
      }
      ambienceRef.current.play().catch(e => console.warn('Ambience blocked:', e));
    } else {
      ambienceRef.current?.pause();
    }
    return () => ambienceRef.current?.pause();
  }, [audioEnabled, room?.ambienceEnabled]);

  // UX Spectacle State
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

  // Voice Trigger logic with Ducking
  useEffect(() => {
    if (latestBall && audioEnabled) {
      playSound(SOUNDS.BALL_DRAW, 0.4);
      
      // DUCK AMBIENCE
      if (ambienceRef.current) ambienceRef.current.volume = 0.05;
      
      const voiceTriggered = playVoiceBall(latestBall, room?.voiceMode || 'robotic');
      
      if (!voiceTriggered) {
        window.speechSynthesis.cancel();
        const letter = getBallLetter(latestBall);
        const utterance = new SpeechSynthesisUtterance(`${letter}... ${latestBall}`);
        if (maleVoice) utterance.voice = maleVoice;
        utterance.rate = 0.85;
        utterance.onend = () => {
           // RESTORE AMBIENCE
           if (ambienceRef.current) ambienceRef.current.volume = 0.15;
        };
        window.speechSynthesis.speak(utterance);
      } else {
         // If using custom/file voice, restore after 2 seconds (typical call duration)
         setTimeout(() => {
            if (ambienceRef.current) ambienceRef.current.volume = 0.15;
         }, 2500);
      }
    }
  }, [latestBall, maleVoice, audioEnabled, room?.voiceMode]);

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
      
      // Swell ambience for victory
      if (ambienceRef.current) {
         ambienceRef.current.volume = 0.4;
      }
      
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        // since particles fall down, start a bit higher than random
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    }
  }, [winner, room?.mode]);

  if (!room) return null;

  const joinUrl = `${window.location.origin}/?code=${room.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&bgcolor=FAF7F2&color=3D3A35`;

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#3D3A35] font-sans flex flex-col overflow-hidden relative">
      <AnimatePresence>
         {emotes.map((emote) => {
            // Generate deterministic pseudo-random values based on emote ID so they don't jump around on re-renders
            const randomX = (parseInt(emote.id.replace(/[^0-9]/g, '') || '0') % 80) + 10; // 10% to 90%
            const duration = (parseInt(emote.id.replace(/[^0-9]/g, '') || '0') % 3) + 3; // 3s to 5s

            return (
               <motion.div
                 key={emote.id}
                 initial={{ y: '100vh', x: `${randomX}vw`, opacity: 0, scale: 0.5 }}
                 animate={{ y: '-20vh', opacity: [0, 1, 1, 0], scale: 1.5 }}
                 transition={{ duration, ease: "easeOut" }}
                 className="fixed z-[100] text-6xl pointer-events-none drop-shadow-xl"
               >
                 {emote.emoji}
               </motion.div>
            );
         })}
      </AnimatePresence>

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
            <motion.div initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="fixed inset-0 z-[105] bg-[#3D3A35]/95 backdrop-blur-xl flex flex-col items-center justify-center text-white p-12 text-center" >
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

      <main className="flex-1 p-8 grid grid-cols-[1fr_420px] gap-8 min-h-0 relative">
        <AnimatePresence>
           {nearWinAlert && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-4 z-0 pointer-events-none rounded-[60px] shadow-[inset_0_0_100px_rgba(234,88,12,0.4)] border-4 border-[#EA580C]/50"
              >
                 <motion.div 
                   animate={{ opacity: [0.3, 0.6, 0.3] }} 
                   transition={{ repeat: Infinity, duration: 1.5 }}
                   className="absolute inset-0 bg-[#EA580C]/5 rounded-[56px]"
                 />
                 <div className="absolute top-4 right-8 bg-[#EA580C] text-white px-6 py-2 rounded-full font-black uppercase tracking-widest animate-bounce shadow-lg">
                    High Alert: 1 Away!
                 </div>
              </motion.div>
           )}
        </AnimatePresence>
        <div className="flex flex-col gap-8 min-h-0 relative z-10">
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

      <footer className="h-16 bg-white border-t-4 border-[#E8E2D9] px-12 flex items-center justify-center relative overflow-hidden shrink-0">
         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#EA580C]/5 to-transparent opacity-50" />
         <motion.div animate={{ x: [400, -400] }} transition={{ duration: 15, repeat: Infinity, ease: "linear" }} className="flex items-center gap-4 text-[#A19B91] font-black text-xs uppercase tracking-[0.4em] whitespace-nowrap"><span>Powered by Lucky Bingo</span><div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" /><span>Community Event Night</span><div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" /><span>Good Luck to All Players!</span><div className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" /><span>Check Your Cards!</span></motion.div>
      </footer>

      <AnimatePresence>
         {dikitAlert && (
            <motion.div initial={{ y: -200, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -200, opacity: 0 }} className="fixed top-24 left-1/2 -translate-x-1/2 z-[120] bg-[#0D9488] text-white p-8 rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-8 border-white flex flex-col items-center gap-6 w-full max-w-2xl">
               <div className="text-center"><div className="text-xs font-black uppercase tracking-[0.4em] opacity-80 mb-2">{dikitAlert.length > 1 ? 'MULTIPLE SIDEQUEST WINS!' : 'Sidequest Hit!'}</div><div className="text-6xl font-display italic tracking-tighter">{dikitAlert.map((w: any) => w.playerName).join(' & ')}</div><div className="text-sm font-black uppercase tracking-[0.3em] opacity-60 mt-2 italic">Game resuming in <Countdown endsAt={room.dikitEndsAt} /></div></div>
               <div className="flex gap-8 overflow-x-auto w-full pb-4 px-4 scrollbar-hide justify-center">
                  {dikitAlert.map((alert: any, aIdx: number) => (
                     <div key={aIdx} className="bg-white/10 p-6 rounded-[32px] border-2 border-white/20 shrink-0"><div className="text-center text-sm font-black mb-4 uppercase tracking-widest">{alert.playerName}</div><div className="grid grid-cols-5 gap-1.5">{alert.card.map((row: any)=> row.map((num: any, idx: number) => { const called = num === 0 || room.calledNumbers.includes(num); return (<div key={idx} className={`w-10 h-10 flex items-center justify-center font-display text-xs rounded-xl border-2 ${num === 0 ? 'bg-white text-[#0D9488]' : called ? 'bg-white text-[#0D9488] shadow-md scale-105' : 'bg-[#0D9488]/20 border-white/20 text-white/40'}`}>{num === 0 ? 'FR' : num}</div>) }))}</div></div>
                  ))}
               </div>
            </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence>
        {revealStatus !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-[#3D3A35]/95 backdrop-blur-3xl flex justify-center items-center z-[130] p-12 overflow-hidden"
          >
            {/* Background Spectacle */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <motion.div 
                animate={{ 
                  rotate: [0, 360],
                  scale: [1, 1.2, 1],
                }} 
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(250,204,21,0.1)_0%,transparent_70%)]" 
              />
              {revealStatus === 'verifying' && (
                <motion.div 
                  animate={{ y: ['-100%', '200%'] }} 
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 bg-gradient-to-b from-transparent via-[#EA580C]/20 to-transparent h-1/2 w-full blur-3xl"
                />
              )}
            </div>

            <AnimatePresence mode="wait">
              {revealStatus === 'verifying' && claimAlert && (
                <motion.div 
                  key="verifying"
                  initial={{ scale: 0.8, opacity: 0, y: 50 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 1.2, opacity: 0 }}
                  className="relative z-10 flex flex-col items-center text-center w-full"
                >
                  <div className="relative mb-12">
                    <motion.div 
                      animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} 
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="w-48 h-48 bg-[#EA580C] rounded-full flex items-center justify-center shadow-[0_0_80px_rgba(234,88,12,0.6)] border-8 border-white"
                    >
                      <Settings2 size={80} className="text-white animate-spin" style={{ animationDuration: '3s' }} />
                    </motion.div>
                    <div className="absolute -inset-8 border-4 border-dashed border-[#EA580C]/40 rounded-full animate-spin-slow" />
                  </div>
                  
                  <h2 className="text-8xl font-black text-white uppercase italic tracking-tighter mb-4 drop-shadow-2xl">
                    Bingo Claimed!
                  </h2>
                  
                  <div className="flex items-center gap-4 bg-white/10 px-8 py-4 rounded-full backdrop-blur-md border border-white/20 mb-12">
                    <div className="w-12 h-12 rounded-full bg-[#EA580C] flex items-center justify-center text-white font-black">
                      {claimAlert.playerName.substring(0,2).toUpperCase()}
                    </div>
                    <span className="text-4xl font-bold text-white uppercase tracking-widest">{claimAlert.playerName}</span>
                  </div>

                  {/* Slot Machine Verification Effect */}
                  <div className="h-64 overflow-hidden relative w-full max-w-lg mb-12 bg-black/20 rounded-[40px] border-4 border-white/10 backdrop-blur-sm">
                    <motion.div 
                      animate={{ y: ['0%', '-80%'] }} 
                      transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
                      className="flex flex-col items-center gap-8 py-4"
                    >
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/10 opacity-50 grayscale scale-75">
                           <div className="grid grid-cols-5 gap-1">
                             {Array.from({length: 25}).map((_, j) => (
                               <div key={j} className={`w-6 h-6 rounded-md ${Math.random() > 0.7 ? 'bg-[#FACC15]' : 'bg-white/20'}`} />
                             ))}
                           </div>
                        </div>
                      ))}
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-b from-[#3D3A35] via-transparent to-[#3D3A35] pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <div className="w-full h-24 border-y-4 border-[#FACC15]/40 bg-[#FACC15]/5 backdrop-blur-sm" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <p className="text-[#FACC15] text-2xl font-black uppercase tracking-[0.5em] animate-pulse">
                      Analyzing Card Data...
                    </p>
                    <div className="w-96 h-3 bg-white/10 rounded-full overflow-hidden border border-white/20 mx-auto">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1/2 h-full bg-gradient-to-r from-transparent via-[#FACC15] to-transparent"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {revealStatus === 'winner' && winner && (
                <motion.div 
                  key="winner"
                  initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  className="relative z-10 w-full max-w-6xl flex flex-col items-center"
                >
                  <motion.div 
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="w-48 h-48 bg-gradient-to-br from-[#FACC15] to-[#EA580C] rounded-full flex items-center justify-center mb-8 shadow-[0_0_100px_rgba(250,204,21,0.5)] border-8 border-white relative"
                  >
                    <Trophy size={100} className="text-white" />
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0, 0.5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-white rounded-full"
                    />
                  </motion.div>

                  <h2 className="text-[12vw] font-display text-white leading-none mb-4 uppercase italic tracking-tighter drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                    {winner.length > 1 ? 'WINNERS!' : 'BINGO!'}
                  </h2>
                  
                  <div className="flex flex-wrap justify-center gap-6 mb-16">
                    {winner.map((w: any, idx: number) => {
                      const isFirstWinner = room.stats.winners.length === 1;
                      const winsCount = room.stats.winners.filter(sw => sw.name === w.playerName).length;
                      
                      return (
                        <motion.div 
                          key={idx}
                          initial={{ x: idx % 2 === 0 ? -50 : 50, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.4 + (idx * 0.1) }}
                          className="bg-white/10 backdrop-blur-xl px-12 py-6 rounded-[40px] border-2 border-white/20 shadow-2xl flex items-center gap-6 relative"
                        >
                           <div className="w-16 h-16 rounded-full bg-[#EA580C] flex items-center justify-center text-white text-2xl font-black shadow-lg">
                             {w.playerName.substring(0,2).toUpperCase()}
                           </div>
                           <div className="text-left">
                             <div className="text-xs font-black text-[#FACC15] uppercase tracking-widest mb-1 flex items-center gap-2">
                               Champion
                               {isFirstWinner && <span className="bg-[#0D9488] text-white px-1.5 py-0.5 rounded-md text-[8px] tracking-normal">Early Bird</span>}
                               {winsCount > 1 && <span className="bg-[#EA580C] text-white px-1.5 py-0.5 rounded-md text-[8px] tracking-normal">{winsCount} Wins</span>}
                             </div>
                             <div className="text-5xl font-display text-white uppercase italic tracking-tighter leading-none">{w.playerName}</div>
                           </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-12 justify-center w-full px-4 mb-12 overflow-y-auto max-h-[40vh] scrollbar-hide py-8">
                    {winner.map((w: any, wIdx: number) => (
                      <motion.div 
                        key={wIdx}
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.6 + (wIdx * 0.2) }}
                        className="bg-white p-8 rounded-[56px] border-[12px] border-[#FACC15] shadow-[0_30px_60px_rgba(0,0,0,0.4)] scale-110 relative"
                      >
                        <div className="absolute -top-6 -right-6 bg-[#EA580C] text-white px-6 py-2 rounded-full font-black uppercase text-sm shadow-xl z-20 italic">
                          Winning Card
                        </div>
                        <div className="text-2xl font-display text-[#3D3A35] mb-6 uppercase italic tracking-wider text-center">{w.playerName}</div>
                        <div className="grid grid-cols-5 gap-2.5">
                          {w.card.map((row: any)=> row.map((num: any, idx: number) => { 
                            const called = num === 0 || room.calledNumbers.includes(num); 
                            return (
                              <div key={idx} className={`w-14 h-14 flex items-center justify-center font-display text-2xl rounded-2xl border-2 transition-all ${
                                num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : 
                                called ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg scale-105' : 
                                'bg-[#FAF7F2] border-[#E8E2D9] text-[#DED9D1]'
                              }`}>
                                {num === 0 ? 'FR' : num}
                              </div>
                            ) 
                          }))}
                        </div>
                        <div className="mt-8 pt-6 border-t-2 border-[#FAF7F2] flex flex-col items-center">
                           <span className="text-[10px] font-black text-[#A19B91] uppercase tracking-[0.2em] mb-2">Verified Pattern</span>
                           <span className="text-3xl font-display text-[#EA580C] uppercase italic tracking-tighter">{w.pattern}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <motion.div 
                    animate={{ y: [0, 10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-white/40 font-black uppercase tracking-[0.6em] text-sm mt-8"
                  >
                    Awaiting Host for Next Round
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
