// Reversi (Othello) engine — Java
// Difficulty: 3/5 (directional flanking flips, pass handling)
//
// Rules implemented: standard 8x8 Othello. A legal move must flank a
// straight line of opponent discs against one of the mover's own discs;
// all flanked discs flip. A player with no legal move passes; the game
// ends when neither player can move. The standard start has the central
// 2x2 square set (white on the two diagonals' ends) and black moving first.
//
// Build & run: javac Reversi.java && java Reversi

import java.util.ArrayList;
import java.util.List;

public class Reversi {

    public static final int SIZE = 8;
    public static final int EMPTY = 0;
    public static final int BLACK = 1; // moves first
    public static final int WHITE = 2;

    public record Move(int row, int col, List<int[]> flips) {
        @Override
        public String toString() {
            return "(" + col + "," + row + ")";
        }
    }

    private final int[][] board = new int[SIZE][SIZE];
    private int currentPlayer;

    public Reversi() {
        board[3][3] = WHITE;
        board[4][4] = WHITE;
        board[3][4] = BLACK;
        board[4][3] = BLACK;
        currentPlayer = BLACK;
    }

    // ---------- queries ----------

    public int currentPlayer() {
        return currentPlayer;
    }

    public int discAt(int row, int col) {
        return board[row][col];
    }

    public int[] scores() {
        int black = 0, white = 0;
        for (int[] row : board) {
            for (int d : row) {
                if (d == BLACK) black++;
                else if (d == WHITE) white++;
            }
        }
        return new int[]{black, white};
    }

    /** Legal moves for the given player: squares that flip at least one disc. */
    public List<Move> legalMoves(int player) {
        List<Move> moves = new ArrayList<>();
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                List<int[]> flips = flipsFor(r, c, player);
                if (flips != null) {
                    moves.add(new Move(r, c, flips));
                }
            }
        }
        return moves;
    }

    /** Flips that placing `player` at (r,c) would cause, or null if illegal. */
    private List<int[]> flipsFor(int r, int c, int player) {
        if (board[r][c] != EMPTY) {
            return null;
        }
        List<int[]> all = new ArrayList<>();
        for (int dr = -1; dr <= 1; dr++) {
            for (int dc = -1; dc <= 1; dc++) {
                if (dr == 0 && dc == 0) continue;
                List<int[]> line = new ArrayList<>();
                int rr = r + dr, cc = c + dc;
                while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE
                        && board[rr][cc] == opponent(player)) {
                    line.add(new int[]{rr, cc});
                    rr += dr;
                    cc += dc;
                }
                if (!line.isEmpty() && rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE
                        && board[rr][cc] == player) {
                    all.addAll(line); // line is anchored by our disc
                }
            }
        }
        return all.isEmpty() ? null : all;
    }

    private static int opponent(int player) {
        return player == BLACK ? WHITE : BLACK;
    }

    // ---------- playing ----------

    /** Apply a move for the current player if legal; auto-pass otherwise. */
    public boolean play(Move move) {
        List<int[]> flips = flipsFor(move.row(), move.col(), currentPlayer);
        if (flips == null) {
            return false;
        }
        applyFlips(move.row(), move.col(), flips, currentPlayer);
        nextTurn();
        return true;
    }

    private void applyFlips(int r, int c, List<int[]> flips, int player) {
        board[r][c] = player;
        for (int[] f : flips) {
            board[f[0]][f[1]] = player;
        }
    }

    /** Advance the turn, passing over players with no legal move. */
    private void nextTurn() {
        int next = opponent(currentPlayer);
        if (!legalMoves(next).isEmpty()) {
            currentPlayer = next;
        } else if (!legalMoves(currentPlayer).isEmpty()) {
            // opponent must pass; current player moves again
        } else {
            gameOver = true; // nobody can move
        }
    }

    private boolean gameOver = false;

    public boolean isOver() {
        return gameOver;
    }

    /** Winner: BLACK, WHITE, or 0 for a draw (only meaningful when over). */
    public int winner() {
        if (!gameOver) {
            return -1;
        }
        int[] s = scores();
        if (s[0] > s[1]) return BLACK;
        if (s[1] > s[0]) return WHITE;
        return 0;
    }

    // ---------- bot (negamax + alpha-beta) ----------

    // standard Othello positional weights: corners good, X/C squares bad
    private static final int[][] WEIGHTS = {
        {120, -20,  20,   5,   5,  20, -20, 120},
        {-20, -40,  -5,  -5,  -5,  -5, -40, -20},
        { 20,  -5,  15,   3,   3,  15,  -5,  20},
        {  5,  -5,   3,   3,   3,   3,  -5,   5},
        {  5,  -5,   3,   3,   3,   3,  -5,   5},
        { 20,  -5,  15,   3,   3,  15,  -5,  20},
        {-20, -40,  -5,  -5,  -5,  -5, -40, -20},
        {120, -20,  20,   5,   5,  20, -20, 120},
    };

    /** Static evaluation from the perspective of `player`. */
    int evaluate(int player) {
        int mine = 0, theirs = 0;
        int myMoves = legalMoves(player).size();
        int oppMoves = legalMoves(opponent(player)).size();
        for (int r = 0; r < SIZE; r++) {
            for (int c = 0; c < SIZE; c++) {
                int d = board[r][c];
                if (d == player) mine += WEIGHTS[r][c];
                else if (d == opponent(player)) theirs += WEIGHTS[r][c];
            }
        }
        return mine - theirs + 2 * (myMoves - oppMoves);
    }

    /** Terminal score from the perspective of `player`. */
    private int finalScore(int player) {
        int[] s = scores();
        int me = player == BLACK ? s[0] : s[1];
        int them = player == BLACK ? s[1] : s[0];
        if (me > them) return 100000 + (me - them);
        if (me < them) return -100000 - (them - me);
        return 0;
    }

    /** search-local apply/undo (no pass handling: negamax treats it) */
    private void apply(Move m) {
        applyFlips(m.row(), m.col(), m.flips(), currentPlayer);
        currentPlayer = opponent(currentPlayer);
    }

    private void undo(Move m) {
        currentPlayer = opponent(currentPlayer); // back to the mover
        board[m.row()][m.col()] = EMPTY;
        for (int[] f : m.flips()) {
            board[f[0]][f[1]] = opponent(currentPlayer);
        }
    }

    private int negamax(int depth, int alpha, int beta) {
        int player = currentPlayer;
        List<Move> moves = legalMoves(player);
        if (moves.isEmpty()) {
            if (legalMoves(opponent(player)).isEmpty()) {
                return finalScore(player); // nobody can move: game over
            }
            currentPlayer = opponent(currentPlayer); // pass
            int score = -negamax(depth, -beta, -alpha);
            currentPlayer = player;
            return score;
        }
        if (depth == 0) {
            return evaluate(player);
        }
        int best = Integer.MIN_VALUE;
        for (Move m : moves) {
            apply(m);
            int score = -negamax(depth - 1, -beta, -alpha);
            undo(m);
            if (score > best) best = score;
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;
        }
        return best;
    }

    /** Pick a move for the side to move at the given search depth. */
    Move chooseMove(int depth) {
        List<Move> moves = legalMoves(currentPlayer);
        if (moves.isEmpty()) return null;
        Move best = moves.get(0);
        int bestScore = Integer.MIN_VALUE;
        for (Move m : moves) {
            apply(m);
            int score = -negamax(depth - 1, Integer.MIN_VALUE / 2, Integer.MAX_VALUE / 2);
            undo(m);
            if (score > bestScore) {
                bestScore = score;
                best = m;
            }
        }
        return best;
    }

    /** Greedy bot: take the move that flips the most discs right now. */
    Move greedyMove() {
        List<Move> moves = legalMoves(currentPlayer);
        if (moves.isEmpty()) return null;
        Move best = moves.get(0);
        for (Move m : moves) {
            if (m.flips().size() > best.flips().size()) best = m;
        }
        return best;
    }

    // ---------- AI-vs-bot simulation ----------

    /** Play AI (black, depth `aiDepth`) vs Bot (white, greedy) to the end. */
    void simulate(int aiDepth, boolean log) {
        System.out.printf("Reversi: AI (black, depth %d) vs Bot (white, greedy)%n", aiDepth);
        int plies = 0;
        while (!isOver() && plies < 70) {
            Move m = currentPlayer == BLACK ? chooseMove(aiDepth) : greedyMove();
            if (m == null) break; // handled by pass logic inside play()
            int who = currentPlayer;
            List<int[]> flips = m.flips();
            play(m);
            plies++;
            if (log) {
                System.out.printf("%s plays %s (flips %d)%n",
                        who == BLACK ? "AI" : "Bot", m, flips.size());
            }
        }
        int[] s = scores();
        String result = !isOver() ? "aborted (ply limit)"
                : winner() == BLACK ? "AI (black) wins"
                : winner() == WHITE ? "Bot (white) wins"
                : "draw";
        System.out.println(ascii());
        System.out.printf("final: black=%d white=%d -> %s (plies=%d)%n",
                s[0], s[1], result, plies);
    }

    /** Advance the turn when the current player must pass. */
    public void passIfStuck() {
        if (legalMoves(currentPlayer).isEmpty()) {
            nextTurn();
        }
    }

    // ---------- interactive CLI (human vs AI) ----------

    private static void playCli(String[] args) {
        java.util.Map<String, Integer> depths = java.util.Map.of(
                "easy", 1, "medium", 3, "hard", 5);
        String difficulty = args.length > 1 ? args[1] : "medium";
        int aiDepth = depths.getOrDefault(difficulty, 3);

        Reversi game = new Reversi();
        System.out.printf("reversi CLI — difficulty: %s (AI depth %d), you play black%n",
                difficulty, aiDepth);
        System.out.println("commands: <row> <col> | q quit (you pass automatically when stuck)");

        java.util.Scanner in = new java.util.Scanner(System.in);
        while (!game.isOver()) {
            System.out.println(game.ascii());
            int[] s = game.scores();
            System.out.printf("(black=%d white=%d)%n", s[0], s[1]);
            if (game.currentPlayer() == BLACK) {
                if (game.legalMoves(BLACK).isEmpty()) {
                    System.out.println("you have no moves — passing");
                    game.passIfStuck();
                    continue;
                }
                System.out.print("your move (row col)> ");
                if (!in.hasNextLine()) { System.out.println("\nbye"); return; }
                String line = in.nextLine().trim();
                if (line.equals("q")) { System.out.println("bye"); return; }
                String[] parts = line.split("\\s+");
                int r, c;
                try {
                    r = Integer.parseInt(parts[0]);
                    c = Integer.parseInt(parts[1]);
                } catch (Exception e) {
                    System.out.println("enter two numbers, e.g. 2 3");
                    continue;
                }
                Move chosen = null;
                for (Move m : game.legalMoves(BLACK)) {
                    if (m.row() == r && m.col() == c) chosen = m;
                }
                if (chosen == null) {
                    System.out.println("illegal square");
                    continue;
                }
                game.play(chosen);
            } else {
                Move m = game.currentPlayer() == BLACK ? null : game.chooseMove(aiDepth);
                if (m != null) {
                    System.out.printf("AI plays %s (flips %d)%n", m, m.flips().size());
                    game.play(m);
                }
            }
        }
        System.out.println(game.ascii());
        int[] s = game.scores();
        String verdict = s[0] > s[1] ? "you win!"
                : s[1] > s[0] ? "AI wins!" : "draw";
        System.out.printf("final: black=%d white=%d -> %s%n", s[0], s[1], verdict);
    }

    // ---------- presentation ----------

    public String ascii() {
        StringBuilder sb = new StringBuilder("   0 1 2 3 4 5 6 7\n");
        for (int r = 0; r < SIZE; r++) {
            sb.append(' ').append(r).append(' ');
            for (int c = 0; c < SIZE; c++) {
                char ch = switch (board[r][c]) {
                    case BLACK -> 'B';
                    case WHITE -> 'W';
                    default -> '.';
                };
                sb.append(ch).append(' ');
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    // ---------- demo ----------

    public static void main(String[] args) {
        if (args.length > 0 && args[0].equals("play")) {
            playCli(args);
            return;
        }
        if (args.length > 0 && args[0].equals("simulate")) {
            int aiDepth = args.length > 1 ? Integer.parseInt(args[1]) : 4;
            new Reversi().simulate(aiDepth, true);
            return;
        }
        Reversi game = new Reversi();
        System.out.println("Reversi: black opens (B = black, W = white)");
        System.out.println(game.ascii());

        // scripted opening: standard four opening moves
        List<Move> opening = game.legalMoves(game.currentPlayer());
        System.out.println("black's legal opening moves: " + opening);

        // play a full greedy game: both sides take the move that flips most
        int plies = 0;
        while (!game.isOver() && plies < 80) {
            List<Move> options = game.legalMoves(game.currentPlayer());
            if (options.isEmpty()) {
                break;
            }
            Move best = options.get(0);
            for (Move m : options) {
                if (m.flips().size() > best.flips().size()) {
                    best = m;
                }
            }
            int who = game.currentPlayer();
            boolean ok = game.play(best);
            if (!ok) {
                System.out.println("illegal move attempted: " + best);
                break;
            }
            plies++;
            System.out.printf("%s plays %s (flips %d)%n",
                    who == BLACK ? "B" : "W", best, best.flips().size());
        }
        System.out.println(game.ascii());
        int[] s = game.scores();
        System.out.printf("final: black=%d white=%d, over=%s, winner=%s%n",
                s[0], s[1], game.isOver(),
                game.winner() == BLACK ? "black" : game.winner() == WHITE ? "white" : "draw");

        // rule spot checks
        checks();
    }

    private static void checks() {
        int pass = 0, fail = 0;

        Reversi g = new Reversi();
        List<Move> black = g.legalMoves(BLACK);
        boolean fourOpening = black.size() == 4;
        for (Move m : black) {
            boolean ok = (m.row() == 2 && m.col() == 3) || (m.row() == 3 && m.col() == 2)
                    || (m.row() == 4 && m.col() == 5) || (m.row() == 5 && m.col() == 4);
            fourOpening &= ok;
        }
        if (fourOpening) { pass++; System.out.println("ok: black has exactly the 4 standard opening moves"); }
        else { fail++; System.out.println("FAIL: opening moves wrong: " + black); }

        // occupied square is illegal
        boolean occupiedIllegal = g.flipsFor(3, 3, BLACK) == null;
        if (occupiedIllegal) { pass++; System.out.println("ok: occupied square rejected"); }
        else { fail++; System.out.println("FAIL: occupied square accepted"); }

        // a player with no legal move is skipped
        Reversi h = new Reversi();
        for (int r = 0; r < SIZE; r++) {
            java.util.Arrays.fill(h.board[r], EMPTY);
        }
        h.board[0][0] = BLACK;
        h.board[0][1] = BLACK;
        h.board[0][2] = WHITE;
        boolean whiteStuck = h.legalMoves(WHITE).isEmpty();
        boolean blackMoves = !h.legalMoves(BLACK).isEmpty();
        if (whiteStuck && blackMoves) { pass++; System.out.println("ok: pass situation detected"); }
        else { fail++; System.out.println("FAIL: pass situation wrong"); }

        // playing d3 in the opening flips exactly one disc
        Reversi k = new Reversi();
        Move d3 = k.legalMoves(BLACK).stream()
                .filter(m -> m.row() == 2 && m.col() == 3)
                .findFirst().orElse(null);
        boolean flipsOne = d3 != null && d3.flips().size() == 1;
        if (flipsOne) { pass++; System.out.println("ok: d3 flips exactly one disc"); }
        else { fail++; System.out.println("FAIL: d3 flip count wrong"); }

        // a flanking move flips every disc in the bracketed line
        Reversi l = new Reversi();
        for (int r = 0; r < SIZE; r++) {
            java.util.Arrays.fill(l.board[r], EMPTY);
        }
        l.board[3][0] = BLACK;
        l.board[3][1] = WHITE;
        l.board[3][2] = WHITE;
        Move triple = l.legalMoves(BLACK).stream()
                .filter(m -> m.row() == 3 && m.col() == 3)
                .findFirst().orElse(null);
        boolean flipsTwo = triple != null && triple.flips().size() == 2;
        if (flipsTwo) { pass++; System.out.println("ok: bracketed line of two flips"); }
        else { fail++; System.out.println("FAIL: bracketed line flip count wrong"); }

        System.out.printf("rule checks: %d passed, %d failed%n", pass, fail);
    }
}
