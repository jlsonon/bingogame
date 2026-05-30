import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { motion } from 'framer-motion';
import { Dices, PlayCircle, Settings2, Users } from 'lucide-react';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export default function Landing() {
  const navigate = useNavigate();
  const { nickname, avatarColor, setProfile, createRoom, joinRoom } = useGameStore();

  const [localName, setLocalName] = useState(nickname);
  const [localColor, setLocalColor] = useState(avatarColor);
  const [joinCode, setJoinCode] = useState('');
  const [cardCount, setCardCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleHost = async () => {
    if (!localName.trim()) { setError('Please enter a nickname'); return; }
    setLoading(true);
    setProfile(localName, localColor);
    const code = await createRoom();
    navigate(`/host/${code}`);
  };

  const handleJoin = async () => {
    if (!localName.trim()) { setError('Please enter a nickname'); return; }
    if (!joinCode.trim() || joinCode.length !== 4) { setError('Please enter a valid 4-letter code'); return; }
    
    setLoading(true);
    setProfile(localName, localColor);
    localStorage.setItem('bingo_initial_cards', String(cardCount));
    const success = await joinRoom(joinCode);
    if (success) {
      navigate(`/play/${joinCode.toUpperCase()}`);
    } else {
      setError('Room not found or disconnected');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#FAF7F2]">
      {/* Decorative background balls */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-[#EA580C]/20 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob" />
      <div className="absolute top-20 right-20 w-40 h-40 bg-[#0D9488]/20 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-40 w-40 h-40 bg-[#FACC15]/20 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob animation-delay-4000" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[40px] shadow-[12px_12px_0px_rgba(61,58,53,0.1)] border-4 border-[#3D3A35] overflow-hidden relative z-10 p-6 md:p-8"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#EA580C] text-white shadow-lg transform rotate-[-10deg] mb-4">
            <span className="text-3xl font-black">L</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight leading-none text-[#EA580C] mb-2 uppercase">LuckyBingo</h1>
          <p className="text-[#A19B91] text-xs font-bold uppercase tracking-widest">Digital Bingo Hall</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <label className="text-xs font-black text-[#7A746B] uppercase tracking-widest ml-1">Your Nickname</label>
            <input 
              type="text" 
              placeholder="e.g. Juan Dela Cruz"
              value={localName}
              onChange={e => { setLocalName(e.target.value); setError(''); }}
              className="w-full px-4 py-3 bg-[#FDFBF7] border-2 border-[#E8E2D9] rounded-2xl focus:outline-none focus:border-[#0D9488] font-bold transition-colors text-lg text-[#3D3A35]"
              maxLength={12}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-[#7A746B] uppercase tracking-widest ml-1">Pick your color</label>
            <div className="flex gap-2 justify-between px-1">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setLocalColor(color)}
                  className={`w-9 h-9 rounded-full transition-all ${localColor === color ? 'scale-110 ring-4 ring-offset-2 ring-slate-200 shadow-md' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="pt-6 border-t-2 border-[#FAF7F2] space-y-4">
              <div className="flex gap-3">
                 <input 
                    type="text" 
                    placeholder="CODE"
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                    className="w-1/3 px-4 py-4 bg-[#FDFBF7] border-2 border-[#E8E2D9] rounded-2xl focus:outline-none focus:border-[#0D9488] font-black text-center text-2xl tracking-[0.2em] uppercase text-[#3D3A35]"
                    maxLength={4}
                  />
                  <div className="flex-1 flex flex-col gap-1.5">
                     <label className="text-[10px] font-black text-[#A19B91] uppercase tracking-widest ml-1">Buy Cards</label>
                     <div className="flex gap-1.5 h-full">
                        {[1, 2, 3, 4].map(num => (
                           <button
                             key={num}
                             onClick={() => setCardCount(num)}
                             className={`flex-1 rounded-xl font-black text-sm border-2 transition-all ${cardCount === num ? 'bg-[#3D3A35] border-[#3D3A35] text-white shadow-md' : 'bg-white border-[#E8E2D9] text-[#7A746B] hover:border-[#A19B91]'}`}
                           >
                             {num}
                           </button>
                        ))}
                     </div>
                  </div>
              </div>

              <button 
                onClick={handleJoin}
                disabled={loading}
                className="w-full bg-[#EA580C] text-white py-5 rounded-[24px] font-black text-xl transition-all flex items-center justify-center gap-3 shadow-[0_8px_0_#9A3412] active:translate-y-[8px] active:shadow-none touch-manipulation uppercase tracking-widest"
              >
                <PlayCircle size={28} fill="currentColor" />
                Join Game
              </button>
          </div>

          <div className="relative flex items-center justify-center py-2">
            <div className="absolute border-t-2 border-[#FAF7F2] w-full" />
            <span className="relative bg-white px-4 text-[10px] font-black text-[#DED9D1] uppercase tracking-[0.3em]">Venue Host</span>
          </div>

          <button 
            onClick={handleHost}
            disabled={loading}
            className="w-full py-4 bg-[#F3EFE9] border-2 border-[#DED9D1] text-[#7A746B] rounded-[24px] font-black text-sm transition-all flex items-center justify-center gap-2 active:translate-y-1 touch-manipulation uppercase tracking-widest"
          >
            <Users size={20} />
            Host New Room
          </button>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 font-black text-center text-xs uppercase tracking-wider">
              {error}
            </motion.p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
