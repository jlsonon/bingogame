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

export function checkDikitSidequest(card: number[][], marked: number[]): boolean {
  const isMarkedNumber = (index: number) => {
    const r = Math.floor(index / 5);
    const c = index % 5;
    const val = card[r]?.[c];
    // EXCLUDE index 12 (Free Space) and value 0
    if (index === 12 || val === 0) return false;
    return marked.includes(val);
  };

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      // Both cells in the horizontal pair must be real marked numbers (not Free space)
      if (isMarkedNumber(r * 5 + c) && isMarkedNumber(r * 5 + c + 1)) {
        return true;
      }
    }
  }
  return false;
}

export function checkValidWin(
  card: number[][],
  marked: number[],
  called: number[],
  mode: GameMode | string,
  patterns: BingoPattern[] = DEFAULT_BINGO_PATTERNS
): { valid: boolean, pattern: string, cellsAway: number } {
  const falseClaims = marked.filter(m => m !== 0 && !called.includes(m));
  if (falseClaims.length > 0) return { valid: false, pattern: '', cellsAway: 99 };

  const isMarkedIndex = (index: number) => {
    const r = Math.floor(index / 5);
    const c = index % 5;
    const val = card[r]?.[c];
    return val === 0 || marked.includes(val);
  };

  const getDikitAway = () => {
    let maxAdj = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) {
        let count = 0;
        if (isMarkedIndex(r * 5 + c)) count++;
        if (isMarkedIndex(r * 5 + c + 1)) count++;
        maxAdj = Math.max(maxAdj, count);
      }
    }
    return 2 - maxAdj;
  };

  if (mode === 'Dikit') {
    const away = getDikitAway();
    return { valid: away === 0, pattern: away === 0 ? 'Dikit' : '', cellsAway: away };
  }

  if (mode === 'Blackout') {
    const markedCount = Array.from({ length: 25 }, (_, i) => i).filter(isMarkedIndex).length;
    const away = 25 - markedCount;
    return { valid: away === 0, pattern: away === 0 ? 'Blackout' : '', cellsAway: away };
  }

  let minAway = 99;
  let bestPattern = '';

  for (const pattern of patterns.length ? patterns : DEFAULT_BINGO_PATTERNS) {
    if (pattern.match === 'dikit') {
      const away = getDikitAway();
      if (away === 0) return { valid: true, pattern: pattern.name, cellsAway: 0 };
      minAway = Math.min(minAway, away);
      continue;
    }

    const sets = patternCellsFor(pattern);
    for (const cells of sets) {
       if (cells.length === 0) continue;
       const missing = cells.filter(idx => !isMarkedIndex(idx)).length;
       if (missing === 0) return { valid: true, pattern: pattern.name, cellsAway: 0 };
       if (missing < minAway) {
          minAway = missing;
          bestPattern = pattern.name;
       }
    }
  }

  return { valid: false, pattern: bestPattern, cellsAway: minAway };
}
