# game-engines

Rules engines for six games, one per language. Folders are sorted by
implementation language; difficulty is tracked internally — a rating in each
engine's header comment plus the table below — rather than in the folder
names.

| Language   | Game                              | Folder          | Difficulty | Run                                         |
|------------|-----------------------------------|-----------------|-----------|---------------------------------------------|
| C          | Sudoku                            | `sudoku/`       | 4/5       | `gcc -O2 -o sudoku sudoku.c && ./sudoku`    |
| Go         | Chinese chess (Xiangqi)           | `chinese-chess/`| 5/5       | `go run .`                                  |
| Java       | Reversi (Othello) — wildcard      | `reversi/`      | 3/5       | `javac Reversi.java && java Reversi`        |
| PHP        | Sequence                          | `sequence/`     | 3/5       | `php sequence.php`                          |
| Python     | Four in a row (Connect Four)      | `four-in-a-row/`| 1/5       | `python3 four_in_a_row.py`                  |
| TypeScript | Chess                             | `chess/`        | 5/5       | `node chess-demo.ts` (Node >= 23, or `--experimental-strip-types`) |

Sorted by difficulty instead:

1. Four in a row — 1/5 (gravity drop, four-in-a-row detection)
2. Sequence — 3/5 (card-driven placement, wilds, locked sequences)
3. Reversi — 3/5 (directional flanking flips, pass handling)
4. Sudoku — 4/5 (MRV backtracking, unique-solution generation)
5. Chess — 5/5 (full legal move generation incl. castling, en passant)
6. Chinese chess — 5/5 (leg rules, palace/river geometry, flying general)

## Makefile

The common entry point for building, testing, simulating and playing:

```
make build            # compile the C and Java binaries
make test             # all engine self-tests + chess perft + web smoke test
make test-cli         # headless scripted runs of every CLI
make simulate-easy    # AI-vs-bot cases at the three strength presets
make simulate-medium
make simulate-hard
make play-chess DIFF=hard        # interactive games against the AI
make play-chinese-chess DIFF=medium
make play-four-in-a-row DIFF=easy
make play-sequence DIFF=medium
make play-sudoku DIFF=easy
make play-reversi DIFF=hard
make web              # Svelte web interface (dev server, http://localhost:5173)
make web-build        # production build into web/dist
make web-test         # headless smoke test of all web adapters
make clean
```

`DIFF` is `easy`, `medium` or `hard` (default `medium`) and maps to search
depths/strength per game.

## CLI play modes

Every engine has an interactive `play` mode where a human plays against the
AI. Difficulty presets adjust search depth (chess/xiangqi/reversi also add
randomness at easier levels):

| Game          | Command                                     | Move input                          |
|---------------|---------------------------------------------|-------------------------------------|
| Chess         | `node chess/chess-cli.ts [diff] [side]`     | coordinate moves, e.g. `e2e4`, `u` undo, `q` quit |
| Four in a row | `python3 four-in-a-row/four_in_a_row.py play [diff]` | column 1-7              |
| Chinese chess | `cd chinese-chess && go run . play [diff] [side]` | `fromFile,fromRank toFile,toRank`, e.g. `1,7 4,7` |
| Sequence      | `php sequence/sequence.php play [diff]`     | `p <card#> [row col]`, `d <card#>` discard dead card |
| Sudoku        | `./sudoku/sudoku play [diff]` (after `make build`) | `<row> <col> <digit>`, `hint`, `check`, `solve` |
| Reversi       | `java -cp reversi Reversi play [diff]`      | `<row> <col>` (e.g. `2 3`)          |

## Simulating AI vs Bot

Every engine also has a `simulate` mode that plays a built-in AI against a
weaker bot from the starting position and prints the game record and
result. Strengths can be tuned via depth arguments where noted.

| Game           | Command                                             | AI vs Bot                                              |
|----------------|-----------------------------------------------------|--------------------------------------------------------|
| Chess          | `node chess-simulate.ts [aiDepth=3] [botDepth=2]`   | white negamax d3 vs black negamax d2                   |
| Four in a row  | `python3 four_in_a_row.py simulate [ai=5] [bot=2]` | X negamax d5 vs O negamax d2                           |
| Chinese chess  | `go run . simulate [aiDepth=2] [botDepth=1]`        | red negamax d2 vs black negamax d1                     |
| Sequence       | `php sequence.php simulate [verbose=1] [botSeed=7]` | heuristic vs random (verbose=2: 20-seed tournament)    |
| Sudoku         | `./sudoku simulate [rounds=10]`                     | solver AI vs generator bot (declining clue targets)    |
| Reversi        | `java Reversi simulate [aiDepth=4]`                 | black negamax d4 vs white greedy                       |

Bots are deliberately lightweight (material/positional evaluation, no
opening books or endgame tables). The chess, four-in-a-row and Reversi
simulations import the bot from the engine module/file, so they are also
usable as libraries: `ChessBot`, `best_move()`, `chooseMove()` /
`greedyMove()` respectively.

## Web interface (Svelte)

`web/` is a common Svelte interface for all six games: pick a game, pick
the opponent — AI (search-based) or Bot (random legal moves) — pick a
difficulty, and play in the browser.

```
cd web
npm install       # first time only
npm run dev       # http://localhost:5173
```

- The board is clickable per game: chess/xiangqi highlight a selected
  piece's legal targets, four-in-a-row drops by column, reversi highlights
  flanking squares, sequence selects a hand card then its spaces, sudoku
  combines cell selection with a digit pad plus Hint/Check/Solve buttons.
- Adapters live in `web/src/lib/games/*.ts` behind a shared
  `GameController` contract (`web/src/lib/types.ts`). The chess adapter
  imports the perft-tested `chess/chess-engine.ts` directly; the other
  five are TypeScript ports of their native engines.
- `npm run smoke` (or `make web-test`) runs an automated game through every
  adapter headlessly via `scripts/web-smoke.ts`.

## Notes and simplifications

- **Chess** (chess-engine.ts): full legal move generation with make/unmake,
  FEN in/out, check/checkmate/stalemate, 50-move and insufficient-material
  draws. Validated by perft against the published reference values for the
  initial position (depth 5: 4,865,609), Kiwipete and two other standard
  test positions (`make test` runs a 4-position perft suite).
- **Chinese chess** (xiangqi.go): full rules except perpetual-check
  repetition rules; stalemate is a loss, as in real xiangqi. The binary
  runs 26 rule spot-checks on startup.
- **Sequence** (sequence.php): 2-player rules with two-eyed/one-eyed jacks,
  dead cards, locked sequences and free corners. The printed official board
  layout is not reproduced; the card layout and deck are generated
  deterministically from fixed seeds instead (each of the 48 non-jack cards
  still appears exactly twice, as on the real board).
- **Sudoku** (sudoku.c): solver with MRV candidate ordering, solution
  counting capped at 2 for uniqueness tests, seeded puzzle generation by
  digging holes while preserving a unique solution.
- **Reversi** (Reversi.java): flanking flips, pass handling, game-over
  detection when neither side can move.
- **Four in a row** (four_in_a_row.py): depth-limited negamax AI with
  alpha-beta pruning; the other engines' bots use the same search pattern
  with game-appropriate evaluation functions.

Each engine is a single self-contained file (plus small CLI/simulate
companions) with no external dependencies; the web app is the only part
that needs an `npm install`.
