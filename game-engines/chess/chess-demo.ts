// Chess engine demo — run: node chess-demo.ts
import { ChessEngine, moveToName } from './chess-engine.ts';

const e = new ChessEngine();
const opening = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'];
for (const mv of opening) {
  if (!e.playMove(mv)) { console.log(`illegal: ${mv}`); break; }
  console.log(`${mv}  ->  ${e.toFen()}`);
}
console.log();
console.log(e.ascii());
const st = e.status();
console.log(`legal moves after opening: ${e.legalMoves().length}, turn: ${st.turn}, over: ${st.over}`);

// Fool's mate: fastest checkmate
const f = new ChessEngine();
for (const mv of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) f.playMove(mv);
console.log(`fool's mate -> checkmate: ${f.status().checkmate}`);

// Castling demo
const c = new ChessEngine('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
const castleMoves = c.legalMoves().map(moveToName).filter((n) => n === 'e1g1' || n === 'e1c1');
console.log(`white castling moves: ${castleMoves.join(', ')}`);

// Promotion
const p = new ChessEngine('8/PK5p/8/8/8/8/6k1/8 w - - 0 1');
p.playMove('a7a8q');
console.log(`promotion a7a8q -> FEN: ${p.toFen()}`);
