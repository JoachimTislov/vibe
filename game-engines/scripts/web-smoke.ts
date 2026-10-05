// Smoke test for the web adapters: run every game's controller through a
// full automated game (autopilot human + AI/bot opponent) and assert basic
// invariants. Run: node web-smoke.ts
import { chessController } from '../web/src/lib/games/chess.ts';
import { connect4Controller } from '../web/src/lib/games/connect4.ts';
import { reversiController } from '../web/src/lib/games/reversi.ts';
import { xiangqiController } from '../web/src/lib/games/xiangqi.ts';
import { sequenceController } from '../web/src/lib/games/sequence.ts';
import { sudokuController } from '../web/src/lib/games/sudoku.ts';
import type { GameController } from '../web/src/lib/types.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok' : 'FAIL'}: ${name}${ok ? '' : ' ' + detail}`);
  if (!ok) failures++;
}

/** autopilot: click the first clickable cell, let the opponent respond */
function autopilot(name: string, ctrl: GameController, maxPlies: number, opponent: 'ai' | 'bot'): void {
  ctrl.reset('medium', opponent);
  let plies = 0;
  let guard = 0;
  while (!ctrl.view().over && plies < maxPlies && guard++ < maxPlies * 4) {
    if (ctrl.isOpponentTurn()) {
      ctrl.opponentAct();
      plies++;
      continue;
    }
    const v = ctrl.view();
    // sequence: pick the first card first
    if (v.cards.length > 0 && ctrl.selectCard) ctrl.selectCard(0);
    const v2 = ctrl.view();
    let clicked = false;
    outer: for (let r = 0; r < v2.rows.length; r++) {
      for (let c = 0; c < v2.rows[r].length; c++) {
        if (v2.rows[r][c].clickable) {
          ctrl.humanClick(r, c);
          clicked = true;
          break outer;
        }
      }
    }
    plies++;
    if (!clicked) break; // nothing clickable: stuck
  }
  const v = ctrl.view();
  check(`${name} (${opponent}) terminates`, v.over || plies >= maxPlies,
    `status: ${v.status}`);
}

// --- chess: scripted sanity ---
{
  const ctrl = chessController();
  ctrl.reset('medium', 'bot');
  const v0 = ctrl.view();
  check('chess renders 8x8', v0.rows.length === 8 && v0.rows[0].length === 8);
  ctrl.humanClick(6, 4); // e2
  ctrl.humanClick(4, 4); // e4
  ctrl.opponentAct();    // bot replies
  const v = ctrl.view();
  check('chess human move + bot reply', !v.over && v.status.length > 0, v.status);
  autopilot('chess', ctrl, 60, 'bot');
}

// --- connect four: AI should beat a dumb autopilot that plays column 0 ---
{
  const ctrl = connect4Controller();
  autopilot('four-in-a-row', ctrl, 42, 'bot');
  autopilot('four-in-a-row', ctrl, 42, 'ai');
}

// --- reversi ---
{
  const ctrl = reversiController();
  autopilot('reversi', ctrl, 70, 'bot');
  autopilot('reversi', ctrl, 70, 'ai');
}

// --- xiangqi ---
{
  const ctrl = xiangqiController();
  const v = ctrl.view();
  check('xiangqi renders 10x9', v.rows.length === 10 && v.rows[0].length === 9);
  autopilot('xiangqi', ctrl, 80, 'bot');
  autopilot('xiangqi', ctrl, 80, 'ai');
}

// --- sequence ---
{
  const ctrl = sequenceController();
  const v = ctrl.view();
  check('sequence renders 10x10', v.rows.length === 10 && v.rows[0].length === 10);
  check('sequence deals 7 cards', v.cards.length === 7, `got ${v.cards.length}`);
  autopilot('sequence', ctrl, 200, 'bot');
}

// --- sudoku: hints and solve ---
{
  const ctrl = sudokuController();
  ctrl.reset('easy', 'ai');
  for (let i = 0; i < 81; i++) {
    const a = ctrl.actions().find((x) => x.label === 'Hint');
    if (!a) break;
    a.run();
    if (ctrl.view().over) break;
  }
  check('sudoku solvable via AI hints', ctrl.view().over);
  ctrl.reset('hard', 'ai');
  const solveBtn = ctrl.actions().find((x) => x.label === 'Solve');
  solveBtn?.run();
  check('sudoku Solve completes', ctrl.view().over);
}

console.log(failures === 0 ? 'ALL SMOKE TESTS PASSED' : `${failures} FAILURES`);
if (failures > 0) process.exit(1);
