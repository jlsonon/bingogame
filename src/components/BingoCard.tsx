import { useId } from "react";
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
  const glowId = useId();
  const isCalled = (num: number) => num === 0 || calledNumbers.includes(num);
  const isMarked = (num: number) => num === 0 || markedCells.includes(num);

  // Find all Dikit pairs (horizontal adjacent, both marked and called, excluding free space)
  const dikitPairs: { r: number, c: number }[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      const num1 = card[r][c];
      const num2 = card[r][c + 1];
      if (num1 !== 0 && num2 !== 0 && isMarked(num1) && isCalled(num1) && isMarked(num2) && isCalled(num2)) {
        dikitPairs.push({ r, c });
      }
    }
  }

  return (
    <div className="@container bg-[#FCFAF5] p-[4cqw] rounded-[8cqw] border-[max(2px,0.8cqw)] border-[#3D3A35] shadow-[max(4px,1.5cqw)_max(4px,1.5cqw)_0px_rgba(61,58,53,0.1)] w-full h-full select-none touch-manipulation flex flex-col overflow-hidden paper-texture relative">
      <div className="grid grid-cols-5 gap-[1.5cqw] mb-[2cqw] text-center relative z-20 shrink-0">
        {BINGO_HEADERS.map((letter, i) => (
          <div key={i} className="font-display text-[7cqw] text-[#EA580C] drop-shadow-sm leading-none pt-0.5">
            {letter}
          </div>
        ))}
      </div>

      {/* Exact 5x5 Grid Wrapper so Dikit SVG aligns dead-center with cells */}
      <div className="relative flex-1 min-h-0">
        {dikitPairs.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none z-10 w-full h-full"
            viewBox="0 0 500 500"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            {dikitPairs.map((pair, idx) => {
              const x1 = (pair.c + 0.5) * 100;
              const x2 = (pair.c + 1.5) * 100;
              const y = (pair.r + 0.5) * 100;

              return (
                <motion.line
                  key={`${pair.r}-${pair.c}-${idx}`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.85 }}
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke="#FACC15"
                  strokeWidth="16"
                  strokeLinecap="round"
                  filter={`url(#${glowId})`}
                />
              );
            })}
          </svg>
        )}

        <div className="grid grid-cols-5 grid-rows-5 gap-[1.5cqw] w-full h-full relative z-20">
          {card.map((row, rIndex) => (
            row.map((num, cIndex) => {
              const called = isCalled(num);
              const marked = isMarked(num);
              const isLatest = num !== 0 && highlightLatest === num;
              
              const handleClick = () => {
                if (readOnly || num === 0) return;
                if ('vibrate' in navigator) navigator.vibrate(40);
                if (onToggleCell) onToggleCell(num);
              };

              return (
                <div 
                  key={`${rIndex}-${cIndex}`}
                  onClick={handleClick}
                  className={cn(
                    "aspect-square flex items-center justify-center rounded-[3cqw] font-display transition-all duration-200 relative overflow-hidden text-[7cqw]",
                    !readOnly && num !== 0 ? "cursor-pointer" : "cursor-default",
                    num === 0 ? "bg-[#FACC15] border-[max(1px,0.5cqw)] border-white text-[#854D0E] shadow-sm uppercase tracking-tighter" :
                    marked && called ? "bg-[#0D9488] border-[max(1px,0.5cqw)] border-[#0D9488] text-white shadow-inner shadow-black/20 scale-[0.96]" :
                    marked && !called ? "bg-white border-[max(1px,0.5cqw)] border-[#EA580C] text-[#EA580C]" :
                    !marked && called ? "bg-[#0D9488]/10 border-[max(1px,0.5cqw)] border-[#0D9488]/30 text-[#3D3A35] opacity-75" :
                    "bg-[#FDFBF7] border-[max(1px,0.5cqw)] border-[#E8E2D9] text-[#3D3A35] hover:bg-orange-50",
                    readOnly && !marked && !called && "opacity-50 grayscale-[35%]"
                  )}
                >
                  {/* Subtle Stamped Ink Highlight for Marked Numbers (Pure CSS, no external URL) */}
                  {marked && called && num !== 0 && (
                    <div
                      className="absolute inset-0 opacity-20 pointer-events-none"
                      style={{
                        backgroundImage:
                          'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.45), transparent 60%), repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 2px, transparent 2px, transparent 5px)'
                      }}
                    />
                  )}

                  {num === 0 ? (
                    <span className="text-[3cqw] font-sans uppercase tracking-tighter mix-blend-multiply opacity-90 font-black">Free</span>
                  ) : (
                    <span className={cn("relative z-10", marked && called && "scale-110 drop-shadow-md")}>{num}</span>
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
    </div>
  );
}
