import { useGameStore } from '../store/gameStore';
import { checkValidWin } from '../lib/bingo';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function GodView() {
  const { code } = useParams();
  const room = useGameStore(s => s.room);
  const rejoinRoom = useGameStore(s => s.rejoinRoom);

  useEffect(() => {
    if (!room && code) {
      rejoinRoom(code, 'host');
    }
  }, [room, code, rejoinRoom]);

  if (!room) return <div className="p-8 text-center font-black uppercase tracking-widest">Loading God View...</div>;

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black uppercase tracking-tighter italic">Lucky Bingo God View</h1>
        <div className="bg-[#3D3A35] text-white px-4 py-2 rounded-xl font-display text-xl">{room.id}</div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {Object.values(room.players).map(p => { 
          if (!p.connected || p.activeCards.length === 0) return null;
          return p.activeCards.map((card, cardIdx) => {
            const marked = p.markedCells[cardIdx] || [];
            const res = checkValidWin(card, marked, room.calledNumbers, room.mode, room.patterns);
            const nearWin = res.cellsAway <= 3;
            
            return (
              <div key={`${p.id}-${cardIdx}`} className={`flex flex-col bg-white border-2 p-2 rounded-xl shadow-sm transition-all ${nearWin ? 'border-[#EA580C] ring-4 ring-[#EA580C]/20' : 'border-[#E8E2D9]'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-black text-[10px] text-[#3D3A35] truncate max-w-[60%]">{p.nickname}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase ${nearWin ? 'bg-[#EA580C] text-white' : 'bg-[#E8E2D9] text-[#7A746B]'}`}>
                    {res.cellsAway}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-0.5 pointer-events-none">
                  {card.map((row: any)=> row.map((num: any, idx: number) => { 
                    const called = num === 0 || room.calledNumbers.includes(num);
                    const isMarked = num === 0 || marked.includes(num);
                    return (
                      <div key={idx} className={`aspect-square flex items-center justify-center font-black text-[6px] rounded-sm border ${
                        num === 0 ? 'bg-[#3D3A35] text-white border-[#3D3A35]' : 
                        (isMarked && called) ? 'bg-[#0D9488] text-white border-[#0D9488]' : 
                        (!isMarked && called) ? 'bg-[#0D9488]/10 text-[#3D3A35]/30' :
                        'bg-[#FAF7F2] border-[#E8E2D9] text-[#DED9D1]'
                      }`}>
                        {num === 0 ? 'FR' : num}
                      </div>
                    ) 
                  }))}
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
