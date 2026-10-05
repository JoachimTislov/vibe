// Registry of all games in the common web interface.
import type { Difficulty, GameController } from './types.ts';
import { chessController } from './games/chess.ts';
import { connect4Controller } from './games/connect4.ts';
import { reversiController } from './games/reversi.ts';
import { xiangqiController } from './games/xiangqi.ts';
import { sequenceController } from './games/sequence.ts';
import { sudokuController } from './games/sudoku.ts';

export interface GameEntry {
  id: string;
  label: string;
  language: string;
  difficulty: string;
  make: () => GameController;
}

export const GAMES: GameEntry[] = [
  { id: 'chess', label: 'Chess', language: 'TypeScript', difficulty: '5/5', make: chessController },
  { id: 'chinese-chess', label: 'Chinese chess (Xiangqi)', language: 'Go', difficulty: '5/5', make: xiangqiController },
  { id: 'four-in-a-row', label: 'Four in a row', language: 'Python', difficulty: '1/5', make: connect4Controller },
  { id: 'reversi', label: 'Reversi (Othello)', language: 'Java', difficulty: '3/5', make: reversiController },
  { id: 'sequence', label: 'Sequence', language: 'PHP', difficulty: '3/5', make: sequenceController },
  { id: 'sudoku', label: 'Sudoku', language: 'C', difficulty: '4/5', make: sudokuController },
];

export type { Difficulty };
