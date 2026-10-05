// Xiangqi adapter — TypeScript port of ../chinese-chess/xiangqi.go
// Human plays red (bottom); opponent plays black.
// Board: board[rank][file], rank 0 = black back rank (top), rank 9 = red
// back rank. Uppercase = red, lowercase = black. K general, A advisor,
// E elephant, H horse, R chariot, C cannon, P soldier.
import type { CellView, Difficulty, GameController, GameView, Opponent } from '../types.ts';

const RANKS = 10;
const FILES = 9;

interface Move { fr: number; ff: number; tr: number; tf: number }

const isRed = (p: string): boolean => p >= 'A' && p <= 'Z';
const colorOf = (p: string): 'r' | 'b' => (isRed(p) ? 'r' : 'b');
const upper = (p: string): string => p.toUpperCase();

const CHARS: Record<string, string> = {
  K: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', P: '兵',
  k: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', p: '卒',
};

export class Xiangqi {
  board: string[][] = Array.from({ length: RANKS }, () => Array(FILES).fill(''));
  turn: 'r' | 'b' = 'r';

  reset(): void {
    const back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
    this.board = Array.from({ length: RANKS }, () => Array(FILES).fill(''));
    for (let f = 0; f < FILES; f++) {
      this.board[9][f] = back[f];
      this.board[0][f] = back[f].toLowerCase();
    }
    this.board[7][1] = 'C'; this.board[7][7] = 'C';
    this.board[2][1] = 'c'; this.board[2][7] = 'c';
    for (const f of [0, 2, 4, 6, 8]) {
      this.board[6][f] = 'P';
      this.board[3][f] = 'p';
    }
    this.turn = 'r';
  }

  at(r: number, f: number): string {
    if (r < 0 || r > 9 || f < 0 || f > 8) return '';
    return this.board[r][f];
  }

  inPalace(r: number, f: number, c: 'r' | 'b'): boolean {
    if (f < 3 || f > 5) return false;
    return c === 'r' ? r >= 7 : r <= 2;
  }

  ownSide(r: number, c: 'r' | 'b'): boolean { return c === 'r' ? r >= 5 : r <= 4; }

  /** all pseudo-legal moves for color c (may leave own general in check) */
  pseudo(c: 'r' | 'b'): Move[] {
    const moves: Move[] = [];
    const push = (fr: number, ff: number, tr: number, tf: number): void => {
      if (tr < 0 || tr > 9 || tf < 0 || tf > 8) return; // off board
      const t = this.board[tr][tf];
      if (!t || colorOf(t) !== c) moves.push({ fr, ff, tr, tf });
    };
    const slide = (r: number, f: number, dr: number, df: number, cannon: boolean): void => {
      let tr = r + dr, tf = f + df;
      while (tr >= 0 && tr <= 9 && tf >= 0 && tf <= 8) {
        const t = this.board[tr][tf];
        if (!t) {
          push(r, f, tr, tf);
        } else {
          if (cannon) {
            // capture by jumping exactly one screen
            let sr = tr + dr, sf = tf + df;
            while (sr >= 0 && sr <= 9 && sf >= 0 && sf <= 8) {
              const p2 = this.board[sr][sf];
              if (p2) {
                if (colorOf(p2) !== c) push(r, f, sr, sf);
                break;
              }
              sr += dr; sf += df;
            }
          } else if (colorOf(t) !== c) {
            push(r, f, tr, tf);
          }
          return;
        }
        tr += dr; tf += df;
      }
    };
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const p = this.board[r][f];
        if (!p || colorOf(p) !== c) continue;
        switch (upper(p)) {
          case 'K':
            for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const tr = r + dr, tf = f + df;
              if (this.inPalace(tr, tf, c)) push(r, f, tr, tf);
            }
            break;
          case 'A':
            for (const [dr, df] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
              const tr = r + dr, tf = f + df;
              if (this.inPalace(tr, tf, c)) push(r, f, tr, tf);
            }
            break;
          case 'E':
            for (const [dr, df] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
              const tr = r + dr, tf = f + df;
              if (tr < 0 || tr > 9 || tf < 0 || tf > 8) continue;
              if (!this.ownSide(tr, c)) continue; // never crosses the river
              if (this.at(r + dr / 2, f + df / 2)) continue; // blocked eye
              push(r, f, tr, tf);
            }
            break;
          case 'H':
            for (const [dr, df] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
              const tr = r + dr, tf = f + df;
              if (tr < 0 || tr > 9 || tf < 0 || tf > 8) continue;
              // hobbling leg: adjacent square in the 2-step direction
              const lr = dr === 2 || dr === -2 ? r + dr / 2 : r;
              const lf = dr === 2 || dr === -2 ? f : f + df / 2;
              if (this.at(lr, lf)) continue;
              push(r, f, tr, tf);
            }
            break;
          case 'R':
            for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) slide(r, f, dr, df, false);
            break;
          case 'C':
            for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) slide(r, f, dr, df, true);
            break;
          case 'P': {
            const fwd = c === 'r' ? -1 : 1;
            push(r, f, r + fwd, f);
            if (!this.ownSide(r, c)) { // crossed the river: sideways
              push(r, f, r, f - 1);
              push(r, f, r, f + 1);
            }
            break;
          }
        }
      }
    }
    return moves;
  }

  generalPos(c: 'r' | 'b'): [number, number] {
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const p = this.board[r][f];
        if (p && upper(p) === 'K' && colorOf(p) === c) return [r, f];
      }
    }
    return [-1, -1];
  }

  /** is the general at (gr,gf) of color c attacked? */
  inCheckFrom(c: 'r' | 'b', gr: number, gf: number): boolean {
    const opp: 'r' | 'b' = c === 'r' ? 'b' : 'r';
    for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let r = gr + dr, f = gf + df;
      let screen = false;
      while (r >= 0 && r <= 9 && f >= 0 && f <= 8) {
        const p = this.board[r][f];
        if (p) {
          const kind = upper(p);
          if (colorOf(p) === opp) {
            if (!screen && (kind === 'R' || kind === 'K')) return true;
            if (screen && kind === 'C') return true;
          }
          if (screen) break;
          screen = true;
        }
        r += dr; f += df;
      }
    }
    for (const [dr, df] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      const hr = gr + dr, hf = gf + df;
      const p = this.at(hr, hf);
      if (p && colorOf(p) === opp && upper(p) === 'H') {
        const lr = dr === 2 || dr === -2 ? hr - dr / 2 : hr;
        const lf = dr === 2 || dr === -2 ? hf : hf - df / 2;
        if (!this.at(lr, lf)) return true;
      }
    }
    const adv = opp === 'b' ? 1 : -1;
    const pf = this.at(gr - adv, gf);
    if (pf && colorOf(pf) === opp && upper(pf) === 'P') return true;
    if (!this.ownSide(gr, opp)) {
      for (const df of [-1, 1]) {
        const ps = this.at(gr, gf + df);
        if (ps && colorOf(ps) === opp && upper(ps) === 'P') return true;
      }
    }
    return false;
  }

  legal(): Move[] {
    const c = this.turn;
    const [gr, gf] = this.generalPos(c);
    const out: Move[] = [];
    for (const m of this.pseudo(c)) {
      const piece = this.board[m.fr][m.ff];
      const ngr = upper(piece) === 'K' ? m.tr : gr;
      const ngf = upper(piece) === 'K' ? m.tf : gf;
      const undo = this.make(m);
      if (!this.inCheckFrom(c, ngr, ngf)) out.push(m);
      this.unmake(m, undo);
    }
    return out;
  }

  make(m: Move): { captured: string } {
    const p = this.board[m.fr][m.ff];
    const captured = this.board[m.tr][m.tf];
    this.board[m.tr][m.tf] = p;
    this.board[m.fr][m.ff] = '';
    this.turn = isRed(p) ? 'b' : 'r';
    return { captured };
  }

  unmake(m: Move, undo: { captured: string }): void {
    const p = this.board[m.tr][m.tf];
    this.board[m.fr][m.ff] = p;
    this.board[m.tr][m.tf] = undo.captured;
    this.turn = isRed(p) ? 'r' : 'b';
  }

  values(): Record<string, number> {
    return { K: 0, A: 120, E: 120, H: 270, R: 600, C: 285, P: 30 };
  }

  evaluate(): number {
    // positive = good for red
    let score = 0;
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const p = this.board[r][f];
        if (!p) continue;
        let v = this.values()[upper(p)];
        if (upper(p) === 'P' && !this.ownSide(r, colorOf(p))) v = 60;
        v -= (2 * (Math.abs(r - 4) + Math.abs(f - 4))) / 3 | 0;
        score += isRed(p) ? v : -v;
      }
    }
    return score;
  }

  negamax(depth: number, alpha: number, beta: number): number {
    const moves = this.legal();
    if (moves.length === 0) return -(100000 + depth); // mate or stalemate = loss
    if (depth === 0) return this.turn === 'r' ? this.evaluate() : -this.evaluate();
    let best = -Infinity;
    for (const m of moves) {
      const u = this.make(m);
      const score = -this.negamax(depth - 1, -beta, -alpha);
      this.unmake(m, u);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  status(): { over: boolean; winner: 'r' | 'b' | ''; inCheck: boolean; checkmate: boolean } {
    const moves = this.legal();
    const [gr, gf] = this.generalPos(this.turn);
    const inCheck = this.inCheckFrom(this.turn, gr, gf);
    if (moves.length === 0) {
      // side to move has no move: in xiangqi stalemate is also a loss
      return { over: true, winner: this.turn === 'r' ? 'b' : 'r', inCheck, checkmate: inCheck };
    }
    return { over: false, winner: '', inCheck, checkmate: false };
  }
}

export function xiangqiController(): GameController {
  const game = new Xiangqi();
  game.reset(); // ready to render before the first reset()
  let diff: Difficulty = 'medium';
  let opp: Opponent = 'ai';
  let selected: Move | null = null;

  return {
    reset(d, o) { diff = d; opp = o; selected = null; game.reset(); },
    isOpponentTurn: () => game.turn === 'b' && !game.status().over,
    opponentAct() {
      const legal = game.legal();
      if (legal.length === 0) return;
      let m: Move;
      if (opp === 'bot') {
        m = legal[Math.floor(Math.random() * legal.length)];
      } else {
        const depth = { easy: 1, medium: 2, hard: 3 }[diff];
        let best = -Infinity;
        m = legal[0];
        for (const cand of legal) {
          const u = game.make(cand);
          const score = -game.negamax(depth - 1, -Infinity, Infinity);
          game.unmake(cand, u);
          if (score > best) { best = score; m = cand; }
        }
      }
      game.make(m);
    },
    humanClick(r, c) {
      if (game.turn !== 'r' || game.status().over) return;
      const legal = game.legal();
      const move = legal.find((m) => m.fr === selected?.fr && m.ff === selected?.ff && m.tr === r && m.tf === c);
      if (move) {
        game.make(move);
        selected = null;
        return;
      }
      const p = game.board[r][c];
      selected = p && colorOf(p) === 'r' ? { fr: r, ff: c, tr: 0, tf: 0 } : null;
    },
    actions: () => [],
    view(): GameView {
      const st = game.status();
      const legal = st.over ? [] : game.legal();
      const targets = new Set(legal
        .filter((m) => selected && m.fr === selected.fr && m.ff === selected.ff)
        .map((m) => m.tr * FILES + m.tf));
      const movable = new Set(legal.filter((m) => game.turn === 'r').map((m) => m.fr * FILES + m.ff));
      const rows: CellView[][] = [];
      for (let r = 0; r < RANKS; r++) {
        const row: CellView[] = [];
        for (let f = 0; f < FILES; f++) {
          const p = game.board[r][f];
          const isRiver = r === 4 || r === 5;
          let cls = `cell xq-${isRiver ? 'river' : (r + f) % 2 === 0 ? 'light' : 'dark'}`;
          if (p) cls += ` xq-piece-${isRed(p) ? 'red' : 'black'}`;
          if (selected && selected.fr === r && selected.ff === f) cls += ' selected';
          if (targets.has(r * FILES + f)) cls += ' target';
          if (game.turn === 'r' && movable.has(r * FILES + f)) cls += ' movable';
          row.push({
            glyph: p ? CHARS[p] : '',
            cls,
            clickable: targets.has(r * FILES + f) || (game.turn === 'r' && movable.has(r * FILES + f)),
          });
        }
        rows.push(row);
      }
      const status = st.over
        ? `${st.winner === 'r' ? 'You win' : 'You lose'}! (${st.checkmate ? 'checkmate' : 'stalemate — a loss in xiangqi'})`
        : st.inCheck ? 'You are in check!'
        : game.turn === 'r' ? 'Your turn (red) — click a piece, then a target.' : 'Opponent thinking...';
      return {
        rows, status, over: st.over,
        winner: st.over ? (st.winner === 'r' ? 'human' : 'opponent') : '',
        cards: [], needsDigits: false,
        info: 'You play red (bottom).\nChars: 帥 general, 仕 advisor, 相 elephant,\n傌 horse, 俥 chariot, 炮 cannon, 兵 soldier.\nStalemate loses, as in xiangqi.',
      };
    },
  };
}
