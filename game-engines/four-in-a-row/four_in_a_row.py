#!/usr/bin/env python3
"""Four-in-a-row engine (Connect Four) - Python.

Difficulty: 1/5 (drop a disc, detect four in a row).

Rules implemented: standard Connect Four on a 7x6 board. Players alternate
dropping discs into columns; the disc falls to the lowest empty row. First
player to line up four of their discs horizontally, vertically or diagonally
wins; a full board with no line is a draw. Includes undo and a depth-limited
negamax AI with alpha-beta pruning as a reference opponent.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field

COLS = 7
ROWS = 6
WIN = 4

PLAYER1 = 1
PLAYER2 = 2


@dataclass
class Status:
    over: bool
    winner: int | None  # 1, 2 or None (draw / ongoing)
    winning_cells: list[tuple[int, int]] = field(default_factory=list)


class FourInARow:
    def __init__(self) -> None:
        self.board: list[list[int]] = [[0] * COLS for _ in range(ROWS)]
        self.current_player: int = PLAYER1
        self._history: list[tuple[int, int]] = []  # (col, row) of each move
        self._winner: int | None = None
        self._winning_cells: list[tuple[int, int]] = []

    # ---------- queries ----------

    def cell(self, row: int, col: int) -> int:
        return self.board[row][col]

    def legal_moves(self) -> list[int]:
        if self._winner is not None:
            return []
        return [c for c in range(COLS) if self.board[ROWS - 1][c] == 0]

    def status(self) -> Status:
        if self._winner is not None:
            return Status(True, self._winner, self._winning_cells)
        if not self.legal_moves():
            return Status(True, None)
        return Status(False, None)

    def winner(self) -> int | None:
        return self._winner

    # ---------- moves ----------

    def drop(self, col: int) -> int:
        """Drop a disc for the current player into `col`. Returns the row."""
        if col not in self.legal_moves():
            raise ValueError(f"illegal move: column {col}")
        row = 0
        while row < ROWS and self.board[row][col] != 0:
            row += 1
        self.board[row][col] = self.current_player
        self._history.append((col, row))
        self._update_winner(row, col)
        self.current_player = PLAYER2 if self.current_player == PLAYER1 else PLAYER1
        return row

    def undo(self) -> bool:
        if not self._history:
            return False
        col, row = self._history.pop()
        self.board[row][col] = 0
        self._winner = None
        self._winning_cells = []
        self.current_player = PLAYER2 if self.current_player == PLAYER1 else PLAYER1
        return True

    # ---------- internals ----------

    def _update_winner(self, row: int, col: int) -> None:
        player = self.board[row][col]
        for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
            cells = [(row, col)]
            for sign in (-1, 1):
                r, c = row + dr * sign, col + dc * sign
                while 0 <= r < ROWS and 0 <= c < COLS and self.board[r][c] == player:
                    cells.append((r, c))
                    r, c = r + dr * sign, c + dc * sign
            if len(cells) >= WIN:
                self._winner = player
                self._winning_cells = sorted(cells[:WIN])
                return

    # ---------- AI (negamax + alpha-beta) ----------

    def best_move(self, depth: int = 5) -> int:
        moves = self.legal_moves()
        if not moves:
            raise ValueError("no legal moves")
        best_col, best_score = moves[0], -10**9
        for col in moves:
            self.drop(col)
            score = -self._negamax(depth - 1, -10**9, 10**9)
            self.undo()
            if score > best_score:
                best_col, best_score = col, score
        return best_col

    def _negamax(self, depth: int, alpha: int, beta: int) -> int:
        st = self.status()
        if st.over:
            if st.winner is None:
                return 0
            return -(1000 + depth)  # winning sooner scores higher
        if depth == 0:
            return self._heuristic()
        best = -10**9
        for col in self.legal_moves():
            self.drop(col)
            score = -self._negamax(depth - 1, -beta, -alpha)
            self.undo()
            if score > best:
                best = score
            alpha = max(alpha, score)
            if alpha >= beta:
                break
        return best

    def _heuristic(self) -> int:
        """Count open three-in-a-rows and center control for the side to move."""
        me = self.current_player
        score = 0
        for row in range(ROWS):
            for col in range(COLS // 2):
                if self.board[row][col] == me:
                    score += 1
        lines = self._scan_lines(me)
        score += 5 * lines.get(3, 0)
        opp = PLAYER2 if me == PLAYER1 else PLAYER1
        score -= 5 * self._scan_lines(opp).get(3, 0)
        return score

    def _scan_lines(self, player: int) -> dict[int, int]:
        counts: dict[int, int] = {}
        for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
            for r in range(ROWS):
                for c in range(COLS):
                    if self.board[r][c] != player:
                        continue
                    run = 0
                    rr, cc = r, c
                    while 0 <= rr < ROWS and 0 <= cc < COLS and self.board[rr][cc] == player:
                        run += 1
                        rr += dr
                        cc += dc
                    if run >= 2:
                        counts[run] = counts.get(run, 0) + 1
        return counts

    # ---------- presentation ----------

    def ascii(self) -> str:
        lines = []
        for row in reversed(range(ROWS)):
            lines.append("| " + " ".join(
                {0: ".", 1: "X", 2: "O"}[self.board[row][col]] for col in range(COLS)) + " |")
        lines.append("| " + " ".join(str(c + 1) for c in range(COLS)) + " |")
        return "\n".join(lines)


def simulate(ai_depth: int = 5, bot_depth: int = 2, log: bool = True) -> dict:
    """Play a full game: AI (X, player 1) vs Bot (O, player 2)."""
    game = FourInARow()
    record: list[tuple[int, int]] = []
    while not game.status().over:
        depth = ai_depth if game.current_player == PLAYER1 else bot_depth
        col = game.best_move(depth)
        game.drop(col)
        record.append((game.current_player, col + 1))
    st = game.status()
    result = {
        "plies": len(record),
        "moves": [c for _, c in record],
        "winner": st.winner,
    }
    if log:
        for player, col in record:
            who = "AI" if player == PLAYER1 else "Bot"
            print(f"{who} drops col {col}")
        print(game.ascii())
        print(f"result: winner = player {st.winner}" if st.winner else "result: draw")
    return result


def play_cli(difficulty: str = "medium") -> None:
    """Interactive game: human (X) vs AI (O). Columns are entered 1-7."""
    depths = {"easy": 1, "medium": 3, "hard": 5}
    ai_depth = depths.get(difficulty, 3)
    game = FourInARow()
    print(f"four in a row CLI — difficulty: {difficulty} (AI depth {ai_depth})")
    print("commands: 1-7 drop a disc | u undo | q quit\n")
    while not game.status().over:
        if game.current_player == PLAYER1:
            print(game.ascii())
            try:
                line = input("your column> ").strip()
            except EOFError:
                line = "q"
            if line == "q":
                print("bye")
                return
            if line == "u":
                if game.undo():
                    game.undo()  # also undo the AI's reply
                    print("undone")
                else:
                    print("nothing to undo")
                continue
            if not line.isdigit() or int(line) not in range(1, COLS + 1):
                legal = ", ".join(str(c + 1) for c in game.legal_moves())
                print(f"invalid column (legal: {legal})")
                continue
            col = int(line) - 1
            if col not in game.legal_moves():
                print("that column is full")
                continue
            game.drop(col)
        else:
            col = game.best_move(ai_depth)
            game.drop(col)
            print(f"AI drops col {col + 1}")
    print(game.ascii())
    st = game.status()
    print(f"you win!" if st.winner == PLAYER1 else "AI wins!" if st.winner else "draw")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "simulate":
        ai_depth = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        bot_depth = int(sys.argv[3]) if len(sys.argv) > 3 else 2
        print(f"Four in a row: AI (X, depth {ai_depth}) vs Bot (O, depth {bot_depth})")
        simulate(ai_depth, bot_depth)
        return
    if len(sys.argv) > 1 and sys.argv[1] == "play":
        play_cli(sys.argv[2] if len(sys.argv) > 2 else "medium")
        return

    game = FourInARow()
    print("Four in a row: scripted game (X = player 1, O = AI)")
    scripted = [3, 3, 4, 4, 2, 5]  # X builds a diagonal while O pushes center
    for col in scripted:
        if col not in game.legal_moves():
            break
        game.drop(col)
        print(f"drop col {col + 1} ->")
        print(game.ascii())

    # AI closes out the game from any position
    while not game.status().over:
        col = game.best_move(depth=5)
        game.drop(col)
        print(f"AI drops col {col + 1} ->")
        print(game.ascii())

    st = game.status()
    if st.winner is not None:
        print(f"winner: player {st.winner}, line: {st.winning_cells}")
    else:
        print("draw")

    # AI self-play sanity: game always terminates with a result
    g2 = FourInARow()
    plies = 0
    while not g2.status().over and plies < 42:
        g2.drop(g2.best_move(depth=4))
        plies += 1
    print(f"self-play: plies={plies}, status={g2.status()}")


if __name__ == "__main__":
    main()
