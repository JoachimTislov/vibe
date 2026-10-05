// Perft validation for the chess engine against published reference values.
// Run: node perft.ts
import { ChessEngine } from '../chess/chess-engine.ts';

function perft(e: ChessEngine, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of e.legalMoves()) {
    const undo = e.makeMove(m);
    n += perft(e, depth - 1);
    e.unmakeMove(m, undo);
  }
  return n;
}

const cases: Array<[string, string, number, number]> = [
  ['initial position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674638],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 4, 422333],
];

let failures = 0;
for (const [name, fen, depth, expected] of cases) {
  const e = new ChessEngine(fen);
  const got = perft(e, depth);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok' : 'FAIL'}: perft(${depth}) ${name}: ${got}${ok ? '' : ` (expected ${expected})`}`);
}

console.log(failures === 0 ? 'perft: all reference values match' : `perft: ${failures} mismatches`);
if (failures > 0) process.exit(1);
