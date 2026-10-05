// Reversi adapter — TypeScript port of ../reversi/Reversi.java
import type { CellView, Difficulty, GameController, GameView, Opponent } from '../types.ts';

const SIZE = 8;
const BLACK = 1; // human
const WHITE = 2; // opponent

const WEIGHTS = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

interface Move { row: number; col: number; flips: Array<[number, number]> }

class Reversi {
  board: number[][] = [];
  turn = BLACK;
  over = false;

  reset(): void {
    this.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    this.board[3][3] = WHITE; this.board[4][4] = WHITE;
    this.board[3][4] = BLACK; this.board[4][3] = BLACK;
    this.turn = BLACK;
    this.over = false;
  }

  opponent(p: number): number { return p === BLACK ? WHITE : BLACK; }

  flipsFor(r: number, c: number, player: number): Array<[number, number]> | null {
    if (this.board[r][c] !== 0) return null;
    const all: Array<[number, number]> = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const line: Array<[number, number]> = [];
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE
          && this.board[rr][cc] === this.opponent(player)) {
          line.push([rr, cc]);
          rr += dr; cc += dc;
        }
        if (line.length > 0 && rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE
          && this.board[rr][cc] === player) {
          all.push(...line);
        }
      }
    }
    return all.length === 0 ? null : all;
  }

  legal(player: number): Move[] {
    const moves: Move[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const flips = this.flipsFor(r, c, player);
        if (flips) moves.push({ row: r, col: c, flips });
      }
    }
    return moves;
  }

  apply(m: Move): void {
    this.board[m.row][m.col] = this.turn;
    for (const [r, c] of m.flips) this.board[r][c] = this.turn;
    this.turn = this.opponent(this.turn);
    // pass / end detection
    if (this.legal(this.turn).length === 0) {
      if (this.legal(this.opponent(this.turn)).length === 0) this.over = true;
      else this.turn = this.opponent(this.turn);
    }
  }

  scores(): [number, number] {
    let b = 0, w = 0;
    for (const row of this.board) for (const d of row) {
      if (d === BLACK) b++; else if (d === WHITE) w++;
    }
    return [b, w];
  }

  evaluate(player: number): number {
    let s = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.board[r][c] === player) s += WEIGHTS[r][c];
        else if (this.board[r][c] === this.opponent(player)) s -= WEIGHTS[r][c];
      }
    }
    return s + 2 * (this.legal(player).length - this.legal(this.opponent(player)).length);
  }

  negamax(depth: number, alpha: number, beta: number, player: number): number {
    const moves = this.legal(player);
    if (moves.length === 0) {
      if (this.legal(this.opponent(player)).length === 0) {
        const [b, w] = this.scores();
        const me = player === BLACK ? b : w, them = player === BLACK ? w : b;
        return me > them ? 100000 + me - them : me < them ? -100000 - (them - me) : 0;
      }
      return -this.negamax(depth, -beta, -alpha, this.opponent(player)); // pass
    }
    if (depth === 0) return this.evaluate(player);
    let best = -Infinity;
    for (const m of moves) {
      const snap = this.snapshot();
      // apply for `player`
      this.board[m.row][m.col] = player;
      for (const [r, c] of m.flips) this.board[r][c] = player;
      const score = -this.negamax(depth - 1, -beta, -alpha, this.opponent(player));
      this.restore(snap);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  snapshot(): { board: number[][]; turn: number; over: boolean } {
    return { board: this.board.map((r) => [...r]), turn: this.turn, over: this.over };
  }

  restore(s: ReturnType<Reversi['snapshot']>): void {
    this.board = s.board.map((r) => [...r]);
    this.turn = s.turn;
    this.over = s.over;
  }
}

export function reversiController(): GameController {
  const game = new Reversi();
  game.reset(); // ready to render before the first reset()
  let diff: Difficulty = 'medium';
  let opp: Opponent = 'ai';

  return {
    reset(d, o) { diff = d; opp = o; game.reset(); },
    isOpponentTurn: () => game.turn === WHITE && !game.over,
    opponentAct() {
      const moves = game.legal(WHITE);
      if (moves.length === 0) { game.over = true; return; }
      let m = moves[0];
      if (opp === 'bot') {
        m = moves[Math.floor(Math.random() * moves.length)];
      } else {
        const depth = { easy: 1, medium: 3, hard: 5 }[diff];
        let best = -Infinity;
        for (const cand of moves) {
          const snap = game.snapshot();
          game.board[cand.row][cand.col] = WHITE;
          for (const [r, c] of cand.flips) game.board[r][c] = WHITE;
          const score = -game.negamax(depth - 1, -Infinity, Infinity, BLACK);
          game.restore(snap);
          if (score > best) { best = score; m = cand; }
        }
      }
      game.apply(m);
    },
    humanClick(r, c) {
      if (game.over || game.turn !== BLACK) return;
      const m = game.legal(BLACK).find((mv) => mv.row === r && mv.col === c);
      if (m) game.apply(m);
    },
    actions: () => [],
    view(): GameView {
      const targets = !game.over && game.turn === BLACK
        ? new Set(game.legal(BLACK).map((m) => m.row * SIZE + m.col)) : new Set<number>();
      const rows: CellView[][] = game.board.map((row, r) =>
        row.map((d, c) => ({
          glyph: d === 0 ? '' : d === BLACK ? 'B' : 'W',
          cls: `cell oth-${d === 0 ? 'empty' : d === BLACK ? 'black' : 'white'}${targets.has(r * SIZE + c) ? ' target' : ''}`,
          clickable: targets.has(r * SIZE + c),
        })));
      const [b, w] = game.scores();
      const over = game.over;
      const winner = !over ? '' : b > w ? 'human' : w > b ? 'opponent' : 'draw';
      const status = over
        ? `${winner === 'draw' ? 'Draw.' : winner === 'human' ? 'You win!' : 'You lose!'} (black ${b} — white ${w})`
        : game.turn === BLACK
          ? 'Your turn (black) — click a highlighted square.'
          : 'Opponent thinking...';
      return {
        rows, status, over, winner, cards: [], needsDigits: false,
        info: `You are black (B).\nBlack ${b} — white ${w}.\nFlank the opponent's line to flip it.`,
      };
    },
  };
}
