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
    <div className="bg-white p-4 rounded-[32px] border-[3px] border-[#3D3A35] shadow-[12px_12px_0px_rgba(61,58,53,0.1)] w-full mx-auto select-none touch-manipulation flex flex-col">
      <div className="grid grid-cols-5 gap-2 mb-4 text-center">
        {BINGO_HEADERS.map((letter, i) => (
          <div key={i} className="font-sans font-black text-2xl text-[#EA580C] drop-shadow-sm">
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
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
                  "aspect-square flex items-center justify-center rounded-xl sm:rounded-2xl text-xl sm:text-3xl font-black cursor-pointer transition-all duration-200 relative overflow-hidden",
                  num === 0 ? "bg-[#FACC15] border-2 border-white text-[#854D0E] shadow-sm uppercase tracking-tighter" :
                  marked && called ? "bg-[#0D9488] border-2 border-[#0D9488] text-white shadow-inner shadow-black/20 scale-[0.98]" :
                  marked && !called ? "bg-white border-2 border-[#EA580C] text-[#EA580C]" :
                  !marked && called ? "bg-[#0D9488]/10 border-2 border-[#0D9488]/30 text-[#3D3A35] opacity-60" :
                  "bg-[#FDFBF7] border-2 border-[#E8E2D9] text-[#3D3A35] hover:bg-orange-50",
                  readOnly && !marked && !called && "opacity-40 grayscale-[50%]"
                )}
              >
                {num === 0 ? (
                  <span className="text-[8px] sm:text-[10px] uppercase tracking-tighter mix-blend-multiply opacity-90 font-black">Free</span>
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
                         <div className="absolute inset-0 bg-[#FACC15] animate-ping opacity-30 rounded-xl" />
                         <div className="absolute inset-0 ring-4 ring-inset ring-[#FACC15] shadow-[0_0_20px_#FACC15] rounded-xl" />
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
