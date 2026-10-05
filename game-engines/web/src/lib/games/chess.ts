// Chess adapter — wraps the real TypeScript engine in ../chess (perft-tested).
import type { CellView, Difficulty, GameController, GameView, Opponent } from '../types.ts';
import { ChessEngine, ChessBot, type Move } from '../../../../chess/chess-engine.ts';

export function chessController(): GameController {
  const engine = new ChessEngine();
  const bot = new ChessBot(2);
  let diff: Difficulty = 'medium';
  let opp: Opponent = 'ai';
  let selected = -1;

  return {
    reset(d, o) {
      diff = d; opp = o; selected = -1;
      engine.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    },
    isOpponentTurn: () => engine.turn === 'b' && !engine.status().over,
    opponentAct() {
      const legal = engine.legalMoves();
      if (legal.length === 0) return;
      let m: Move;
      if (opp === 'bot') {
        m = legal[Math.floor(Math.random() * legal.length)];
      } else {
        bot.depth = { easy: 1, medium: 2, hard: 3 }[diff];
        m = bot.chooseMove(engine) ?? legal[0];
      }
      engine.makeMove(m);
    },
    humanClick(r, c) {
      const sq = r * 8 + c;
      const st = engine.status();
      if (st.over || engine.turn !== 'w') return;
      const legal = engine.legalMoves();
      const move = legal.find((m) => m.from === selected && m.to === sq);
      if (move) {
        engine.makeMove(move);
        selected = -1;
        return;
      }
      if (engine.board[sq] === 'w') selected = sq; else selected = -1;
    },
    actions: () => [],
    view(): GameView {
      const st = engine.status();
      const legal = st.over ? [] : engine.legalMoves();
      const targets = new Set(legal.filter((m) => m.from === selected).map((m) => m.to));
      const movable = new Set(legal.filter((m) => engine.turn === 'w').map((m) => m.from));
      const rows: CellView[][] = [];
      for (let rank = 7; rank >= 0; rank--) {
        const row: CellView[] = [];
        for (let file = 0; file < 8; file++) {
          const sq = rank * 8 + file;
          const t = engine.type[sq];
          const white = engine.board[sq] === 'w';
          const glyph = t === null ? '' : (white ? t.toUpperCase() : (t as string));
          let cls = `cell ch-${(rank + file) % 2 === 0 ? 'light' : 'dark'}`;
          if (t !== null) cls += ` ch-piece-${white ? 'w' : 'b'}`;
          if (sq === selected) cls += ' selected';
          if (targets.has(sq)) cls += ' target';
          if (engine.turn === 'w' && movable.has(sq)) cls += ' movable';
          row.push({ glyph, cls, clickable: targets.has(sq) || engine.turn === 'w' && movable.has(sq) });
        }
        rows.push(row);
      }
      const status = st.over
        ? st.checkmate ? `Checkmate — ${st.turn === 'w' ? 'you lost' : 'you won'}!`
          : st.stalemate ? 'Stalemate — draw.'
          : `Draw (${st.drawReason}).`
        : st.inCheck ? 'You are in check!' : 'Your turn (white). Click a piece, then a target.';
      return {
        rows, status, over: st.over,
        winner: st.over ? st.checkmate ? (st.turn === 'w' ? 'opponent' : 'human') : 'draw' : '',
        cards: [], needsDigits: false,
        info: 'You play white.\nClick one of your pieces, then a highlighted target square.\nPromotions are automatic queen promotions.\nEn passant and castling are supported (castling: click king, then its target).',
      };
    },
  };
}
