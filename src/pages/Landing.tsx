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
          <p className="text-[#A19B91] text-xs font-bold uppercase tracking-widest">Community Edition</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-700">Your Nickname</label>
            <input 
              type="text" 
              placeholder="e.g. Kuya John"
              value={localName}
              onChange={e => { setLocalName(e.target.value); setError(''); }}
              className="w-full px-4 py-3 bg-[#FDFBF7] border-2 border-[#E8E2D9] rounded-xl focus:outline-none focus:border-[#0D9488] font-medium transition-colors text-lg text-[#3D3A35]"
              maxLength={12}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Choose Color</label>
            <div className="flex gap-2 justify-between">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setLocalColor(color)}
                  className={`w-8 h-8 rounded-full transition-transform ${localColor === color ? 'scale-125 ring-2 ring-offset-2 ring-slate-800' : 'hover:scale-110'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex gap-3">
             <input 
                type="text" 
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                className="w-1/2 px-4 py-4 bg-[#FDFBF7] border-2 border-[#E8E2D9] rounded-2xl focus:outline-none focus:border-[#0D9488] font-black text-center text-xl tracking-widest uppercase text-[#3D3A35]"
                maxLength={4}
              />
              <button 
                onClick={handleJoin}
                disabled={loading}
                className="flex-1 bg-[#EA580C] text-white rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-2 shadow-[0_6px_0_#9A3412] active:translate-y-[6px] active:shadow-none touch-manipulation uppercase tracking-tighter"
              >
                <PlayCircle size={24} />
                JOIN
              </button>
          </div>

          <div className="relative flex items-center justify-center py-2">
            <div className="absolute border-t border-slate-200 w-full" />
            <span className="relative bg-white px-4 text-xs font-bold text-[#A19B91] uppercase tracking-wider">or</span>
          </div>

          <button 
            onClick={handleHost}
            disabled={loading}
            className="w-full py-4 bg-[#F3EFE9] border border-[#DED9D1] text-[#3D3A35] rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 active:translate-y-1 touch-manipulation"
          >
            <Users size={24} />
            Host New Room
          </button>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 font-bold text-center text-sm">
              {error}
            </motion.p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
