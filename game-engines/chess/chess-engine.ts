// Chess engine — TypeScript
// Difficulty: 5/5 (full legal move gen: check, castling, en passant, promotion)
// Rules implemented: standard chess. Castling rights, en passant, auto-queen
// promotion, check/checkmate/stalemate, draw by 50-move rule and insufficient
// material. Moves use algebraic-like notation "e2e4"; promotion "e7e8q".

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Move {
  from: number;      // 0..63
  to: number;        // 0..63
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  castle?: 'K' | 'Q';
  enPassant?: boolean;
  double?: boolean;  // double pawn push
}

export interface GameStatus {
  turn: Color;
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
  draw: boolean;
  drawReason?: string;
  over: boolean;
}

export const FILES = 'abcdefgh';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Castling { wk: boolean; wq: boolean; bk: boolean; bq: boolean }

export class ChessEngine {
  board: (Color | null)[] = [];      // color per square
  type: (PieceType | null)[] = [];   // piece type per square
  turn: Color = 'w';
  castling: Castling = { wk: true, wq: true, bk: true, bq: true };
  epSquare: number | null = null;     // en passant target square
  halfmove = 0;
  fullmove = 1;

  constructor(fen: string = START_FEN) {
    this.loadFen(fen);
  }

  // ---------- setup ----------

  loadFen(fen: string): void {
    this.board = new Array(64).fill(null);
    this.type = new Array(64).fill(null);
    const parts = fen.trim().split(/\s+/);
    let sq = 56; // a8
    for (const ch of parts[0]) {
      if (ch === '/') { sq -= 16; continue; }
      if (/[1-8]/.test(ch)) { sq += parseInt(ch, 10); continue; }
      const lower = ch.toLowerCase() as PieceType;
      this.type[sq] = lower;
      this.board[sq] = ch === lower ? 'b' : 'w';
      sq++;
    }
    this.turn = (parts[1] as Color) ?? 'w';
    const c = parts[2] ?? 'KQkq';
    this.castling = {
      wk: c.includes('K'), wq: c.includes('Q'),
      bk: c.includes('k'), bq: c.includes('q'),
    };
    this.epSquare = parts[3] && parts[3] !== '-' ? squareFromName(parts[3]) : null;
    this.halfmove = parts[4] ? parseInt(parts[4], 10) : 0;
    this.fullmove = parts[5] ? parseInt(parts[5], 10) : 1;
  }

  toFen(): string {
    let fen = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const sq = rank * 8 + file;
        if (this.board[sq] === null) { empty++; continue; }
        if (empty) { fen += empty; empty = 0; }
        const t = this.type[sq] as PieceType;
        fen += this.board[sq] === 'w' ? t.toUpperCase() : t;
      }
      if (empty) fen += empty;
      if (rank > 0) fen += '/';
    }
    const c = (this.castling.wk ? 'K' : '') + (this.castling.wq ? 'Q' : '') +
              (this.castling.bk ? 'k' : '') + (this.castling.bq ? 'q' : '');
    fen += ` ${this.turn} ${c || '-'} ${this.epSquare !== null ? squareName(this.epSquare) : '-'} ${this.halfmove} ${this.fullmove}`;
    return fen;
  }

  clone(): ChessEngine {
    const e = new ChessEngine();
    e.board = [...this.board];
    e.type = [...this.type];
    e.turn = this.turn;
    e.castling = { ...this.castling };
    e.epSquare = this.epSquare;
    e.halfmove = this.halfmove;
    e.fullmove = this.fullmove;
    return e;
  }

  // ---------- geometry ----------

  static fileOf(sq: number): number { return sq & 7; }
  static rankOf(sq: number): number { return sq >> 3; }

  // ---------- move generation ----------

  kingSquare(color: Color): number {
    for (let sq = 0; sq < 64; sq++)
      if (this.board[sq] === color && this.type[sq] === 'k') return sq;
    return -1;
  }

  // All pseudo-legal moves for the side to move.
  pseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    const me = this.turn;
    for (let from = 0; from < 64; from++) {
      if (this.board[from] !== me) continue;
      const t = this.type[from] as PieceType;
      if (t === 'p') this.genPawn(from, moves);
      else if (t === 'n') this.genLeaper(from, [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]], moves);
      else if (t === 'k') this.genLeaper(from, [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]], moves);
      else {
        const dirs: [number, number][] = t === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : t === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        this.genSlider(from, dirs, moves);
      }
    }
    this.genCastling(moves);
    return moves;
  }

  private addMove(from: number, to: number, moves: Move[]): void {
    const piece = this.type[from] as PieceType;
    moves.push({
      from, to, piece,
      captured: this.type[to] !== null ? this.type[to] as PieceType : undefined,
    });
  }

  private genPawn(from: number, moves: Move[]): void {
    const me = this.turn;
    const dir = me === 'w' ? 1 : -1;
    const startRank = me === 'w' ? 1 : 6;
    const promoRank = me === 'w' ? 7 : 0;
    const f = ChessEngine.fileOf(from), r = ChessEngine.rankOf(from);
    const push = (to: number): void => {
      const captured = this.type[to] !== null ? this.type[to] as PieceType : undefined;
      if (ChessEngine.rankOf(to) === promoRank) {
        for (const p of ['q', 'r', 'b', 'n'] as PieceType[])
          moves.push({ from, to, piece: 'p', captured, promotion: p });
      } else {
        moves.push({ from, to, piece: 'p', captured, double: ChessEngine.rankOf(to) === startRank + 2 * dir });
      }
    };
    const one = from + 8 * dir;
    if (this.board[one] === null) {
      push(one);
      if (r === startRank && this.board[from + 16 * dir] === null)
        moves.push({ from, to: from + 16 * dir, piece: 'p', double: true });
    }
    for (const df of [-1, 1]) {
      const nf = f + df, nr = r + dir;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const to = nr * 8 + nf;
      if (this.board[to] !== null && this.board[to] !== me) push(to);
      else if (to === this.epSquare)
        moves.push({
          from, to, piece: 'p',
          captured: 'p', enPassant: true,
        });
    }
  }

  private genLeaper(from: number, deltas: [number, number][], moves: Move[]): void {
    const f = ChessEngine.fileOf(from), r = ChessEngine.rankOf(from);
    for (const [df, dr] of deltas) {
      const nf = f + df, nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const to = nr * 8 + nf;
      if (this.board[to] !== this.turn) this.addMove(from, to, moves);
    }
  }

  private genSlider(from: number, dirs: [number, number][], moves: Move[]): void {
    const f = ChessEngine.fileOf(from), r = ChessEngine.rankOf(from);
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        const to = nr * 8 + nf;
        if (this.board[to] === null) { this.addMove(from, to, moves); }
        else {
          if (this.board[to] !== this.turn) this.addMove(from, to, moves);
          break;
        }
        nf += df; nr += dr;
      }
    }
  }

  private genCastling(moves: Move[]): void {
    const me = this.turn;
    const opp: Color = me === 'w' ? 'b' : 'w';
    const home = me === 'w' ? 0 : 7;
    if (this.isSquareAttacked(home * 8 + 4, opp)) return;
    const kingSide = me === 'w' ? this.castling.wk : this.castling.bk;
    const queenSide = me === 'w' ? this.castling.wq : this.castling.bq;
    if (kingSide &&
        this.board[home * 8 + 5] === null && this.board[home * 8 + 6] === null &&
        !this.isSquareAttacked(home * 8 + 5, opp) && !this.isSquareAttacked(home * 8 + 6, opp))
      moves.push({ from: home * 8 + 4, to: home * 8 + 6, piece: 'k', castle: 'K' });
    if (queenSide &&
        this.board[home * 8 + 1] === null && this.board[home * 8 + 2] === null &&
        this.board[home * 8 + 3] === null &&
        !this.isSquareAttacked(home * 8 + 2, opp) && !this.isSquareAttacked(home * 8 + 3, opp))
      moves.push({ from: home * 8 + 4, to: home * 8 + 2, piece: 'k', castle: 'Q' });
  }

  // Is `sq` attacked by any piece of color `by`?
  isSquareAttacked(sq: number, by: Color): boolean {
    const f = ChessEngine.fileOf(sq), r = ChessEngine.rankOf(sq);
    // pawns attack diagonally upward (white) / downward (black),
    // so an attacking pawn of color `by` sits one rank "behind" the target
    const pawnRank = by === 'w' ? r - 1 : r + 1;
    if (pawnRank >= 0 && pawnRank <= 7) {
      for (const df of [-1, 1]) {
        const nf = f + df;
        if (nf < 0 || nf > 7) continue;
        const s = pawnRank * 8 + nf;
        if (this.board[s] === by && this.type[s] === 'p') return true;
      }
    }
    // knights
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      const nf = f + df, nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const s = nr * 8 + nf;
      if (this.board[s] === by && this.type[s] === 'n') return true;
    }
    // king
    for (const [df, dr] of [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]) {
      const nf = f + df, nr = r + dr;
      if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
      const s = nr * 8 + nf;
      if (this.board[s] === by && this.type[s] === 'k') return true;
    }
    // sliders
    const sliders: [number, number][]
      = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const diagonals: [number, number][]
      = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dirs, kinds] of [
      [sliders, ['r', 'q']],
      [diagonals, ['b', 'q']],
    ] as [[number, number][], PieceType[]][]) {
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
          const s = nr * 8 + nf;
          if (this.board[s] !== null) {
            if (this.board[s] === by && kinds.includes(this.type[s] as PieceType)) return true;
            break;
          }
          nf += df; nr += dr;
        }
      }
    }
    return false;
  }

  // Legal moves = pseudo-legal moves that leave own king unattacked.
  legalMoves(): Move[] {
    const res: Move[] = [];
    const opp: Color = this.turn === 'w' ? 'b' : 'w';
    for (const m of this.pseudoLegalMoves()) {
      const undo = this.makeMove(m);
      if (!this.isSquareAttacked(this.kingSquare(this.turn === 'w' ? 'b' : 'w'), opp)) res.push(m);
      this.unmakeMove(m, undo);
    }
    return res;
  }

  // ---------- make / unmake ----------

  makeMove(m: Move): { castling: Castling; epSquare: number | null; halfmove: number; fullmove: number; rookFrom?: number; rookTo?: number } {
    const saved = { castling: { ...this.castling }, epSquare: this.epSquare, halfmove: this.halfmove, fullmove: this.fullmove };
    const me = this.board[m.from] as Color;
    this.board[m.to] = me;
    this.type[m.to] = m.promotion ?? m.piece;
    this.board[m.from] = null;
    this.type[m.from] = null;
    if (m.enPassant) {
      const capSq = m.to + (me === 'w' ? -8 : 8);
      this.board[capSq] = null;
      this.type[capSq] = null;
    }
    if (m.castle) {
      const home = me === 'w' ? 0 : 7;
      if (m.castle === 'K') {
        saved.rookFrom = home * 8 + 7; saved.rookTo = home * 8 + 5;
      } else {
        saved.rookFrom = home * 8; saved.rookTo = home * 8 + 3;
      }
      this.board[saved.rookTo] = me;
      this.type[saved.rookTo] = 'r';
      this.board[saved.rookFrom] = null;
      this.type[saved.rookFrom] = null;
    }
    // castling rights
    if (m.piece === 'k') {
      if (me === 'w') { this.castling.wk = false; this.castling.wq = false; }
      else { this.castling.bk = false; this.castling.bq = false; }
    }
    if (m.piece === 'r') {
      if (m.from === 7) this.castling.wk = false;
      if (m.from === 0) this.castling.wq = false;
      if (m.from === 63) this.castling.bk = false;
      if (m.from === 56) this.castling.bq = false;
    }
    if (m.to === 7 || m.from === 7) this.castling.wk = false;
    if (m.to === 0 || m.from === 0) this.castling.wq = false;
    if (m.to === 63 || m.from === 63) this.castling.bk = false;
    if (m.to === 56 || m.from === 56) this.castling.bq = false;
    // en passant square
    this.epSquare = m.double ? m.from + (me === 'w' ? 8 : -8) : null;
    // clocks
    this.halfmove = (m.piece === 'p' || m.captured) ? 0 : this.halfmove + 1;
    if (this.turn === 'b') this.fullmove++;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    return saved;
  }

  unmakeMove(m: Move, saved: { castling: Castling; epSquare: number | null; halfmove: number; fullmove: number; rookFrom?: number; rookTo?: number }): void {
    const me = this.board[m.to] as Color; // mover
    this.board[m.from] = me;
    this.type[m.from] = m.piece;
    this.board[m.to] = null;
    this.type[m.to] = null;
    if (m.enPassant) {
      const capSq = m.to + (me === 'w' ? -8 : 8);
      this.board[capSq] = me === 'w' ? 'b' : 'w';
      this.type[capSq] = 'p';
    } else if (m.captured) {
      this.board[m.to] = me === 'w' ? 'b' : 'w';
      this.type[m.to] = m.captured;
    }
    if (m.castle && saved.rookFrom !== undefined && saved.rookTo !== undefined) {
      this.board[saved.rookFrom] = me;
      this.type[saved.rookFrom] = 'r';
      this.board[saved.rookTo] = null;
      this.type[saved.rookTo] = null;
    }
    this.castling = { ...saved.castling };
    this.epSquare = saved.epSquare;
    this.halfmove = saved.halfmove;
    this.fullmove = saved.fullmove;
    this.turn = this.turn === 'w' ? 'b' : 'w';
  }

  // ---------- public API ----------

  /** Play a move in "e2e4" / "e7e8q" notation. Returns true on success. */
  playMove(notation: string): boolean {
    const m = this.legalMoves().find((mv) => moveToName(mv) === notation);
    if (!m) return false;
    this.makeMove(m);
    return true;
  }

  status(): GameStatus {
    const opp: Color = this.turn === 'w' ? 'b' : 'w';
    const check = this.isSquareAttacked(this.kingSquare(this.turn), opp);
    const noMoves = this.legalMoves().length === 0;
    const checkmate = check && noMoves;
    const stalemate = !check && noMoves;
    let draw = !checkmate && !stalemate && this.halfmove >= 100;
    let drawReason = draw ? '50-move rule' : undefined;
    if (!draw && !checkmate && !stalemate && this.insufficientMaterial()) {
      draw = true;
      drawReason = 'insufficient material';
    }
    return {
      turn: this.turn,
      inCheck: check,
      checkmate, stalemate, draw, drawReason,
      over: checkmate || stalemate || draw,
    };
  }

  private insufficientMaterial(): boolean {
    const pieces: PieceType[] = [];
    for (let sq = 0; sq < 64; sq++) if (this.type[sq]) pieces.push(this.type[sq] as PieceType);
    if (pieces.some((p) => p === 'p' || p === 'q' || p === 'r')) return false;
    // K vs K, K+minor vs K
    const minors = pieces.filter((p) => p === 'n' || p === 'b');
    if (minors.length <= 1) return true;
    // K+B vs K+B with same-color bishops
    if (minors.length === 2 && pieces.every((p) => p !== 'n')) {
      const bishops: number[] = [];
      for (let sq = 0; sq < 64; sq++) if (this.type[sq] === 'b') bishops.push(sq);
      if (bishops.length === 2 &&
          ((ChessEngine.fileOf(bishops[0]) + ChessEngine.rankOf(bishops[0])) % 2) ===
          ((ChessEngine.fileOf(bishops[1]) + ChessEngine.rankOf(bishops[1])) % 2))
        return true;
    }
    return false;
  }

  ascii(): string {
    let s = '  +------------------------+\n';
    for (let rank = 7; rank >= 0; rank--) {
      s += `${rank + 1} |`;
      for (let file = 0; file < 8; file++) {
        const sq = rank * 8 + file;
        const t = this.type[sq];
        const ch = t === null ? '.' : (this.board[sq] === 'w' ? t.toUpperCase() : t);
        s += ` ${ch} `;
      }
      s += '|\n';
    }
    s += '  +------------------------+\n    a  b  c  d  e  f  g  h';
    return s;
  }
}

export function squareName(sq: number): string {
  return `${FILES[sq & 7]}${(sq >> 3) + 1}`;
}

export function squareFromName(name: string): number {
  return (parseInt(name[1], 10) - 1) * 8 + FILES.indexOf(name[0]);
}

export function moveToName(m: Move): string {
  return squareName(m.from) + squareName(m.to) + (m.promotion ?? '');
}

// ---------- bot (negamax + alpha-beta) ----------

const PIECE_VALUES: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** Static evaluation in centipawns, positive = good for white. */
export function evaluate(e: ChessEngine): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const t = e.type[sq];
    if (t === null) continue;
    const color = e.board[sq] === 'w' ? 1 : -1;
    let v = PIECE_VALUES[t];
    const file = sq & 7, rank = sq >> 3;
    // centralization bonus for knights, bishops, pawns on their way
    const centerBonus = 6 - 2 * (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
    if (t === 'n' || t === 'b') v += 2 * centerBonus;
    if (t === 'p') v += (color > 0 ? rank : 7 - rank) * 4; // advancement
    score += color * v;
  }
  return score;
}

export class ChessBot {
  depth: number;
  constructor(depth: number) { this.depth = depth; }

  /** Pick the best move for the side to move. Returns null when game over. */
  chooseMove(e: ChessEngine): Move | null {
    const ranked = this.rankMoves(e);
    return ranked.length > 0 ? ranked[0][0] : null;
  }

  /** All legal moves ranked best-first with their scores. */
  rankMoves(e: ChessEngine): Array<[Move, number]> {
    const out: Array<[Move, number]> = [];
    const maximizing = e.turn === 'w';
    for (const m of e.legalMoves()) {
      const undo = e.makeMove(m);
      const raw = -negamax(e, this.depth - 1, -Infinity, Infinity);
      const score = maximizing ? raw : -raw;
      e.unmakeMove(m, undo);
      out.push([m, score]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out;
  }
}

function negamax(e: ChessEngine, depth: number, alpha: number, beta: number): number {
  const moves = e.legalMoves();
  if (moves.length === 0) {
    // side to move has no moves: mate or stalemate
    const inCheck = e.isSquareAttacked(e.kingSquare(e.turn),
      e.turn === 'w' ? 'b' : 'w');
    return inCheck ? -(100000 + depth) : 0;
  }
  if (depth === 0 || e.halfmove >= 100) {
    return e.turn === 'w' ? evaluate(e) : -evaluate(e);
  }
  let best = -Infinity;
  for (const m of moves) {
    const undo = e.makeMove(m);
    const score = -negamax(e, depth - 1, -beta, -alpha);
    e.unmakeMove(m, undo);
    if (score > best) best = score;
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}
