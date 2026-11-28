import { useGameStore } from '../store/gameStore';
import { checkValidWin, getBallLetter } from '../lib/bingo';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader, ArrowUpDown } from 'lucide-react';

export default function GodView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const latestBall = useGameStore(s => s.latestBall);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);
  const [sortMode, setSortMode] = useState<'closest' | 'name'>('closest');

  useEffect(() => {
    if (!socket || !code) return;
    if (!room) {
      rejoinRoom(code, 'godview').then(success => {
        if (!success) navigate('/');
      });
    }
  }, [socket, room, code, rejoinRoom, navigate]);

  if (!room) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-8 gap-3 text-center">
        <div className="w-10 h-10 border-4 border-[#0D9488] border-t-transparent rounded-full animate-spin" />
        <div className="font-bold uppercase tracking-widest text-sm text-[#6B655D]">Loading Live Player Cards...</div>
      </div>
    );
  }

  const hasCalledBalls = (room.calledNumbers?.length || 0) > 0;
  const playersWithCards = Object.values(room.players).filter(p => p.connected && p.activeCards.length > 0);
  const activeBall = latestBall ?? (room.calledNumbers.length > 0 ? room.calledNumbers[room.calledNumbers.length - 1] : null);

  const cardEntries = playersWithCards.flatMap(p =>
    p.activeCards.map((card, cardIdx) => {
      const marked = p.markedCells[cardIdx] || [];
      const res = checkValidWin(card, marked, room.calledNumbers, room.mode, room.patterns);
      return { p, card, cardIdx, marked, res, isFalseMark: res.cellsAway === 99 };
    })
  );

  const sortedEntries = [...cardEntries].sort((a, b) => {
    if (sortMode === 'closest') {
      if (a.res.cellsAway !== b.res.cellsAway) return a.res.cellsAway - b.res.cellsAway;
    }
    const nameCmp = a.p.nickname.localeCompare(b.p.nickname);
    return nameCmp !== 0 ? nameCmp : a.cardIdx - b.cardIdx;
  });

  const statusLabel: Record<string, string> = {
    waiting: 'Waiting',
    playing: 'Live',
    paused: 'Paused',
    next_round: 'Next Round',
    finished: 'Finished',
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-4 sm:p-6 overflow-y-auto">
      {!socket?.connected && (
        <div role="status" className="mb-4 bg-[#EA580C] text-white px-4 py-2.5 rounded-2xl shadow-md flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider">
          <Loader size={15} className="animate-spin" />
          <span>Connection lost — reconnecting to room {room.id}...</span>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-3 mb-6 sm:mb-8">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-display uppercase tracking-tight text-[#3D3A35]">
              Lucky Bingo · Live Cards
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              room.status === 'playing'
                ? 'bg-[#0D9488]/15 text-[#0F766E]'
                : room.status === 'paused'
                  ? 'bg-[#EA580C]/15 text-[#C2410C]'
                  : 'bg-[#E8E2D9] text-[#3D3A35]'
            }`}>
              {statusLabel[room.status] || room.status}
            </span>
          </div>
          <p className="text-xs font-semibold text-[#6B655D] uppercase tracking-wider mt-0.5 tabular-nums">
            {room.calledNumbers.length} / 75 Balls Called · {playersWithCards.length}{' '}
            {playersWithCards.length === 1 ? 'Active Player' : 'Active Players'} · {cardEntries.length}{' '}
            {cardEntries.length === 1 ? 'Card' : 'Cards'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {activeBall && (
            <div className="bg-[#EA580C] text-white px-3.5 py-1.5 rounded-xl font-display text-lg tracking-wider tabular-nums shadow-sm">
              {getBallLetter(activeBall)}-{activeBall}
            </div>
          )}
          <button
            type="button"
            onClick={() => setSortMode(m => (m === 'closest' ? 'name' : 'closest'))}
            className="bg-white border-2 border-[#E8E2D9] hover:border-[#6B655D] text-[#3D3A35] px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            <ArrowUpDown size={14} className="text-[#0D9488]" />
            <span>Sort: {sortMode === 'closest' ? 'Closest' : 'Name'}</span>
          </button>
          <div className="bg-[#3D3A35] text-white px-4 py-2 rounded-xl font-display text-xl tracking-wider tabular-nums">{room.id}</div>
        </div>
      </div>

      {sortedEntries.length === 0 ? (
        <div className="text-center py-20 text-[#6B655D] font-semibold italic">
          Waiting for players to join with cards...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
          {sortedEntries.map(({ p, card, cardIdx, marked, res, isFalseMark }) => {
            const nearWin = hasCalledBalls && !isFalseMark && res.cellsAway <= 3;

            return (
              <div
                key={`${p.id}-${cardIdx}`}
                className={`flex flex-col bg-white border-2 p-2.5 rounded-2xl shadow-sm transition-all ${
                  isFalseMark
                    ? 'border-[#B91C1C]'
                    : nearWin
                      ? 'border-[#EA580C] ring-4 ring-[#EA580C]/20'
                      : 'border-[#E8E2D9]'
                }`}
              >
                <div className="flex justify-between items-center gap-1 mb-1.5">
                  <span className="font-bold text-[11px] text-[#3D3A35] truncate">
                    {p.nickname} <span className="text-[#6B655D]">#{cardIdx + 1}</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 tabular-nums ${
                      isFalseMark
                        ? 'bg-[#B91C1C] text-white'
                        : nearWin
                          ? 'bg-[#EA580C] text-white'
                          : 'bg-[#E8E2D9] text-[#3D3A35]'
                    }`}
                  >
                    {isFalseMark ? 'False' : `${res.cellsAway} Left`}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-0.5 pointer-events-none">
                  {['B', 'I', 'N', 'G', 'O'].map(letter => (
                    <div key={letter} className="text-center font-black text-[10px] text-[#C2410C] leading-none pb-0.5">
                      {letter}
                    </div>
                  ))}
                  {card.map((row: number[], rIdx: number) =>
                    row.map((num: number, cIdx: number) => {
                      const called = num === 0 || room.calledNumbers.includes(num);
                      const isMarked = num === 0 || marked.includes(num);
                      return (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className={`aspect-square flex items-center justify-center font-bold text-[10px] rounded-sm border tabular-nums ${
                            num === 0
                              ? 'bg-[#FACC15] text-[#854D0E] border-[#FACC15]'
                              : isMarked && called
                                ? 'bg-[#0D9488] text-white border-[#0D9488]'
                                : !isMarked && called
                                  ? 'bg-[#0D9488]/15 border-[#0D9488]/35 text-[#3D3A35]'
                                  : isMarked && !called
                                    ? 'bg-white border-[#EA580C] text-[#C2410C]'
                                    : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#6B655D]'
                          }`}
                        >
                          {num === 0 ? '★' : num}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
