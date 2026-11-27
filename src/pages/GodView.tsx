import { useGameStore } from '../store/gameStore';
import { checkValidWin } from '../lib/bingo';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function GodView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const socket = useGameStore(s => s.socket);
  const room = useGameStore(s => s.room);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);

  useEffect(() => {
    if (!socket || !code) return;
    if (!room) {
      rejoinRoom(code, 'godview').then(success => {
        if (!success) navigate('/');
      });
    }
  }, [socket, room, code, rejoinRoom, navigate]);

  if (!room) return <div className="p-8 text-center font-black uppercase tracking-widest">Loading God View...</div>;

  const hasCalledBalls = (room.calledNumbers?.length || 0) > 0;
  const playersWithCards = Object.values(room.players).filter(p => p.connected && p.activeCards.length > 0);

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-4 sm:p-6 overflow-y-auto">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter italic">Lucky Bingo God View</h1>
          <p className="text-[10px] font-bold text-[#A19B91] uppercase tracking-widest">
            {room.calledNumbers.length} / 75 Balls Called · {playersWithCards.length} Active Players
          </p>
        </div>
        <div className="bg-[#3D3A35] text-white px-4 py-2 rounded-xl font-display text-xl tracking-wider">{room.id}</div>
      </div>

      {playersWithCards.length === 0 ? (
        <div className="text-center py-20 text-[#A19B91] font-bold italic">
          Waiting for players to join with cards...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
          {playersWithCards.map(p =>
            p.activeCards.map((card, cardIdx) => {
              const marked = p.markedCells[cardIdx] || [];
              const res = checkValidWin(card, marked, room.calledNumbers, room.mode, room.patterns);
              const nearWin = hasCalledBalls && res.cellsAway <= 3;

              return (
                <div
                  key={`${p.id}-${cardIdx}`}
                  className={`flex flex-col bg-white border-2 p-2.5 rounded-2xl shadow-sm transition-all ${
                    nearWin ? 'border-[#EA580C] ring-4 ring-[#EA580C]/20' : 'border-[#E8E2D9]'
                  }`}
                >
                  <div className="flex justify-between items-center gap-1 mb-1.5">
                    <span className="font-black text-[10px] text-[#3D3A35] truncate">
                      {p.nickname} <span className="text-[#A19B91]">#{cardIdx + 1}</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase shrink-0 ${
                        nearWin ? 'bg-[#EA580C] text-white' : 'bg-[#E8E2D9] text-[#7A746B]'
                      }`}
                    >
                      {res.cellsAway}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-0.5 pointer-events-none">
                    {['B', 'I', 'N', 'G', 'O'].map(letter => (
                      <div key={letter} className="text-center font-black text-[7px] text-[#EA580C] leading-none pb-0.5">
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
                            className={`aspect-square flex items-center justify-center font-black text-[7px] rounded-sm border ${
                              num === 0
                                ? 'bg-[#3D3A35] text-white border-[#3D3A35]'
                                : isMarked && called
                                  ? 'bg-[#0D9488] text-white border-[#0D9488]'
                                  : !isMarked && called
                                    ? 'bg-[#0D9488]/15 border-[#0D9488]/30 text-[#3D3A35]/60'
                                    : isMarked && !called
                                      ? 'bg-white border-[#EA580C] text-[#EA580C]'
                                      : 'bg-[#FAF7F2] border-[#E8E2D9] text-[#A19B91]'
                            }`}
                          >
                            {num === 0 ? 'FR' : num}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
