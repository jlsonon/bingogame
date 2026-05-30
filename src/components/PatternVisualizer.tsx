import { type BingoPattern } from '../lib/bingo';

interface Props {
  patterns: BingoPattern[];
  className?: string;
}

export function PatternVisualizer({ patterns, className = "" }: Props) {
  if (!patterns || patterns.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-4 ${className}`}>
      {patterns.map((pattern) => (
        <div key={pattern.id} className="flex flex-col items-center gap-2">
          <div className="grid grid-cols-5 gap-0.5 p-1 bg-[#3D3A35] rounded-lg shadow-sm">
            {Array.from({ length: 25 }, (_, i) => {
              // Standard patterns use cells array
              let isSelected = pattern.cells.includes(i);
              
              // Special handling for preset patterns that don't have static cells
              if (pattern.id === 'row-any') isSelected = i < 5; // Highlight first row as example
              if (pattern.id === 'col-any') isSelected = i % 5 === 0; // Highlight first column as example
              if (pattern.id === 'diag-any') isSelected = [0, 6, 12, 18, 24].includes(i); // Highlight one diagonal
              if (pattern.match === 'dikit') isSelected = [0, 1].includes(i); // Highlight top-left 2 as example (away from FREE)
              
              const isFree = i === 12;

              return (
                <div
                  key={i}
                  className={`w-3 h-3 sm:w-4 sm:h-4 rounded-[2px] ${
                    isSelected 
                      ? 'bg-[#FACC15]' 
                      : isFree 
                        ? 'bg-[#7A746B]' 
                        : 'bg-[#FAF7F2]/20'
                  }`}
                />
              );
            })}
          </div>
          <span className="text-[10px] font-black uppercase tracking-tighter text-[#7A746B] text-center max-w-[60px] leading-tight">
            {pattern.name}
          </span>
        </div>
      ))}
    </div>
  );
}
