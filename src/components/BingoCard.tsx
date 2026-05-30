import { cn } from "../lib/utils";

interface BingoCardProps {
  card: number[][]; // 5x5 array
  markedCells: number[]; // numbers that user tapped manually
  calledNumbers: number[]; // from server
  onToggleCell?: (num: number) => void;
  readOnly?: boolean;
}

const BINGO_HEADERS = ['B', 'I', 'N', 'G', 'O'];

export function BingoCard({ card, markedCells, calledNumbers, onToggleCell, readOnly }: BingoCardProps) {
  const isCalled = (num: number) => num === 0 || calledNumbers.includes(num);
  const isMarked = (num: number) => num === 0 || markedCells.includes(num);

  return (
    <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-[32px] sm:rounded-[40px] border-[3px] sm:border-4 border-[#3D3A35] shadow-[6px_6px_0px_rgba(61,58,53,0.1)] sm:shadow-[12px_12px_0px_rgba(61,58,53,0.1)] max-w-md w-full mx-auto select-none touch-manipulation flex flex-col">
      <div className="grid grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6 text-center">
        {BINGO_HEADERS.map((letter, i) => (
          <div key={i} className="font-sans font-black text-2xl sm:text-4xl text-[#EA580C] drop-shadow-sm">
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 sm:gap-2">
        {card.map((row, rIndex) => (
          row.map((num, cIndex) => {
            const called = isCalled(num);
            const marked = isMarked(num);
            
            // Interaction logic
            const handleClick = () => {
              if (readOnly || num === 0) return;
              if (onToggleCell) onToggleCell(num);
            };

            return (
              <div 
                key={`${rIndex}-${cIndex}`}
                onClick={handleClick}
                className={cn(
                  "aspect-square flex items-center justify-center rounded-lg sm:rounded-2xl text-lg sm:text-3xl font-black cursor-pointer transition-all duration-200 relative overflow-hidden",
                  num === 0 ? "bg-[#FACC15] border-2 border-white text-[#854D0E] shadow-sm uppercase tracking-tighter" :
                  marked && called ? "bg-[#0D9488] border-2 border-[#0D9488] text-white shadow-inner shadow-black/20 scale-[0.98]" :
                  marked && !called ? "bg-[#FDFBF7] border-2 border-[#EA580C] text-[#EA580C]" :
                  !marked && called ? "bg-[#0D9488]/10 border-2 border-[#0D9488]/30 text-[#3D3A35] animate-pulse" :
                  "bg-[#FDFBF7] border-2 border-[#E8E2D9] text-[#3D3A35] hover:bg-orange-50",
                  readOnly && !marked && !called && "opacity-80 grayscale"
                )}
              >
                {num === 0 ? (
                  <span className="text-[10px] sm:text-xs uppercase tracking-tighter mix-blend-multiply opacity-90 font-black">Free</span>
                ) : (
                  <span>{num}</span>
                )}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
