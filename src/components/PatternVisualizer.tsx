import { type BingoPattern } from '../lib/bingo';

interface Props {
  patterns: BingoPattern[];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function PatternVisualizer({ patterns, size = 'sm', className = "" }: Props) {
  if (!patterns || patterns.length === 0) return null;

  const isMany = patterns.length > 6;

  // Responsive, layout-native sizing (no CSS scale() overflow!)
  const cellClasses = {
    xs: 'w-2 h-2 rounded-[1.5px]',
    sm: isMany ? 'w-2.5 h-2.5 rounded-[2px]' : 'w-3 h-3 rounded-[2px]',
    md: isMany ? 'w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[2px]' : 'w-4 h-4 sm:w-5 sm:h-5 rounded-[3px]',
    lg: isMany ? 'w-4 h-4 sm:w-5 sm:h-5 rounded-[3px]' : 'w-5 h-5 sm:w-6 sm:h-6 rounded-[4px]',
  }[size];

  const gridGap = {
    xs: 'gap-[1.5px] p-1 rounded-md',
    sm: 'gap-[2px] p-1.5 rounded-lg',
    md: 'gap-[2.5px] p-1.5 sm:p-2 rounded-xl',
    lg: 'gap-1 p-2 sm:p-2.5 rounded-2xl',
  }[size];

  const cardClasses = {
    xs: 'p-1.5 rounded-xl gap-1',
    sm: 'p-2 rounded-xl gap-1.5 bg-[#FAF7F2] border border-[#E8E2D9]',
    md: 'p-2.5 sm:p-3 rounded-2xl gap-2 bg-[#FAF7F2] border-2 border-[#E8E2D9] shadow-sm',
    lg: 'p-3 sm:p-4 rounded-2xl gap-2.5 bg-[#FAF7F2] border-2 border-[#E8E2D9] shadow-md',
  }[size];

  const labelClasses = {
    xs: 'text-[8px] max-w-[60px]',
    sm: 'text-[9px] max-w-[76px]',
    md: 'text-[10px] sm:text-xs max-w-[108px]',
    lg: 'text-xs sm:text-sm max-w-[140px]',
  }[size];

  const containerGap = {
    xs: 'gap-1.5',
    sm: 'gap-2',
    md: 'gap-2.5 sm:gap-3',
    lg: 'gap-3 sm:gap-4',
  }[size];

  return (
    <div className={`flex flex-wrap items-stretch justify-center ${containerGap} ${className}`}>
      {patterns.map((pattern) => (
        <div
          key={pattern.id}
          className={`flex flex-col items-center justify-start ${cardClasses}`}
        >
          <div className={`grid grid-cols-5 ${gridGap} bg-[#3D3A35] shadow-sm shrink-0`}>
            {Array.from({ length: 25 }, (_, i) => {
              let isSelected = Array.isArray(pattern.cells) && pattern.cells.includes(i);

              // Special handling for preset patterns that don't have static cells
              if (pattern.id === 'row-any') isSelected = i < 5;
              if (pattern.id === 'col-any') isSelected = i % 5 === 0;
              if (pattern.id === 'diag-any') isSelected = [0, 6, 12, 18, 24].includes(i);
              if (pattern.match === 'dikit') isSelected = [0, 1].includes(i);

              const isFree = i === 12;

              return (
                <div
                  key={i}
                  className={`${cellClasses} ${
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
          <span
            className={`${labelClasses} font-black uppercase tracking-tight text-[#3D3A35] text-center leading-tight break-words`}
          >
            {pattern.name}
          </span>
        </div>
      ))}
    </div>
  );
}
