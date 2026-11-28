import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { motion } from 'framer-motion';
import { PlayCircle, Users, Loader, Eye, Trophy, Wifi, CheckCircle2, Copy } from 'lucide-react';
import { calculateCardsCost, formatPeso, hasCardPricing } from '../lib/bingo';
import { useLanJoinBase, isLocalhostOrigin, copyTextSafe } from '../lib/lan';

const COLORS = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#eab308', name: 'Gold' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#ec4899', name: 'Pink' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '';

  const { nickname, avatarColor, setProfile, createRoom, joinRoom, connect } = useGameStore();

  const [localName, setLocalName] = useState(nickname);
  const [localColor, setLocalColor] = useState(avatarColor);
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [cardCount, setCardCount] = useState(1);
  const [loadingAction, setLoadingAction] = useState<'join' | 'host' | null>(null);
  const [error, setError] = useState('');
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [lanCopied, setLanCopied] = useState(false);
  const { baseUrl: lanBaseUrl, displayHost, isLanAddress } = useLanJoinBase();
  const showHostLanBadge = isLocalhostOrigin() && isLanAddress;

  const isBusy = loadingAction !== null;

  useEffect(() => {
    connect();
    fetch('/api/rooms')
      .then(res => res.json())
      .then(data => setPublicRooms(data))
      .catch(() => console.error("Could not fetch rooms"));
  }, [connect]);

  const handleHost = async () => {
    try {
      const name = localName.trim() || 'Host';
      if (!localName.trim()) {
        setLocalName(name);
      }
      setLoadingAction('host');
      setError('');
      setProfile(name, localColor);
      const res = await createRoom();
      if (res.success && res.code) {
        navigate(`/host/${res.code}`);
      } else {
        setError(res.error || 'Failed to create room. Please try again.');
        setLoadingAction(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Connection error. Please try again.');
      setLoadingAction(null);
    }
  };

  const handleJoin = async (codeOverride?: string) => {
    try {
      const targetCode = (codeOverride ?? joinCode).trim().toUpperCase();
      const name = localName.trim() || 'Player';
      if (!localName.trim()) {
        setLocalName(name);
      }
      if (!targetCode || targetCode.length !== 4) {
        setError('Please enter a valid 4-letter room code');
        return;
      }

      setLoadingAction('join');
      setError('');
      setProfile(name, localColor);
      localStorage.setItem('bingo_initial_cards', String(cardCount));
      const success = await joinRoom(targetCode, cardCount);
      if (success) {
        navigate(`/play/${targetCode}`);
      } else {
        setError('Room not found or disconnected. Check the 4-letter code.');
        setLoadingAction(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Connection error. Please try again.');
      setLoadingAction(null);
    }
  };

  const matchedRoom =
    publicRooms.find(r => r.id === joinCode.trim().toUpperCase()) ||
    (publicRooms.length === 1 ? publicRooms[0] : null);
  const matchedPricing = matchedRoom && hasCardPricing(matchedRoom) ? matchedRoom : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 relative overflow-x-hidden bg-[#FAF7F2] paper-texture">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md bg-white rounded-[32px] shadow-[0_20px_50px_rgba(61,58,53,0.12)] border-4 border-[#3D3A35] overflow-hidden relative z-10 p-5 sm:p-7"
      >
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#EA580C] text-white shadow-[0_6px_0_#9A3412] transform -rotate-6 mb-3 relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-white/30 rounded-2xl pointer-events-none" />
            <span className="text-3xl font-display relative z-10">L</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display tracking-tight leading-none text-[#3D3A35] mb-1.5 uppercase">
            Lucky Bingo
          </h1>
          <p className="text-[#6B655D] text-[11px] font-bold uppercase tracking-[0.25em]">
            Community Bingo Hall
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isBusy) handleJoin();
          }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <label htmlFor="nickname-input" className="text-xs font-bold text-[#6B655D] uppercase tracking-wider ml-1 block">
              Your Nickname
            </label>
            <input
              id="nickname-input"
              type="text"
              placeholder="e.g. Juan Dela Cruz"
              value={localName}
              onChange={e => { setLocalName(e.target.value); setError(''); }}
              className="w-full px-4 py-2.5 bg-[#FDFBF7] border-2 border-[#E8E2D9] rounded-2xl focus:outline-none focus:border-[#0D9488] font-bold transition-colors text-base text-[#3D3A35] placeholder:text-[#7A746B]"
              maxLength={24}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#6B655D] uppercase tracking-wider ml-1 block">
              Pick Your Color
            </span>
            <div className="flex gap-2 justify-between px-1">
              {COLORS.map(color => (
                <button
                  key={color.hex}
                  type="button"
                  aria-label={`Choose ${color.name} avatar color`}
                  aria-pressed={localColor === color.hex}
                  onClick={() => setLocalColor(color.hex)}
                  className={`w-9 h-9 rounded-full transition-all ${
                    localColor === color.hex
                      ? 'scale-110 ring-4 ring-offset-2 ring-[#3D3A35]/35 shadow-md'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t-2 border-[#FAF7F2] space-y-3">
            <div className="flex gap-2.5 sm:gap-3 items-stretch">
              <div className="w-[116px] sm:w-1/3 shrink-0 flex flex-col gap-1">
                <label htmlFor="room-code-input" className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider ml-1">
                  Room Code
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  placeholder="ABCD"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                  className="w-full flex-1 px-2 sm:px-3 py-2.5 bg-[#FDFBF7] border-2 border-[#E8E2D9] rounded-2xl focus:outline-none focus:border-[#0D9488] font-display text-center text-2xl sm:text-3xl tracking-[0.1em] sm:tracking-[0.16em] uppercase text-[#3D3A35] placeholder:text-[#7A746B]"
                  maxLength={4}
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider ml-1">
                  Buy Cards
                </span>
                <div className="flex gap-1 sm:gap-1.5 flex-1">
                  {[0, 1, 2, 3, 4].map(num => {
                    const price = matchedPricing && num > 0 ? calculateCardsCost(num, matchedPricing) : 0;
                    return (
                      <button
                        key={num}
                        type="button"
                        aria-label={num === 0 ? 'Watch as Spectator (0 cards)' : `Buy ${num} card${num > 1 ? 's' : ''}`}
                        aria-pressed={cardCount === num}
                        onClick={() => setCardCount(num)}
                        className={`flex-1 min-w-0 py-1.5 rounded-xl border-2 transition-all flex flex-col items-center justify-center leading-none gap-0.5 ${
                          cardCount === num
                            ? 'bg-[#3D3A35] border-[#3D3A35] text-white shadow-md'
                            : 'bg-white border-[#E8E2D9] text-[#3D3A35] hover:border-[#6B655D]'
                        }`}
                      >
                        {num === 0 ? (
                          <Eye size={18} strokeWidth={2.4} aria-hidden="true" />
                        ) : (
                          <span className="font-display text-lg sm:text-xl leading-none">{num}</span>
                        )}
                        {matchedPricing && num > 0 && (
                          <span className={`text-[10px] font-bold leading-none tabular-nums ${cardCount === num ? 'text-[#FACC15]' : 'text-[#6B655D]'}`}>
                            {formatPeso(price)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] font-semibold text-[#6B655D] text-center">
                  {cardCount === 0
                    ? 'Spectator Mode (0 cards)'
                    : matchedPricing
                      ? `Total: ${formatPeso(calculateCardsCost(cardCount, matchedPricing))}`
                      : `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} selected`}
                </span>
              </div>
            </div>

            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[#B91C1C] bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-bold text-center text-xs"
              >
                {error}
              </motion.p>
            )}

            <button
              id="join-btn"
              type="submit"
              disabled={isBusy}
              className="w-full bg-[#EA580C] hover:bg-[#DC4E08] text-white py-4 rounded-2xl font-display text-2xl transition-all flex items-center justify-center gap-3 shadow-[0_6px_0_#9A3412] active:translate-y-[6px] active:shadow-none touch-manipulation uppercase tracking-widest disabled:opacity-60"
            >
              {loadingAction === 'join' ? (
                <Loader className="animate-spin" size={24} />
              ) : (
                <PlayCircle size={26} strokeWidth={2.5} />
              )}
              {loadingAction === 'join' ? 'Joining Room...' : 'Join Game'}
            </button>
          </div>

          {publicRooms.length > 0 && (
            <div className="bg-[#FAF7F2] p-3.5 rounded-2xl border-2 border-[#E8E2D9]">
              <h3 className="text-[11px] font-bold text-[#6B655D] uppercase tracking-wider mb-2">Open Rooms</h3>
              <div className="space-y-2 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                {publicRooms.map(room => (
                  <button
                    key={room.id}
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setJoinCode(room.id);
                      handleJoin(room.id);
                    }}
                    className="w-full flex items-center justify-between bg-white border border-[#DED9D1] p-2.5 rounded-xl hover:border-[#0D9488] hover:bg-[#F3EFE9] transition-colors text-left disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-[#3D3A35] uppercase tracking-widest">{room.id}</div>
                      <div className="text-[11px] font-semibold text-[#6B655D] truncate flex items-center gap-1">
                        <span>
                          Host: {room.hostName} · {room.mode}
                          {hasCardPricing(room) && ` · ${formatPeso(calculateCardsCost(1, room))}/card`}
                        </span>
                        {room.bingoPrize > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[#C2410C] font-bold shrink-0">
                            · <Trophy size={11} aria-hidden="true" /> {formatPeso(room.bingoPrize)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-[#0D9488]/12 text-[#0F766E] px-2.5 py-1 rounded-full shrink-0">
                      <span className="w-1.5 h-1.5 bg-[#0D9488] rounded-full animate-pulse" />
                      <span className="text-xs font-black tabular-nums">{room.players}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative flex items-center justify-center py-1">
            <div className="absolute border-t-2 border-[#E8E2D9] w-full" />
            <span className="relative bg-white px-3 text-[11px] font-bold text-[#6B655D] uppercase tracking-[0.2em]">
              Or Host a Room
            </span>
          </div>

          <button
            type="button"
            onClick={handleHost}
            disabled={isBusy}
            className="w-full py-3.5 bg-[#F3EFE9] hover:bg-[#E8E2D9] border-2 border-[#DED9D1] text-[#3D3A35] rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:translate-y-0.5 touch-manipulation uppercase tracking-widest disabled:opacity-60"
          >
            {loadingAction === 'host' ? <Loader className="animate-spin text-[#0D9488]" size={18} /> : <Users size={18} />}
            {loadingAction === 'host' ? 'Starting Room...' : 'Host New Room'}
          </button>

          {showHostLanBadge && (
            <button
              type="button"
              onClick={async () => {
                await copyTextSafe(lanBaseUrl);
                setLanCopied(true);
                window.setTimeout(() => setLanCopied(false), 1600);
              }}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-[#FAF7F2] hover:bg-[#F3EFE9] border border-[#E8E2D9] text-left transition-colors"
              title="Click to copy local Wi-Fi join URL for phones"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Wifi size={15} className="text-[#0D9488] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#0F766E]">Local Wi-Fi Ready</div>
                  <div className="text-xs font-bold text-[#3D3A35] truncate tabular-nums">{displayHost}</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B655D] shrink-0">
                {lanCopied ? <CheckCircle2 size={14} className="text-[#0D9488]" /> : <Copy size={14} />}
                <span>{lanCopied ? 'Copied' : 'Copy'}</span>
              </span>
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
}
