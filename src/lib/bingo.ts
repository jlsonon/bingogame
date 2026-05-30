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
    const col: number[] = [];
    while (col.length < 5) {
      const num = Math.floor(Math.random() * (columns[c].max - columns[c].min + 1)) + columns[c].min;
      if (!col.includes(num)) {
        col.push(num);
      }
    }
    card.push(col);
  }

  // Transpose to get row-based 2D array: [row][col]
  const rows: number[][] = [];
  for (let r = 0; r < 5; r++) {
    rows[r] = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) {
        rows[r][c] = 0; // FREE SPACE
      } else {
        rows[r][c] = card[c][r];
      }
    }
  }

  return rows;
}

export function checkValidWin(card: number[][], marked: number[], called: number[], mode: string): { valid: boolean, pattern: string } {
  // First, verify all marked numbers are indeed called (or FREE)
  const falseClaims = marked.filter(m => m !== 0 && !called.includes(m));
  if (falseClaims.length > 0) return { valid: false, pattern: '' };

  const isMarked = (r: number, c: number) => {
    const val = card[r][c];
    return val === 0 || marked.includes(val);
  };

  if (mode === 'Dikit') {
     for(let r=0; r<5; r++) {
       for(let c=0; c<4; c++) {
          if (isMarked(r, c) && isMarked(r, c+1)) {
             return { valid: true, pattern: 'Dikit' };
          }
       }
     }
     return { valid: false, pattern: '' };
  }

  if (mode === 'Blackout') {
    let all = true;
    for(let r=0;r<5;r++) {
      for(let c=0;c<5;c++) {
        if (!isMarked(r, c)) all = false;
      }
    }
    return { valid: all, pattern: 'Blackout' };
  }

  // Check rows
  for(let r=0; r<5; r++) {
    if(isMarked(r,0) && isMarked(r,1) && isMarked(r,2) && isMarked(r,3) && isMarked(r,4)) {
      return { valid: true, pattern: 'Horizontal' };
    }
  }
  // Check cols
  for(let c=0; c<5; c++) {
    if(isMarked(0,c) && isMarked(1,c) && isMarked(2,c) && isMarked(3,c) && isMarked(4,c)) {
      return { valid: true, pattern: 'Vertical' };
    }
  }
  // Check diagonals
  if(isMarked(0,0) && isMarked(1,1) && isMarked(2,2) && isMarked(3,3) && isMarked(4,4)) {
    return { valid: true, pattern: 'Diagonal Desktop' };
  }
  if(isMarked(0,4) && isMarked(1,3) && isMarked(2,2) && isMarked(3,1) && isMarked(4,0)) {
    return { valid: true, pattern: 'Diagonal Mobile' };
  }

  // Check corners
  if(isMarked(0,0) && isMarked(0,4) && isMarked(4,0) && isMarked(4,4)) {
      // Four corners alone is a common pattern, but we'll include it if modes specify. Let's make it standard.
      return { valid: true, pattern: 'Four Corners' };
  }
  return { valid: false, pattern: '' };
}
