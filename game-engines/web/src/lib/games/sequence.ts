// Sequence adapter — TypeScript port of ../sequence/sequence.php
// Human plays player 1 (heuristic-free); opponent plays 2.
// Board: 10x10, four free corners, each of the 48 non-jack cards appears
// exactly twice. Two-eyed jacks (JC/JD) are wild; one-eyed jacks (JS/JH)
// remove an opponent chip.
import type { CellView, Difficulty, GameController, GameView, Opponent } from '../types.ts';

const SIZE = 10;
const SEQUENCE_LEN = 5;
const WIN_SEQUENCES = 2;

// deterministic RNG (mulberry32) so the layout and deck are reproducible
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];

class Sequence {
  layout: string[][] = [];      // card id or 'FREE'
  chips: number[][] = [];       // 0, 1, 2
  locked: boolean[][] = [];     // chip locked into a sequence
  cardSpaces: Record<string, Array<[number, number]>> = {};
  deck: string[] = [];
  hands: [string[], string[]] = [[], []];
  sequences: [number, number] = [0, 0];
  turn = 1;

  reset(): void {
    const rand = mulberry32(4242);
    const boardCards: string[] = [];
    for (const r of RANKS) {
      if (r === 'J') continue;
      for (const s of SUITS) { boardCards.push(r + s, r + s); }
    }
    const shuffled = shuffle(boardCards, rand);
    let k = 0;
    for (let r = 0; r < SIZE; r++) {
      this.layout[r] = [];
      this.chips[r] = [];
      this.locked[r] = [];
      for (let c = 0; c < SIZE; c++) {
        const corner = (r === 0 || r === SIZE - 1) && (c === 0 || c === SIZE - 1);
        this.layout[r][c] = corner ? 'FREE' : shuffled[k++];
        this.chips[r][c] = 0;
        this.locked[r][c] = false;
      }
    }
    this.cardSpaces = {};
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const id = this.layout[r][c];
        if (id !== 'FREE') (this.cardSpaces[id] ??= []).push([r, c]);
      }
    }
    const deckCards: string[] = [];
    for (const r of RANKS) for (const s of SUITS) { deckCards.push(r + s, r + s); }
    this.deck = shuffle(deckCards, mulberry32(90210));
    this.hands = [[], []];
    for (let i = 0; i < 7; i++) {
      this.hands[0].push(this.deck.pop() as string);
      this.hands[1].push(this.deck.pop() as string);
    }
    this.sequences = [0, 0];
    this.turn = 1;
  }

  isOneEyed(card: string): boolean { return card === 'JS' || card === 'JH'; }
  isTwoEyed(card: string): boolean { return card === 'JC' || card === 'JD'; }

  legal(player: number): Array<{ cardIdx: number; action: 'place' | 'remove' | 'discard'; r: number; c: number }> {
    const moves: Array<{ cardIdx: number; action: 'place' | 'remove' | 'discard'; r: number; c: number }> = [];
    const opp = player === 1 ? 2 : 1;
    const dead: number[] = [];
    this.hands[player - 1].forEach((card, idx) => {
      if (this.isTwoEyed(card)) {
        for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
          if (this.chips[r][c] === 0) moves.push({ cardIdx: idx, action: 'place', r, c });
        }
        return;
      }
      if (this.isOneEyed(card)) {
        let any = false;
        for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
          if (this.chips[r][c] === opp && !this.locked[r][c]) {
            moves.push({ cardIdx: idx, action: 'remove', r, c });
            any = true;
          }
        }
        if (!any) dead.push(idx);
        return;
      }
      let any = false;
      for (const [r, c] of this.cardSpaces[card] ?? []) {
        if (this.chips[r][c] === 0) {
          moves.push({ cardIdx: idx, action: 'place', r, c });
          any = true;
        }
      }
      if (!any) dead.push(idx);
    });
    for (const idx of dead) moves.push({ cardIdx: idx, action: 'discard', r: -1, c: -1 });
    return moves;
  }

  apply(m: { cardIdx: number; action: 'place' | 'remove' | 'discard'; r: number; c: number }): void {
    const player = this.turn;
    if (m.action === 'place') this.chips[m.r][m.c] = player;
    if (m.action === 'remove') this.chips[m.r][m.c] = 0;
    this.hands[player - 1].splice(m.cardIdx, 1);
    if (this.deck.length > 0) this.hands[player - 1].push(this.deck.pop() as string);
    if (m.action === 'place') this.detect(player);
    this.turn = player === 1 ? 2 : 1;
  }

  detect(player: number): void {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (this.chips[r][c] !== player) continue;
          const pr = r - dr, pc = c - dc;
          if (pr >= 0 && pr < SIZE && pc >= 0 && pc < SIZE && this.chips[pr][pc] === player) continue;
          let len = 0, rr = r, cc = c;
          while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && this.chips[rr][cc] === player) {
            len++; rr += dr; cc += dc;
          }
          if (len >= SEQUENCE_LEN) {
            this.sequences[player - 1] += len >= 9 ? 2 : 1;
            rr = r; cc = c;
            for (let i = 0; i < Math.min(len, 9); i++) {
              this.locked[rr][cc] = true;
              rr += dr; cc += dc;
            }
          }
        }
      }
    }
  }

  winner(): 0 | 1 | 2 {
    if (this.sequences[0] >= WIN_SEQUENCES) return 1;
    if (this.sequences[1] >= WIN_SEQUENCES) return 2;
    return 0;
  }

  /** longest own-chip run through (r,c) if player placed there */
  linePotential(r: number, c: number, player: number): number {
    let best = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
      let count = 1;
      for (const sign of [1, -1]) {
        let rr = r + dr * sign, cc = c + dc * sign;
        while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && this.chips[rr][cc] === player) {
          count++; rr += dr * sign; cc += dc * sign;
        }
      }
      best = Math.max(best, count);
    }
    return best;
  }
}

export function sequenceController(): GameController {
  const game = new Sequence();
  game.reset(); // ready to render before the first reset()
  let diff: Difficulty = 'medium';
  let opp: Opponent = 'ai';
  let selectedCard: number | null = null;

  const smartPick = (): { cardIdx: number; action: 'place' | 'remove' | 'discard'; r: number; c: number } | null => {
    const moves = game.legal(2);
    if (moves.length === 0) return null;
    let best = moves[0], bestScore = -Infinity;
    for (const m of moves) {
      let score: number;
      if (m.action === 'place') {
        const mine = game.linePotential(m.r, m.c, 2);
        const theirs = game.linePotential(m.r, m.c, 1);
        score = mine * 10 + (mine >= SEQUENCE_LEN ? 500 : 0)
          + (theirs >= SEQUENCE_LEN ? 200 : theirs * 4);
      } else if (m.action === 'remove') {
        const theirs = game.linePotential(m.r, m.c, 1);
        score = theirs >= SEQUENCE_LEN ? 300 : theirs * 8;
      } else {
        score = -1;
      }
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  };

  return {
    reset(d, o) { diff = d; opp = o; selectedCard = null; game.reset(); },
    isOpponentTurn: () => game.turn === 2 && game.winner() === 0,
    opponentAct() {
      const moves = game.legal(2);
      if (moves.length === 0) return;
      let m;
      if (opp === 'bot') {
        m = moves[Math.floor(Math.random() * moves.length)];
      } else {
        const noisy = diff === 'easy' ? 0.7 : diff === 'medium' ? 0.3 : 0;
        m = Math.random() < noisy
          ? moves[Math.floor(Math.random() * moves.length)]
          : smartPick() ?? moves[0];
      }
      game.apply(m);
    },
    humanClick(r, c) {
      if (game.turn !== 1 || game.winner() !== 0 || selectedCard === null) return;
      const move = game.legal(1).find(
        (mv) => mv.cardIdx === selectedCard && mv.r === r && mv.c === c,
      );
      if (move) {
        game.apply(move);
        selectedCard = null;
      }
    },
    selectCard(idx) {
      selectedCard = selectedCard === idx ? null : idx;
    },
    actions: () => {
      // discarding a selected dead card
      if (selectedCard !== null) {
        const isDead = !game.legal(1).some(
          (mv) => mv.cardIdx === selectedCard && mv.action !== 'discard');
        if (isDead) {
          return [{
            label: `Discard dead card ${game.hands[0][selectedCard]}`,
            run: () => {
              const m = game.legal(1).find(
                (mv) => mv.cardIdx === selectedCard && mv.action === 'discard');
              if (m) { game.apply(m); selectedCard = null; }
            },
          }];
        }
      }
      return [];
    },
    view(): GameView {
      const candidates = new Set<string>();
      if (selectedCard !== null) {
        for (const mv of game.legal(1)) {
          if (mv.cardIdx === selectedCard && mv.action !== 'discard') {
            candidates.add(`${mv.r},${mv.c}`);
          }
        }
      }
      const rows: CellView[][] = [];
      for (let r = 0; r < SIZE; r++) {
        const row: CellView[] = [];
        for (let c = 0; c < SIZE; c++) {
          const card = game.layout[r][c];
          const chip = game.chips[r][c];
          const isCandidate = candidates.has(`${r},${c}`);
          let glyph = chip === 0 ? '' : String(chip);
          if (card === 'FREE') glyph = chip === 0 ? '★' : glyph;
          let cls = `cell sq-space`;
          if (card === 'FREE') cls += ' sq-corner';
          if (game.locked[r][c] && chip !== 0) cls += ' sq-locked';
          if (chip === 1) cls += ' sq-p1';
          if (chip === 2) cls += ' sq-p2';
          if (isCandidate) cls += ' target';
          row.push({
            glyph,
            cls,
            clickable: isCandidate,
            title: card === 'FREE' ? 'free corner' : card,
          });
        }
        rows.push(row);
      }
      const cards = game.hands[0].map((card, i) => ({
        label: card,
        cls: `card${selectedCard === i ? ' selected' : ''}${(card === 'JC' || card === 'JD') ? ' wild' : ''}${(card === 'JS' || card === 'JH') ? ' remover' : ''}`,
      }));
      const winner = game.winner();
      const status = winner !== 0
        ? winner === 1 ? 'You win! (two sequences)' : 'Opponent wins!'
        : game.turn === 1 ? 'Your turn — click a card, then a board space.'
        : 'Opponent thinking...';
      return {
        rows, status, over: winner !== 0,
        winner: winner === 1 ? 'human' : winner === 2 ? 'opponent' : '',
        cards,
        needsDigits: false,
        info: `Sequences — you: ${game.sequences[0]}, opponent: ${game.sequences[1]} (need ${WIN_SEQUENCES})\n\nTwo-eyed jacks (JC/JD): place a chip anywhere.\nOne-eyed jacks (JS/JH): click an opponent chip to remove it.\nDead cards can be discarded via the button.\nA corner (star) counts for both players.`,
      };
    },
  };
}
