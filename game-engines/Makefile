# game-engines — build, test, simulate and play every engine.
#
# Difficulty presets used by the AI-vs-bot cases:
#   easy   — shallow search, near-random play
#   medium — decent tactical strength
#   hard   — deepest search affordable for a snappy demo
#
# Common variables:
#   DIFF   — easy | medium | hard          (default: medium)
#
# Examples:
#   make test                 # all engine demos + rule checks + web smoke test
#   make simulate-hard        # AI-vs-bot cases at full strength
#   make play-chess DIFF=hard # interactive chess against the AI
#   make web                  # Svelte web interface (dev server)

DIFF ?= medium

SUDOKU_BIN := sudoku/sudoku
JAVA_CLASSES := reversi/Reversi.class

.PHONY: all build test test-easy test-medium test-hard simulate simulate-easy \
        simulate-medium simulate-hard test-cli play-chess play-chinese-chess \
        play-four-in-a-row play-sequence play-sudoku play-reversi \
        web web-build web-test clean

all: build

build: $(SUDOKU_BIN) $(JAVA_CLASSES)

$(SUDOKU_BIN): sudoku/sudoku.c
	gcc -O2 -Wall -Wextra -o $@ $<

$(JAVA_CLASSES): reversi/Reversi.java
	cd reversi && javac Reversi.java

# ---------- engine self-tests ----------

test: build
	node chess/chess-demo.ts | tail -4
	python3 four-in-a-row/four_in_a_row.py | tail -2
	cd chinese-chess && go vet . && go run . | tail -1
	php -n sequence/sequence.php | tail -1
	! $(SUDOKU_BIN) | grep -q "NO (bug)"
	java -cp reversi Reversi | grep "rule checks"
	node scripts/perft.ts
	node scripts/web-smoke.ts | tail -1

# ---------- AI-vs-bot difficulty cases ----------

simulate: simulate-easy simulate-medium simulate-hard

simulate-easy:
	node chess/chess-simulate.ts 1 2 | tail -2
	python3 four-in-a-row/four_in_a_row.py simulate 2 2 | tail -1
	cd chinese-chess && go run . simulate 1 1 | tail -1
	php -n sequence/sequence.php simulate 0 7 | tail -1
	$(SUDOKU_BIN) simulate 5 | tail -1
	java -cp reversi Reversi simulate 2 | tail -1

simulate-medium:
	node chess/chess-simulate.ts 2 2 | tail -2
	python3 four-in-a-row/four_in_a_row.py simulate 4 2 | tail -1
	cd chinese-chess && go run . simulate 2 1 | tail -1
	php -n sequence/sequence.php simulate 2 | tail -1
	$(SUDOKU_BIN) simulate 8 | tail -1
	java -cp reversi Reversi simulate 4 | tail -1

simulate-hard:
	node chess/chess-simulate.ts 3 2 | tail -2
	python3 four-in-a-row/four_in_a_row.py simulate 6 2 | tail -1
	cd chinese-chess && go run . simulate 3 2 | tail -1
	php -n sequence/sequence.php simulate 2 | tail -1
	$(SUDOKU_BIN) simulate 11 | tail -1
	java -cp reversi Reversi simulate 6 | tail -1

# aliases: "make test-hard" == "make simulate-hard"
test-easy: simulate-easy
test-medium: simulate-medium
test-hard: simulate-hard

# ---------- scripted CLI tests (headless) ----------

test-cli: build
	printf 'e2e4\nb8c6\nu\nd2d4\ng1f3\nq\n' | node chess/chess-cli.ts medium | grep -q "undone"
	printf '4\n4\n5\nu\n5\n9\n3\nq\n' | python3 four-in-a-row/four_in_a_row.py play easy 2>/dev/null | grep -q "AI drops"
	cd chinese-chess && printf '1,7 4,7\nbad input\n0,6 0,5\nq\n' | go run . play easy 2>/dev/null | grep -q "AI plays"
	printf 'p 0 6 2\nq\n' | php -n sequence/sequence.php play hard | grep -q "AI:"
	printf 'hint\n1 1 1\ncheck\nq\n' | $(SUDOKU_BIN) play easy | grep -q "AI hint"
	printf '2 3\nbad\n5 4\n0 0\nq\n' | java -cp reversi Reversi play easy | grep -q "AI plays"

# ---------- interactive play (human vs AI) ----------

play-chess:
	node chess/chess-cli.ts $(DIFF)

play-chinese-chess:
	cd chinese-chess && go run . play $(DIFF)

play-four-in-a-row:
	python3 four-in-a-row/four_in_a_row.py play $(DIFF)

play-sequence:
	php -n sequence/sequence.php play $(DIFF)

play-sudoku: build
	$(SUDOKU_BIN) play $(DIFF)

play-reversi: build
	java -cp reversi Reversi play $(DIFF)

# ---------- web interface ----------

web:
	cd web && npx vite --host

web-build:
	cd web && npx vite build

web-test:
	node scripts/web-smoke.ts

# ---------- housekeeping ----------

clean:
	rm -f $(SUDOKU_BIN) reversi/Reversi.class 'reversi/Reversi$$Move.class' web/dist -r
