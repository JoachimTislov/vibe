// Shared contract implemented by every game adapter so the Svelte app can
// offer one common interface: pick a game, pick AI (strong) or bot (weak),
// pick a difficulty, and play.

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Opponent = 'ai' | 'bot';

export interface CellView {
  glyph: string;      // text shown in the cell ('' for empty visuals)
  cls: string;        // space-separated css classes
  clickable: boolean; // highlight as a legal target for the human
  title?: string;     // tooltip (e.g. card id on the sequence board)
}

export interface CardView {
  label: string;      // e.g. "3: 5H"
  cls: string;        // 'card selected' | 'card' | ...
}

export interface GameView {
  rows: CellView[][];
  status: string;     // status line under the board
  info: string;       // multi-line side panel text
  cards: CardView[];  // clickable hand (sequence); empty for other games
  over: boolean;
  winner: string;     // 'human' | 'opponent' | 'draw' | ''
  needsDigits: boolean; // show the 1-9 pad (sudoku)
}

export interface GameController {
  /** human starts a fresh game; opponent moves are made via opponentAct() */
  reset(diff: Difficulty, opp: Opponent): void;
  /** full render state */
  view(): GameView;
  /** human clicked cell (r, c) */
  humanClick(r: number, c: number): void;
  /** human pressed a digit (sudoku only) */
  humanDigit?(n: number): void;
  /** human clicked the i-th hand card (sequence only) */
  selectCard?(idx: number): void;
  /** extra actions shown as buttons */
  actions(): { label: string; run: () => void }[];
  /** true when the opponent should act now */
  isOpponentTurn(): boolean;
  /** the opponent (AI or bot) makes one move */
  opponentAct(): void;
}

export const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
