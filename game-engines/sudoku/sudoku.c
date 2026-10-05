/*
 * Sudoku engine — C
 * Difficulty: 4/5 (constraint propagation, unique-solution generation)
 *
 * Implemented: a 9x9 sudoku engine with
 *   - validation of moves (row/column/box conflicts),
 *   - solving via backtracking with candidate pruning,
 *   - solution counting (early exit at 2) to test uniqueness,
 *   - puzzle generation: fill a full grid with a seeded RNG, then dig
 *     holes while keeping the solution unique. Difficulty is controlled
 *     by the number of clues left behind.
 *
 * Board convention: grid[row][col], digits 1-9, 0 = empty.
 *
 * Build: gcc -O2 -o sudoku sudoku.c && ./sudoku
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define N 9

/* deterministic RNG (xorshift32) so puzzles are reproducible */
static unsigned int rng_state = 12345u;

static unsigned int rnd(unsigned int n) {
    rng_state ^= rng_state << 13;
    rng_state ^= rng_state >> 17;
    rng_state ^= rng_state << 5;
    return rng_state % n;
}

/* ---------- validation ---------- */

static int box_of(int r, int c) { return (r / 3) * 3 + c / 3; }

/* is placing digit d at (r,c) consistent with current grid? */
int can_place(const int grid[N][N], int r, int c, int d) {
    for (int i = 0; i < N; i++) {
        if (grid[r][i] == d) return 0; /* row */
        if (grid[i][c] == d) return 0; /* column */
        if (grid[(r / 3) * 3 + i / 3][(c / 3) * 3 + i % 3] == d) return 0; /* box */
    }
    return 1;
}

int is_valid_grid(const int grid[N][N]) {
    int rows[N][N] = {0}, cols[N][N] = {0}, boxes[N][N] = {0};
    for (int r = 0; r < N; r++) {
        for (int c = 0; c < N; c++) {
            int d = grid[r][c];
            if (d == 0) continue;
            int b = box_of(r, c);
            if (rows[r][d - 1] || cols[c][d - 1] || boxes[b][d - 1]) return 0;
            rows[r][d - 1] = cols[c][d - 1] = boxes[b][d - 1] = 1;
        }
    }
    return 1;
}

/* ---------- solving ---------- */

/* count solutions up to `limit`; solution (if any) written to out. */
static int solve_rec(int grid[N][N], int out[N][N], int limit) {
    /* find the cell with the fewest candidates (MRV) */
    int best_r = -1, best_c = -1, best_count = N + 1;
    int cand[N][N] = {0};
    (void)cand;
    for (int r = 0; r < N; r++) {
        for (int c = 0; c < N; c++) {
            if (grid[r][c] != 0) continue;
            int count = 0;
            for (int d = 1; d <= N; d++)
                if (can_place(grid, r, c, d)) count++;
            if (count == 0) return 0; /* dead end */
            if (count < best_count) {
                best_count = count;
                best_r = r;
                best_c = c;
                if (count == 1) goto found;
            }
        }
    }
found:
    if (best_r == -1) { /* solved */
        if (out != NULL) memcpy(out, grid, sizeof(int) * N * N);
        return 1;
    }
    int total = 0;
    for (int d = 1; d <= N && total < limit; d++) {
        if (!can_place(grid, best_r, best_c, d)) continue;
        grid[best_r][best_c] = d;
        total += solve_rec(grid, out, limit - total);
        grid[best_r][best_c] = 0;
    }
    return total;
}

/* Solve in place; returns 1 if a solution exists. */
int solve(int grid[N][N]) {
    int out[N][N];
    int found = solve_rec(grid, out, 1) == 1;
    if (found) memcpy(grid, out, sizeof(out));
    return found;
}

/* Number of solutions, capped at 2 (enough to test uniqueness). */
int count_solutions(int grid[N][N]) {
    int copy[N][N], out[N][N];
    memcpy(copy, grid, sizeof(copy));
    return solve_rec(copy, out, 2);
}

/* ---------- generation ---------- */

/* fill an empty grid into a random complete solution */
static void fill_grid(int grid[N][N]) {
    memset(grid, 0, sizeof(int) * N * N);
    /* seed a few random cells, then solve to completion */
    for (int k = 0; k < 11; k++) {
        int r = (int)rnd(N), c = (int)rnd(N);
        int d = 1 + (int)rnd(N);
        if (grid[r][c] == 0 && can_place(grid, r, c, d))
            grid[r][c] = d;
    }
    int full[N][N];
    if (solve_rec(grid, full, 1) == 1)
        memcpy(grid, full, sizeof(full));
}

/* dig holes until `clues` remain, keeping the solution unique */
static void dig(int puzzle[N][N], int clues) {
    int order[N * N];
    for (int i = 0; i < N * N; i++) order[i] = i;
    for (int i = N * N - 1; i > 0; i--) { /* shuffle */
        int j = (int)rnd(i + 1);
        int t = order[i]; order[i] = order[j]; order[j] = t;
    }
    int remaining = N * N;
    for (int i = 0; i < N * N && remaining > clues; i++) {
        int r = order[i] / N, c = order[i] % N;
        int saved = puzzle[r][c];
        if (saved == 0) continue;
        puzzle[r][c] = 0;
        int copy[N][N];
        memcpy(copy, puzzle, sizeof(copy));
        if (solve_rec(copy, NULL, 2) != 1) {
            puzzle[r][c] = saved; /* not unique anymore: restore */
        } else {
            remaining--;
        }
    }
}

/* Generate a puzzle with the given clue count into puzzle/solution.
 * Returns the actual number of clues (may exceed the target if the
 * uniqueness constraint forces more). */
int generate(int puzzle[N][N], int solution[N][N], int clues, unsigned int seed) {
    rng_state = seed ? seed : 1u;
    fill_grid(solution);
    memcpy(puzzle, solution, sizeof(int) * N * N);
    dig(puzzle, clues);
    int n = 0;
    for (int r = 0; r < N; r++)
        for (int c = 0; c < N; c++)
            if (puzzle[r][c]) n++;
    return n;
}

/* ---------- presentation ---------- */

void print_grid(const int grid[N][N]) {
    for (int r = 0; r < N; r++) {
        if (r % 3 == 0) printf("+-------+-------+-------+\n");
        for (int c = 0; c < N; c++) {
            if (c % 3 == 0) printf("| ");
            printf("%d ", grid[r][c] ? grid[r][c] : 0);
        }
        printf("|\n");
    }
    printf("+-------+-------+-------+\n");
}

/* ---------- simulation: solver AI vs generator bot ----------
 *
 * Each round the "bot" (generator) plants a puzzle with a decreasing clue
 * target (harder and harder to keep unique), and the "AI" (solver) must
 * solve it. Reports per-round results and totals.
 */
static double seconds_since(clock_t start) {
    return (double)(clock() - start) / CLOCKS_PER_SEC;
}

static void simulate(int rounds) {
    printf("Sudoku: solver AI vs generator bot, %d rounds\n", rounds);
    int solved_count = 0, unique_count = 0, clue_total = 0;
    for (int round = 1; round <= rounds; round++) {
        int clues_target = 45 - 2 * (round - 1); /* 45, 43, 41, ... */
        if (clues_target < 24) clues_target = 24;
        int puzzle[N][N], solution[N][N];
        unsigned int seed = 1000u + (unsigned int)round * 7919u;
        int clues = generate(puzzle, solution, clues_target, seed);

        int copy[N][N];
        memcpy(copy, puzzle, sizeof(copy));
        clock_t start = clock();
        int unique = count_solutions(copy);
        int solved = solve(copy);
        double secs = seconds_since(start);

        int correct = solved && memcmp(copy, solution, sizeof(copy)) == 0;
        solved_count += correct;
        unique_count += (unique == 1);
        clue_total += clues;
        printf("round %2d: bot planted %2d clues, unique=%s, AI solved=%s, correct=%s (%.3fs)\n",
               round, clues, unique == 1 ? "yes" : "no",
               solved ? "yes" : "no", correct ? "yes" : "NO",
               secs);
    }
    printf("totals: %d/%d solved correctly, %d/%d unique, avg clues %.1f\n",
           solved_count, rounds, unique_count, rounds,
           (double)clue_total / rounds);
}

/* ---------- interactive CLI (human vs puzzle, AI = solver hints) ---------- */

static void print_grid_user(const int grid[N][N], const int given[N][N]) {
    for (int r = 0; r < N; r++) {
        if (r % 3 == 0) printf("+-------+-------+-------+\n");
        for (int c = 0; c < N; c++) {
            if (c % 3 == 0) printf("| ");
            if (grid[r][c] == 0) printf(". ");
            else printf("%d%s ", grid[r][c], given[r][c] ? "" : "");
        }
        printf("|\n");
    }
    printf("+-------+-------+-------+\n");
}

/* can_place ignoring the cell itself (for conflict checking) */
static int can_place_with_exceptions(const int grid[N][N], int r, int c) {
    int d = grid[r][c];
    for (int i = 0; i < N; i++) {
        if (i == c) continue;
        if (grid[r][i] == d) return 0;
        if (i == r) continue;
        if (grid[i][c] == d) return 0;
        int br = (r / 3) * 3 + i / 3, bc = (c / 3) * 3 + i % 3;
        if (br == r && bc == c) continue;
        if (grid[br][bc] == d) return 0;
    }
    return 1;
}

static int play_cli(const char *difficulty) {
    int clues_target = 45;
    if (strcmp(difficulty, "medium") == 0) clues_target = 35;
    if (strcmp(difficulty, "hard") == 0) clues_target = 26;
    int puzzle[N][N], solution[N][N], work[N][N], given[N][N];
    unsigned int seed = (unsigned int)time(NULL);
    generate(puzzle, solution, clues_target, seed);
    memset(given, 0, sizeof(given));
    for (int r = 0; r < N; r++)
        for (int c = 0; c < N; c++)
            given[r][c] = puzzle[r][c] != 0;
    memcpy(work, puzzle, sizeof(work));

    printf("sudoku CLI — difficulty: %s (time-seeded puzzle)\n", difficulty);
    printf("commands: <row> <col> <digit>  | <row> <col> 0 clears\n");
    printf("          hint | solve | check | q\n\n");

    char line[128];
    while (fgets(line, sizeof(line), stdin)) {
        int filled = 0;
        for (int r = 0; r < N; r++)
            for (int c = 0; c < N; c++)
                if (work[r][c]) filled++;

        printf("\nclues+entries: %d/81\n", filled);
        print_grid_user(work, given);

        if (memcmp(work, solution, sizeof(work)) == 0) {
            printf("solved — well played!\n");
            return 0;
        }
        /* check for conflicts against the rules */
        int conflicts = 0;
        for (int r = 0; r < N && !conflicts; r++)
            for (int c = 0; c < N && !conflicts; c++)
                if (work[r][c] != 0 && !can_place_with_exceptions(work, r, c))
                    conflicts = 1;
        if (conflicts) printf("** your grid has a conflict **\n");

        printf("> ");
        line[strcspn(line, "\n")] = 0;
        if (strcmp(line, "q") == 0) { printf("bye\n"); return 0; }

        if (strcmp(line, "solve") == 0) {
            memcpy(work, solution, sizeof(work));
            printf("AI solved the puzzle:\n");
            print_grid_user(work, given);
            printf("(you gave up — the AI wins this one)\n");
            return 0;
        }
        if (strcmp(line, "check") == 0) {
            int wrong = 0;
            for (int r = 0; r < N; r++)
                for (int c = 0; c < N; c++)
                    if (!given[r][c] && work[r][c] != 0 && work[r][c] != solution[r][c])
                        wrong++;
            printf(wrong ? "%d of your entries differ from the solution\n"
                         : "all your entries are correct so far\n", wrong);
            continue;
        }
        if (strcmp(line, "hint") == 0) {
            /* AI fills the easiest single empty cell */
            int best_r = -1, best_c = -1, best_count = N + 1;
            for (int r = 0; r < N; r++)
                for (int c = 0; c < N; c++) {
                    if (work[r][c] != 0) continue;
                    int count = 0;
                    for (int d = 1; d <= N; d++)
                        if (can_place(work, r, c, d)) count++;
                    if (count > 0 && count < best_count) {
                        best_count = count; best_r = r; best_c = c;
                    }
                }
            if (best_r < 0) { printf("no hint available (check for conflicts)\n"); continue; }
            work[best_r][best_c] = solution[best_r][best_c];
            printf("AI hint: (%d,%d) = %d\n", best_r, best_c, work[best_r][best_c]);
            continue;
        }
        int r, c, d;
        if (sscanf(line, "%d %d %d", &r, &c, &d) == 3 && r >= 1 && r <= 9
                && c >= 1 && c <= 9 && d >= 0 && d <= 9) {
            r--; c--;
            if (given[r][c]) { printf("that is a given clue\n"); continue; }
            if (d == 0) { work[r][c] = 0; continue; }
            if (!can_place(work, r, c, d)) { printf("%d conflicts there\n", d); continue; }
            work[r][c] = d;
            continue;
        }
        printf("unrecognized command\n");
    }
    return 0;
}


int main(int argc, char **argv) {
    if (argc > 1 && strcmp(argv[1], "play") == 0) {
        const char *difficulty = argc > 2 ? argv[2] : "medium";
        return play_cli(difficulty);
    }
    if (argc > 1 && strcmp(argv[1], "simulate") == 0) {
        int rounds = argc > 2 ? atoi(argv[2]) : 10;
        if (rounds < 1) rounds = 1;
        simulate(rounds);
        return 0;
    }

    int puzzle[N][N], solution[N][N];

    puts("easy puzzle (target 40 clues):");
    int clues = generate(puzzle, solution, 40, 20260101u);
    printf("clues: %d, unique solution: %s\n", clues,
           count_solutions(puzzle) == 1 ? "yes" : "NO (bug)");
    print_grid(puzzle);

    int work[N][N];
    memcpy(work, puzzle, sizeof(work));
    int ok = solve(work);
    printf("solved: %s, matches planted solution: %s\n",
           ok ? "yes" : "no",
           memcmp(work, solution, sizeof(work)) == 0 ? "yes" : "NO (bug)");

    puts("hard puzzle (target 26 clues):");
    clues = generate(puzzle, solution, 26, 77u);
    printf("clues: %d, unique solution: %s\n", clues,
           count_solutions(puzzle) == 1 ? "yes" : "NO (bug)");
    print_grid(puzzle);

    /* validation checks */
    int bad[N][N];
    memcpy(bad, solution, sizeof(bad));
    bad[0][0] = bad[0][1]; /* duplicate in the same row */
    printf("conflicting grid rejected: %s\n", is_valid_grid(bad) ? "NO (bug)" : "yes");

    int partial[N][N];
    memset(partial, 0, sizeof(partial));
    partial[4][4] = 5;
    printf("can_place sanity: %s\n",
           can_place(partial, 4, 4, 5) == 0 && can_place(partial, 4, 5, 5) == 0 &&
           can_place(partial, 5, 5, 5) == 0 ? "yes" : "NO (bug)");

    /* determinism: same seed -> identical puzzle and solution */
    int p1[N][N], s1[N][N], p2[N][N], s2[N][N];
    generate(p1, s1, 40, 99u);
    generate(p2, s2, 40, 99u);
    printf("deterministic generation: %s\n",
           memcmp(p1, p2, sizeof(p1)) == 0 && memcmp(s1, s2, sizeof(s1)) == 0
               ? "yes" : "NO (bug)");

    /* the planted solution really solves the puzzle */
    int check[N][N];
    memcpy(check, p1, sizeof(check));
    solve(check);
    printf("puzzle solves to planted solution: %s\n",
           memcmp(check, s1, sizeof(check)) == 0 ? "yes" : "NO (bug)");

    return 0;
}
