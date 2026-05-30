export type GameMode = 'Bingo' | 'Dikit' | 'Blackout';

export interface BingoPattern {
  id: string;
  name: string;
  cells: number[];
  type: 'preset' | 'custom';
  match: 'cells' | 'dikit';
}

const row = (r: number) => Array.from({ length: 5 }, (_, c) => r * 5 + c);
const col = (c: number) => Array.from({ length: 5 }, (_, r) => r * 5 + c);

export const PRESET_PATTERNS: BingoPattern[] = [
  { id: 'row-any', name: 'Any Row', type: 'preset', match: 'cells', cells: [] },
  { id: 'col-any', name: 'Any Column', type: 'preset', match: 'cells', cells: [] },
  { id: 'diag-any', name: 'Any Diagonal', type: 'preset', match: 'cells', cells: [] },
  { id: 'corners', name: 'Four Corners', type: 'preset', match: 'cells', cells: [0, 4, 20, 24] },
  { id: 'letter-x', name: 'Letter X', type: 'preset', match: 'cells', cells: [0, 4, 6, 8, 12, 16, 18, 20, 24] },
  { id: 'letter-t', name: 'Letter T', type: 'preset', match: 'cells', cells: [...row(0), 2, 7, 12, 17, 22] },
  { id: 'letter-l', name: 'Letter L', type: 'preset', match: 'cells', cells: [0, 5, 10, 15, 20, 21, 22, 23, 24] },
  { id: 'dikit', name: 'Dikit', type: 'preset', match: 'dikit', cells: [] },
];

export const DEFAULT_BINGO_PATTERNS = PRESET_PATTERNS.filter(pattern =>
  ['row-any', 'col-any', 'diag-any', 'corners'].includes(pattern.id)
);

export function getBallLetter(num: number) {
  if (num <= 15) return 'B';
  if (num <= 30) return 'I';
  if (num <= 45) return 'N';
  if (num <= 60) return 'G';
  return 'O';
}

// Generate a random bingo card (5x5, FREE in center)
export function generateRandomCard(): number[][] {
  const card: number[][] = [];
  const columns = [
    { min: 1, max: 15 },
    { min: 16, max: 30 },
    { min: 31, max: 45 },
    { min: 46, max: 60 },
    { min: 61, max: 75 }
  ];

  for (let c = 0; c < 5; c++) {
    const colNumbers: number[] = [];
    while (colNumbers.length < 5) {
      const num = Math.floor(Math.random() * (columns[c].max - columns[c].min + 1)) + columns[c].min;
      if (!colNumbers.includes(num)) {
        colNumbers.push(num);
      }
    }
    card.push(colNumbers);
  }

  const rows: number[][] = [];
  for (let r = 0; r < 5; r++) {
    rows[r] = [];
    for (let c = 0; c < 5; c++) {
      rows[r][c] = r === 2 && c === 2 ? 0 : card[c][r];
    }
  }

  return rows;
}

function patternCellsFor(pattern: BingoPattern): number[][] {
  if (pattern.id === 'row-any') return Array.from({ length: 5 }, (_, r) => row(r));
  if (pattern.id === 'col-any') return Array.from({ length: 5 }, (_, c) => col(c));
  if (pattern.id === 'diag-any') return [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];
  return [pattern.cells];
}

export function checkValidWin(
  card: number[][],
  marked: number[],
  called: number[],
  mode: GameMode | string,
  patterns: BingoPattern[] = DEFAULT_BINGO_PATTERNS
): { valid: boolean, pattern: string } {
  const falseClaims = marked.filter(m => m !== 0 && !called.includes(m));
  if (falseClaims.length > 0) return { valid: false, pattern: '' };

  const isMarkedIndex = (index: number) => {
    const r = Math.floor(index / 5);
    const c = index % 5;
    const val = card[r]?.[c];
    return val === 0 || marked.includes(val);
  };

  const hasDikit = () => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) {
        if (isMarkedIndex(r * 5 + c) && isMarkedIndex(r * 5 + c + 1)) {
          return true;
        }
      }
    }
    return false;
  };

  if (mode === 'Dikit') {
    return { valid: hasDikit(), pattern: hasDikit() ? 'Dikit' : '' };
  }

  if (mode === 'Blackout') {
    const all = Array.from({ length: 25 }, (_, i) => i).every(isMarkedIndex);
    return { valid: all, pattern: all ? 'Blackout' : '' };
  }

  for (const pattern of patterns.length ? patterns : DEFAULT_BINGO_PATTERNS) {
    if (pattern.match === 'dikit') {
      if (hasDikit()) return { valid: true, pattern: pattern.name };
      continue;
    }

    const winner = patternCellsFor(pattern).some(cells =>
      cells.length > 0 && cells.every(isMarkedIndex)
    );
    if (winner) return { valid: true, pattern: pattern.name };
  }

  return { valid: false, pattern: '' };
}
