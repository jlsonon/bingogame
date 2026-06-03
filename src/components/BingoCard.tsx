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
      {/* Dikit Connections Overlay */}
      {dikitPairs.length > 0 && (
        <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%' }}>
          <defs>
            <filter id="dikitGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {dikitPairs.map((pair, idx) => {
            // Calculate center points of the cells
            // Header is ~10% height plus margin. Grid is remaining.
            // These are approximate percentages that work well with the CSS grid layout.
            const cellWidth = 100 / 5;
            const startX = `${(pair.c + 0.5) * cellWidth}%`;
            const endX = `${(pair.c + 1.5) * cellWidth}%`;
            // Grid area starts below header
            const headerHeight = 15; // approximate %
            const gridHeight = 85; // approximate %
            const y = `${headerHeight + ((pair.r + 0.5) * (gridHeight / 5))}%`;

            return (
              <motion.line
                key={idx}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.8 }}
                x1={startX} y1={y} x2={endX} y2={y}
                stroke="#FACC15"
                strokeWidth="max(6px, 2cqw)"
                strokeLinecap="round"
                filter="url(#dikitGlow)"
              />
            );
          })}
        </svg>
      )}

      <div className="grid grid-cols-5 gap-1 mb-[2cqw] text-center relative z-20">
        {BINGO_HEADERS.map((letter, i) => (
          <div key={i} className="font-display text-[7cqw] text-[#EA580C] drop-shadow-sm leading-none pt-1">
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-[1.5cqw] flex-1 min-h-0 relative z-20">
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
                  "aspect-square flex items-center justify-center rounded-[3cqw] font-display cursor-pointer transition-all duration-200 relative overflow-hidden text-[7cqw]",
                  num === 0 ? "bg-[#FACC15] border-[max(1px,0.5cqw)] border-white text-[#854D0E] shadow-sm uppercase tracking-tighter" :
                  marked && called ? "bg-[#0D9488] border-[max(1px,0.5cqw)] border-[#0D9488] text-white shadow-inner shadow-black/20 scale-[0.96]" :
                  marked && !called ? "bg-white border-[max(1px,0.5cqw)] border-[#EA580C] text-[#EA580C]" :
                  !marked && called ? "bg-[#0D9488]/10 border-[max(1px,0.5cqw)] border-[#0D9488]/30 text-[#3D3A35] opacity-60" :
                  "bg-[#FDFBF7] border-[max(1px,0.5cqw)] border-[#E8E2D9] text-[#3D3A35] hover:bg-orange-50",
                  readOnly && !marked && !called && "opacity-40 grayscale-[50%]"
                )}
              >
                {/* Stamped Ink Effect for Marked Numbers */}
                {marked && called && num !== 0 && (
                  <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                )}

                {num === 0 ? (
                  <span className="text-[3cqw] font-sans uppercase tracking-tighter mix-blend-multiply opacity-90 font-black">Free</span>
                ) : (
                  <span className={cn(marked && called && "scale-110 drop-shadow-md")}>{num}</span>
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
