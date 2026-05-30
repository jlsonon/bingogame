import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface BingoCardProps {
  card: number[][]; // 5x5 array
  markedCells: number[]; // numbers that user tapped manually
  calledNumbers: number[]; // from server
  onToggleCell?: (num: number) => void;
  readOnly?: boolean;
  highlightLatest?: number | null;
}

const BINGO_HEADERS = ['B', 'I', 'N', 'G', 'O'];

export function BingoCard({ card, markedCells, calledNumbers, onToggleCell, readOnly, highlightLatest }: BingoCardProps) {
  const isCalled = (num: number) => num === 0 || calledNumbers.includes(num);
  const isMarked = (num: number) => num === 0 || markedCells.includes(num);

  return (
    <div className="@container bg-white p-[4cqw] rounded-[8cqw] border-[max(2px,0.8cqw)] border-[#3D3A35] shadow-[max(4px,1.5cqw)_max(4px,1.5cqw)_0px_rgba(61,58,53,0.1)] w-full h-full select-none touch-manipulation flex flex-col overflow-hidden">
      <div className="grid grid-cols-5 gap-1 mb-[2cqw] text-center">
        {BINGO_HEADERS.map((letter, i) => (
          <div key={i} className="font-sans font-black text-[6cqw] text-[#EA580C] drop-shadow-sm leading-none">
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-[1.5cqw] flex-1 min-h-0">
        {card.map((row, rIndex) => (
          row.map((num, cIndex) => {
            const called = isCalled(num);
            const marked = isMarked(num);
            const isLatest = num !== 0 && highlightLatest === num;
            
            const handleClick = () => {
              if (readOnly || num === 0) return;
              if (onToggleCell) onToggleCell(num);
            };

            return (
              <div 
                key={`${rIndex}-${cIndex}`}
                onClick={handleClick}
                className={cn(
                  "aspect-square flex items-center justify-center rounded-[3cqw] font-black cursor-pointer transition-all duration-200 relative overflow-hidden text-[6cqw]",
                  num === 0 ? "bg-[#FACC15] border-[max(1px,0.5cqw)] border-white text-[#854D0E] shadow-sm uppercase tracking-tighter" :
                  marked && called ? "bg-[#0D9488] border-[max(1px,0.5cqw)] border-[#0D9488] text-white shadow-inner shadow-black/20 scale-[0.96]" :
                  marked && !called ? "bg-white border-[max(1px,0.5cqw)] border-[#EA580C] text-[#EA580C]" :
                  !marked && called ? "bg-[#0D9488]/10 border-[max(1px,0.5cqw)] border-[#0D9488]/30 text-[#3D3A35] opacity-60" :
                  "bg-[#FDFBF7] border-[max(1px,0.5cqw)] border-[#E8E2D9] text-[#3D3A35] hover:bg-orange-50",
                  readOnly && !marked && !called && "opacity-40 grayscale-[50%]"
                )}
              >
                {num === 0 ? (
                  <span className="text-[3cqw] uppercase tracking-tighter mix-blend-multiply opacity-90 font-black">Free</span>
                ) : (
                  <span>{num}</span>
                )}

                {/* Smart Highlight / Pulse for Latest Ball */}
                <AnimatePresence>
                   {isLatest && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        className="absolute inset-0 z-10 pointer-events-none"
                      >
                         <div className="absolute inset-0 bg-[#FACC15] animate-ping opacity-30 rounded-[3cqw]" />
                         <div className="absolute inset-0 ring-[max(2px,1cqw)] ring-inset ring-[#FACC15] shadow-[0_0_10px_#FACC15] rounded-[3cqw]" />
                      </motion.div>
                   )}
                </AnimatePresence>
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
