// Sudoku adapter — TypeScript port of ../sudoku/sudoku.c
// "Playing against the AI" here means: the generator (bot) plants a puzzle
// at the chosen difficulty, the AI gives hints, checks, or solves on demand.
import type { CellView, Difficulty, GameController, GameView, Opponent } from '../types.ts';

const N = 9;

function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
}

function canPlace(g: number[][], r: number, c: number, d: number): boolean {
  for (let i = 0; i < N; i++) {
    if (g[r][i] === d) return false;
    if (g[i][c] === d) return false;
    if (g[(r / 3 | 0) * 3 + (i / 3 | 0)][(c / 3 | 0) * 3 + i % 3] === d) return false;
  }
  return true;
}

/** count solutions up to limit; copy the first solution into out */
function solveRec(g: number[][], out: number[][] | null, limit: number): number {
  let bestR = -1, bestC = -1, bestCount = N + 1;
  let found = false;
  for (let r = 0; r < N && !found; r++) {
    for (let c = 0; c < N; c++) {
      if (g[r][c] !== 0) continue;
      let count = 0;
      for (let d = 1; d <= N; d++) if (canPlace(g, r, c, d)) count++;
      if (count === 0) return 0;
      if (count < bestCount) {
        bestCount = count; bestR = r; bestC = c;
        if (count === 1) { found = true; break; }
      }
    }
  }
  if (bestR === -1) {
    if (out) for (let r = 0; r < N; r++) out[r] = [...g[r]];
    return 1;
  }
  let total = 0;
  for (let d = 1; d <= N && total < limit; d++) {
    if (!canPlace(g, bestR, bestC, d)) continue;
    g[bestR][bestC] = d;
    total += solveRec(g, out, limit - total);
    g[bestR][bestC] = 0;
  }
  return total;
}

function generate(clues: number, seed: number): { puzzle: number[][]; solution: number[][] } {
  const rnd = xorshift(seed);
  const seeded = Array.from({ length: N }, () => Array(N).fill(0));
  for (let k = 0; k < 11; k++) {
    const r = rnd() % N, c = rnd() % N, d = 1 + (rnd() % N);
    if (seeded[r][c] === 0 && canPlace(seeded, r, c, d)) seeded[r][c] = d;
  }
  // solveRec backtracks in place, so the finished grid is captured via `out`
  const full: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  solveRec(seeded, full, 1);
  const solution = full.map((r) => [...r]);
  const puzzle = solution.map((r) => [...r]);
  // dig holes in a shuffled order, keeping the solution unique
  const order = Array.from({ length: N * N }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let remaining = N * N;
  for (const idx of order) {
    if (remaining <= clues) break;
    const r = (idx / N) | 0, c = idx % N;
    const saved = puzzle[r][c];
    puzzle[r][c] = 0;
    const copy = puzzle.map((row) => [...row]);
    if (solveRec(copy, null, 2) !== 1) puzzle[r][c] = saved;
    else remaining--;
  }
  return { puzzle, solution };
}

export function sudokuController(): GameController {
  let puzzle: number[][] = [];
  let solution: number[][] = [];
  let work: number[][] = [];
  let given: boolean[][] = [];
  let sel: [number, number] | null = null;
  let diff: Difficulty = 'medium';
  let opp: Opponent = 'ai'; // 'bot' just picks a different puzzle seed flavor
  let lastAction = '';

  const cluesFor = (): number => ({ easy: 40, medium: 32, hard: 26 }[diff]);

  return {
    reset(d, o) {
      diff = d; opp = o;
      const seed = 1 + Math.floor(Math.random() * 1e9);
      ({ puzzle, solution } = generate(cluesFor(), seed));
      work = puzzle.map((r) => [...r]);
      given = puzzle.map((r) => r.map((v) => v !== 0));
      sel = null;
      lastAction = 'New puzzle generated.';
    },
    humanClick(r, c) {
      if (given[r][c]) { lastAction = 'That is a fixed clue.'; return; }
      sel = [r, c];
    },
    humanDigit(n) {
      if (!sel) { lastAction = 'Select a cell first.'; return; }
      const [r, c] = sel;
      if (given[r][c]) return;
      if (n === 0) { work[r][c] = 0; lastAction = `Cleared (${r + 1},${c + 1}).`; return; }
      if (!canPlace(work, r, c, n)) { lastAction = `${n} conflicts there.`; return; }
      work[r][c] = n;
      lastAction = `Set (${r + 1},${c + 1}) = ${n}.`;
      if (work.every((row, ri) => row.every((v, ci) => v === solution[ri][ci]))) {
        lastAction = 'Solved — well played!';
      }
    },
    actions: () => [
      { label: 'Hint', run: () => {
        let best: [number, number] | null = null, bestCount = N + 1;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (work[r][c] !== 0) continue;
          let count = 0;
          for (let d = 1; d <= N; d++) if (canPlace(work, r, c, d)) count++;
          if (count > 0 && count < bestCount) { bestCount = count; best = [r, c]; }
        }
        if (!best) { lastAction = 'No hint available — check for conflicts.'; return; }
        work[best[0]][best[1]] = solution[best[0]][best[1]];
        lastAction = `AI hint: (${best[0] + 1},${best[1] + 1}) = ${work[best[0]][best[1]]}.`;
      } },
      { label: 'Check', run: () => {
        let wrong = 0;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (!given[r][c] && work[r][c] !== 0 && work[r][c] !== solution[r][c]) wrong++;
        }
        lastAction = wrong === 0
          ? 'All your entries are correct so far.'
          : `${wrong} of your entries differ from the solution.`;
      } },
      { label: 'Solve', run: () => {
        work = solution.map((r) => [...r]);
        lastAction = 'AI solved the puzzle.';
      } },
    ],
    isOpponentTurn: () => false,
    opponentAct: () => {},
    view(): GameView {
      const rows: CellView[][] = work.map((row, r) =>
        row.map((v, c) => {
          let cls = `cell sud-${((r / 3 | 0) + (c / 3 | 0)) % 2 === 0 ? 'light' : 'dark'}`;
          if (given[r][c]) cls += ' sud-given';
          if (sel && sel[0] === r && sel[1] === c) cls += ' selected';
          return {
            glyph: v === 0 ? '' : String(v),
            cls,
            clickable: !given[r][c],
          };
        }));
      const solved = work.every((row, r) => row.every((v, c) => v === solution[r][c]));
      return {
        rows,
        status: solved ? 'Solved — well played!' : lastAction || 'Click a cell, then a digit.',
        info: `Difficulty: ${diff} (${cluesFor()} clues).\nSelect a cell, then press 1-9 (0 clears).\nButtons: Hint (AI fills one cell), Check, Solve.`,
        cards: [],
        over: solved,
        winner: solved ? 'human' : '',
        needsDigits: true,
      };
    },
  };
}
