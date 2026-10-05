// Chess AI-vs-bot simulation — run: node chess-simulate.ts [aiDepth] [botDepth]
// "AI" plays white at aiDepth (default 3); "Bot" plays black at botDepth
// (default 2). Prints the full game record and the final result.
import { ChessEngine, ChessBot, moveToName } from './chess-engine.ts';

const aiDepth = Number(process.argv[2] ?? 3);
const botDepth = Number(process.argv[3] ?? 2);
const PLY_LIMIT = 250;

export interface SimResult {
  plies: number;
  moves: string[];
  result: string;
}

/** Play a full AI-vs-bot game on a fresh engine and return the record. */
export function simulate(aiDepth: number, botDepth: number, log = false): SimResult {
  const e = new ChessEngine();
  const ai = new ChessBot(aiDepth);   // white
  const bot = new ChessBot(botDepth); // black
  const moves: string[] = [];
  let result = 'unknown';
  for (let ply = 0; ply < PLY_LIMIT; ply++) {
    const st = e.status();
    if (st.over) {
      result = st.checkmate
        ? (e.turn === 'w' ? '0-1 (black wins by checkmate)' : '1-0 (white wins by checkmate)')
        : st.stalemate ? '1/2-1/2 (stalemate)'
        : `1/2-1/2 (${st.drawReason})`;
      break;
    }
    const mover = e.turn === 'w' ? ai : bot;
    const m = mover.chooseMove(e);
    if (!m) { result = 'no moves'; break; }
    moves.push((e.turn === 'w' ? 'W:' : 'B:') + moveToName(m));
    e.makeMove(m);
  }
  if (result === 'unknown') result = `1/2-1/2 (move limit ${PLY_LIMIT} reached)`;
  if (log) {
    for (let i = 0; i < moves.length; i += 2) {
      const w = moves[i].slice(2);
      const b = moves[i + 1]?.slice(2) ?? '...';
      console.log(`${Math.floor(i / 2) + 1}. ${w} ${b}`);
    }
    console.log(e.ascii());
    console.log(result);
  }
  return { plies: moves.length, moves, result };
}

if (process.argv[1]?.endsWith('chess-simulate.ts')) {
  console.log(`AI (white, depth ${aiDepth}) vs Bot (black, depth ${botDepth})`);
  const t0 = Date.now();
  const r = simulate(aiDepth, botDepth, true);
  console.log(`plies: ${r.plies}, time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
