// Connect Four adapter — TypeScript port of ../four-in-a-row/four_in_a_row.py
// Difficulty: 1/5.
import type { CellView, Difficulty, GameController, GameView, Opponent } from '../types.ts';

const COLS = 7;
const ROWS = 6;

class Connect4 {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  turn = 1;
  winner: number | null = null;
  line: Array<[number, number]> = [];

  legal(): number[] {
    return this.winner !== null ? [] : Array.from({ length: COLS }, (_, c) => c)
      .filter((c) => this.board[ROWS - 1][c] === 0);
  }

  drop(col: number): void {
    const row = this.board.findIndex((r) => r[col] === 0);
    this.board[row][col] = this.turn;
    this.checkWin(row, col);
    this.turn = this.turn === 1 ? 2 : 1;
  }

  checkWin(row: number, col: number): void {
    const p = this.board[row][col];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
      const cells: Array<[number, number]> = [[row, col]];
      for (const sign of [-1, 1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.board[r][c] === p) {
          cells.push([r, c]);
          r += dr * sign; c += dc * sign;
        }
      }
      if (cells.length >= 4) {
        this.winner = p;
        this.line = cells.slice(0, 4);
        return;
      }
    }
    if (this.legal().length === 0) this.winner = 0; // draw when board is full
  }

  /** negamax with alpha-beta; score from the mover's perspective */
  search(depth: number, alpha: number, beta: number): number {
    if (this.winner !== null) {
      if (this.winner === 0) return 0; // draw
      // the previous mover won: the side to move has lost
      return this.winner === this.turn ? 1000 + depth : -(1000 + depth);
    }
    if (depth === 0) return this.heuristic();
    let best = -1e9;
    for (const col of this.legal()) {
      const snap = this.snapshot();
      this.drop(col); // drop() flips the turn to the responder
      const score = -this.search(depth - 1, -beta, -alpha);
      this.restore(snap);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  heuristic(): number {
    // count open threes for the mover minus the opponent's
    let score = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = this.board[r][c];
          if (p === 0) continue;
          let run = 0, rr = r, cc = c;
          while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && this.board[rr][cc] === p) {
            run++; rr += dr; cc += dc;
          }
          if (run === 3) score += p === this.turn ? 5 : -5;
        }
      }
    }
    return score;
  }

  snapshot(): { board: number[][]; turn: number; winner: number | null; line: Array<[number, number]> } {
    return { board: this.board.map((r) => [...r]), turn: this.turn, winner: this.winner, line: [...this.line] };
  }

  restore(s: ReturnType<Connect4['snapshot']>): void {
    this.board = s.board.map((r) => [...r]);
    this.turn = s.turn;
    this.winner = s.winner;
    this.line = [...s.line];
  }
}

export function connect4Controller(): GameController {
  const game = new Connect4(); // field initializers create the empty board
  let diff: Difficulty = 'medium';
  let opp: Opponent = 'ai';
  const depthFor = (): number => ({ easy: 1, medium: 3, hard: 5 }[diff]);

  return {
    reset(d, o) { diff = d; opp = o; game.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0)); game.turn = 1; game.winner = null; game.line = []; },
    isOpponentTurn: () => game.turn === 2 && game.winner === null,
    opponentAct() {
      const legal = game.legal();
      if (legal.length === 0) return;
      let col: number;
      if (opp === 'bot') {
        col = legal[Math.floor(Math.random() * legal.length)];
      } else {
        col = legal[0];
        let bestScore = -Infinity;
        for (const c of legal) {
          const snap = game.snapshot();
          game.drop(c); // drop() flips the turn to the responder
          const score = -game.search(depthFor() - 1, -Infinity, Infinity);
          game.restore(snap);
          if (score > bestScore) { bestScore = score; col = c; }
        }
      }
      game.drop(col);
    },
    humanClick(_r, c) {
      if (game.turn !== 1 || game.winner !== null) return;
      if (game.legal().includes(c)) game.drop(c);
    },
    actions: () => [],
    view(): GameView {
      const targets = new Set(game.turn === 1 ? game.legal() : []);
      const rows: CellView[][] = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
          const d = game.board[r][c];
          const isTarget = targets.has(c) && r === game.board.findIndex((row) => row[c] === 0);
          const inLine = game.line.some(([lr, lc]) => lr === r && lc === c);
          return {
            glyph: d === 0 ? '' : d === 1 ? 'X' : 'O',
            cls: `cell c4-${d === 0 ? 'empty' : d === 1 ? 'red' : 'yellow'}${isTarget ? ' target' : ''}${inLine ? ' winline' : ''}`,
            clickable: isTarget,
          };
        }));
      const over = game.winner !== null;
      const winner = !over ? '' : game.winner === 0 ? 'draw' : game.winner === 1 ? 'human' : 'opponent';
      const status = over
        ? (winner === 'draw' ? 'Board full — draw.' : `${winner === 'human' ? 'You win!' : 'You lose!'}`)
        : `${game.turn === 1 ? 'Your' : "Opponent's"} turn — click a column.`;
      return { rows, status, info: 'You are X (red).\nClick any cell of a column to drop a disc.\nFour in a row wins.', over, winner, cards: [], needsDigits: false };
    },
  };
}
