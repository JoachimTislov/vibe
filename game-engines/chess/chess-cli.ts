// Chess CLI — play against the AI from the terminal.
// Usage: node chess-cli.ts [easy|medium|hard] [white|black]
// Moves are typed in coordinate notation, e.g. e2e4, g1f3, e7e8q.
// Commands: u = undo last full move pair, q = quit.
//
// Node's readline/promises loses buffered lines after the first question()
// when stdin is a pipe, so input is read manually here.
import { stdin, stdout, exit } from 'node:process';
import { ChessEngine, ChessBot, moveToName, type Move } from './chess-engine.ts';

const DIFFICULTIES: Record<string, { depth: number; spread: number }> = {
  easy: { depth: 1, spread: 3 },   // picks randomly among the top 3 moves
  medium: { depth: 2, spread: 1 }, // best or second-best
  hard: { depth: 3, spread: 0 },   // always the best move found
};

const args = process.argv.slice(2);
const difficultyName = args[0] in DIFFICULTIES ? args[0] : 'medium';
const humanPlaysWhite = !(args[1] === 'black');
const preset = DIFFICULTIES[difficultyName];
const bot = new ChessBot(preset.depth);

function pickAIMove(e: ChessEngine): Move | null {
  const ranked = bot.rankMoves(e);
  if (ranked.length === 0) return null;
  const idx = preset.spread === 0 ? 0 : Math.floor(Math.random() * (preset.spread + 1));
  return ranked[Math.min(idx, ranked.length - 1)][0];
}

/** Line-oriented stdin reader that works the same on TTYs and pipes. */
class LineReader {
  private buf = '';
  private lines: string[] = [];
  private waiter: (() => void) | null = null;
  private ended = false;

  constructor() {
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => {
      this.buf += chunk;
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        this.lines.push(this.buf.slice(0, idx).replace(/\r$/, ''));
        this.buf = this.buf.slice(idx + 1);
      }
      this.wake();
    });
    stdin.on('end', () => { this.ended = true; this.wake(); });
  }

  private wake(): void {
    if (this.waiter) { const w = this.waiter; this.waiter = null; w(); }
  }

  /** Next line; '' at end of input. */
  async next(): Promise<string> {
    for (;;) {
      if (this.lines.length > 0) return this.lines.shift() as string;
      if (this.ended) {
        if (this.buf !== '') { const l = this.buf; this.buf = ''; return l; }
        return '';
      }
      await new Promise<void>((res) => { this.waiter = res; });
    }
  }
}

async function main(): Promise<void> {
  const e = new ChessEngine();
  const history: Move[] = [];
  const rl = new LineReader();
  const humanColor = humanPlaysWhite ? 'w' : 'b';

  console.log(`chess CLI — difficulty: ${difficultyName}, you play ${humanPlaysWhite ? 'white' : 'black'}`);
  console.log('commands: <move> | u (undo) | q (quit)\n');

  while (true) {
    const st = e.status();
    console.log(e.ascii());
    if (st.over) {
      console.log(st.checkmate
        ? `checkmate — ${(e.turn === 'w' ? 'black' : 'white')} wins`
        : st.stalemate ? 'stalemate — draw'
        : `draw (${st.drawReason})`);
      break;
    }
    if (st.inCheck) console.log('** check **');

    if (e.turn === humanColor) {
      stdout.write('your move> ');
      const line = (await rl.next()).trim();
      if (line === 'q' || line === '') { console.log('bye'); break; }
      if (line === 'u') {
        if (history.length >= 2) {
          history.splice(history.length - 2, 2);
          const fresh = new ChessEngine();
          for (const m of history) fresh.makeMove(m);
          e.board = fresh.board; e.type = fresh.type; e.turn = fresh.turn;
          e.castling = fresh.castling; e.epSquare = fresh.epSquare;
          e.halfmove = fresh.halfmove; e.fullmove = fresh.fullmove;
          console.log('undone');
        } else {
          console.log('nothing to undo');
        }
        continue;
      }
      const legal = e.legalMoves().map(moveToName);
      if (!legal.includes(line)) {
        console.log(`illegal move "${line}" (examples: ${legal.slice(0, 4).join(' ')}...)`);
        continue;
      }
      const m = e.legalMoves().find((mv) => moveToName(mv) === line) as Move;
      e.makeMove(m);
      history.push(m);
    } else {
      const m = pickAIMove(e);
      if (!m) break;
      console.log(`AI plays: ${moveToName(m)}`);
      e.makeMove(m);
      history.push(m);
    }
  }
  exit(0);
}

main();
