// Xiangqi (Chinese chess) engine — Go
// Difficulty: 5/5 (piece-specific leg rules, palace/river geometry, flying general)
//
// Rules implemented: full xiangqi rules on a 9x10 board.
//   - General: one orthogonal step inside the palace. The "flying general"
//     rule (two generals facing each other on an open file) is treated as
//     check: any move that leaves the generals facing is illegal.
//   - Advisor: one diagonal step inside the palace.
//   - Elephant: two diagonal steps, blocked by the "elephant eye", cannot
//     cross the river.
//   - Horse: moves like a knight, blocked by the "hobbling leg" square.
//   - Chariot: moves like a rook.
//   - Cannon: moves like a chariot but captures only by jumping exactly one
//     screen piece of either color.
//   - Soldier: one step forward; after crossing the river also one step
//     sideways; never backward.
//   - Check, checkmate, and stalemate (stalemate is a loss in xiangqi).
// Not modeled: perpetual-check / repetition rules.
//
// Board layout: board[rank][file], rank 0 = black back rank (top),
// rank 9 = red back rank (bottom), files 0-8 left to right. Red moves first.
package main

import (
	"bufio"
	"fmt"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Color byte

const (
	Red   Color = 'r'
	Black Color = 'b'
)

// Piece letters: K general, A advisor, E elephant, H horse, R chariot,
// C cannon, P soldier. Uppercase = red, lowercase = black, 0 = empty.
type Piece byte

type Move struct {
	FromRank, FromFile, ToRank, ToFile int
}

func (m Move) String() string {
	return fmt.Sprintf("(%d,%d)->(%d,%d)", m.FromFile, m.FromRank, m.ToFile, m.ToRank)
}

type Engine struct {
	board [10][9]Piece
	turn  Color
}

type undoInfo struct {
	captured Piece
}

func pieceColor(p Piece) Color {
	if p >= 'a' && p <= 'z' {
		return Black
	}
	return Red
}

func upper(p Piece) Piece {
	if p >= 'a' && p <= 'z' {
		return p - 32
	}
	return p
}

func NewEngine() *Engine {
	e := &Engine{turn: Red}
	back := [9]Piece{'R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'}
	for f := 0; f < 9; f++ {
		e.board[9][f] = back[f]
		e.board[0][f] = back[f] + 32 // lowercase = black
	}
	e.board[7][1], e.board[7][7] = 'C', 'C'
	e.board[2][1], e.board[2][7] = 'c', 'c'
	for _, f := range []int{0, 2, 4, 6, 8} {
		e.board[6][f] = 'P'
		e.board[3][f] = 'p'
	}
	return e
}

// ---------- geometry helpers ----------

func inPalace(rank, file int, c Color) bool {
	if file < 3 || file > 5 {
		return false
	}
	if c == Red {
		return rank >= 7 && rank <= 9
	}
	return rank >= 0 && rank <= 2
}

// ownSide: true if rank is on c's side of the river (ranks 5-9 red, 0-4 black).
func ownSide(rank int, c Color) bool {
	if c == Red {
		return rank >= 5
	}
	return rank <= 4
}

func (e *Engine) at(rank, file int) Piece {
	if rank < 0 || rank > 9 || file < 0 || file > 8 {
		return 0
	}
	return e.board[rank][file]
}

// ---------- move generation ----------

func (e *Engine) pseudoLegal(c Color) []Move {
	var moves []Move
	for r := 0; r < 10; r++ {
		for f := 0; f < 9; f++ {
			p := e.board[r][f]
			if p == 0 || pieceColor(p) != c {
				continue
			}
			switch upper(p) {
			case 'K':
				e.genGeneral(r, f, c, &moves)
			case 'A':
				e.genAdvisor(r, f, c, &moves)
			case 'E':
				e.genElephant(r, f, c, &moves)
			case 'H':
				e.genHorse(r, f, c, &moves)
			case 'R':
				e.genChariot(r, f, c, &moves)
			case 'C':
				e.genCannon(r, f, c, &moves)
			case 'P':
				e.genSoldier(r, f, c, &moves)
			}
		}
	}
	return moves
}

func (e *Engine) tryMove(r, f, tr, tf int, c Color, moves *[]Move) {
	if tr < 0 || tr > 9 || tf < 0 || tf > 8 {
		return // off the board (e.g. soldier advancing past the last rank)
	}
	target := e.at(tr, tf)
	if target == 0 || pieceColor(target) != c {
		*moves = append(*moves, Move{r, f, tr, tf})
	}
}

func (e *Engine) genGeneral(r, f int, c Color, moves *[]Move) {
	for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		tr, tf := r+d[0], f+d[1]
		if inPalace(tr, tf, c) {
			e.tryMove(r, f, tr, tf, c, moves)
		}
	}
}

func (e *Engine) genAdvisor(r, f int, c Color, moves *[]Move) {
	for _, d := range [][2]int{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}} {
		tr, tf := r+d[0], f+d[1]
		if inPalace(tr, tf, c) {
			e.tryMove(r, f, tr, tf, c, moves)
		}
	}
}

func (e *Engine) genElephant(r, f int, c Color, moves *[]Move) {
	for _, d := range [][2]int{{2, 2}, {2, -2}, {-2, 2}, {-2, -2}} {
		tr, tf := r+d[0], f+d[1]
		if tr < 0 || tr > 9 || tf < 0 || tf > 8 {
			continue
		}
		if !ownSide(tr, c) { // elephants never cross the river
			continue
		}
		if e.at(r+d[0]/2, f+d[1]/2) != 0 { // blocked eye
			continue
		}
		e.tryMove(r, f, tr, tf, c, moves)
	}
}

func (e *Engine) genHorse(r, f int, c Color, moves *[]Move) {
	for _, d := range [][2]int{{2, 1}, {2, -1}, {-2, 1}, {-2, -1}, {1, 2}, {1, -2}, {-1, 2}, {-1, -2}} {
		tr, tf := r+d[0], f+d[1]
		if tr < 0 || tr > 9 || tf < 0 || tf > 8 {
			continue
		}
		// hobbling leg: the square adjacent to the horse in the 2-step direction
		var lr, lf int
		if d[0] == 2 || d[0] == -2 {
			lr, lf = r+d[0]/2, f
		} else {
			lr, lf = r, f+d[1]/2
		}
		if e.at(lr, lf) != 0 {
			continue
		}
		e.tryMove(r, f, tr, tf, c, moves)
	}
}

// slide: chariot moves when stopAfterScreen is false; cannon moves (non-
// capturing slides plus screen-jump captures) when it is true.
func (e *Engine) slide(r, f, dr, df int, c Color, moves *[]Move, cannon bool) {
	tr, tf := r+dr, f+df
	for tr >= 0 && tr <= 9 && tf >= 0 && tf <= 8 {
		target := e.board[tr][tf]
		if target == 0 {
			*moves = append(*moves, Move{r, f, tr, tf})
		} else if cannon {
			// jump exactly one screen, land on the next piece beyond it
			sr, sf := tr+dr, tf+df
			for sr >= 0 && sr <= 9 && sf >= 0 && sf <= 8 {
				if p := e.board[sr][sf]; p != 0 {
					if pieceColor(p) != c {
						*moves = append(*moves, Move{r, f, sr, sf})
					}
					break
				}
				sr += dr
				sf += df
			}
			return
		} else {
			if pieceColor(target) != c {
				*moves = append(*moves, Move{r, f, tr, tf})
			}
			return
		}
		tr += dr
		tf += df
	}
}

func (e *Engine) genChariot(r, f int, c Color, moves *[]Move) {
	for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		e.slide(r, f, d[0], d[1], c, moves, false)
	}
}

func (e *Engine) genCannon(r, f int, c Color, moves *[]Move) {
	for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		e.slide(r, f, d[0], d[1], c, moves, true)
	}
}

func (e *Engine) genSoldier(r, f int, c Color, moves *[]Move) {
	fwd := -1
	if c == Black {
		fwd = 1
	}
	e.tryMove(r, f, r+fwd, f, c, moves)
	if !ownSide(r, c) { // crossed the river: sideways steps allowed
		e.tryMove(r, f, r, f-1, c, moves)
		e.tryMove(r, f, r, f+1, c, moves)
	}
}

// ---------- check / legality ----------

func (e *Engine) generalPos(c Color) (int, int) {
	for r := 0; r < 10; r++ {
		for f := 0; f < 9; f++ {
			p := e.board[r][f]
			if p != 0 && pieceColor(p) == c && upper(p) == 'K' {
				return r, f
			}
		}
	}
	return -1, -1
}

// inCheck reports whether c's general is attacked.
func (e *Engine) inCheck(c Color) bool {
	gr, gf := e.generalPos(c)
	if gr < 0 {
		return false
	}
	return e.inCheckFrom(c, gr, gf)
}

// inCheckFrom is inCheck with the general's position supplied by the caller
// (the scan for the general is hoisted out of tight search loops).
func (e *Engine) inCheckFrom(c Color, gr, gf int) bool {
	opp := Red
	if c == Red {
		opp = Black
	}
	for _, d := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		r, f := gr+d[0], gf+d[1]
		screen := false
		for r >= 0 && r <= 9 && f >= 0 && f <= 8 {
			p := e.board[r][f]
			if p != 0 {
				pc := pieceColor(p)
				switch upper(p) {
				case 'R':
					if pc == opp && !screen {
						return true
					}
				case 'C':
					if pc == opp && screen {
						return true
					}
				case 'K':
					// adjacent general, or facing general on an open file
					// (flying general rule)
					if pc == opp && !screen {
						return true
					}
				}
				if screen {
					break
				}
				screen = true
			}
			r += d[0]
			f += d[1]
		}
	}
	for _, d := range [][2]int{{2, 1}, {2, -1}, {-2, 1}, {-2, -1}, {1, 2}, {1, -2}, {-1, 2}, {-1, -2}} {
		hr, hf := gr+d[0], gf+d[1]
		p := e.at(hr, hf)
		if p != 0 && pieceColor(p) == opp && upper(p) == 'H' {
			// leg square: adjacent to the horse along the 2-step direction
			var lr, lf int
			if d[0] == 2 || d[0] == -2 {
				lr, lf = hr-d[0]/2, hf
			} else {
				lr, lf = hr, hf-d[1]/2
			}
			if e.at(lr, lf) == 0 {
				return true
			}
		}
	}
	// soldier in front of us (attacking forward)
	adv := 1 // black soldiers advance toward higher ranks
	if opp == Red {
		adv = -1
	}
	if p := e.at(gr-adv, gf); p != 0 && pieceColor(p) == opp && upper(p) == 'P' {
		return true
	}
	// enemy soldier beside us on a rank it has crossed the river to reach
	if !ownSide(gr, opp) {
		for _, df := range [2]int{-1, 1} {
			if p := e.at(gr, gf+df); p != 0 && pieceColor(p) == opp && upper(p) == 'P' {
				return true
			}
		}
	}
	return false
}

func (e *Engine) legalMoves() []Move {
	c := e.turn
	gr, gf := e.generalPos(c) // mover's general before any move
	var legal []Move
	for _, m := range e.pseudoLegal(c) {
		p := e.board[m.FromRank][m.FromFile]
		ngr, ngf := gr, gf
		if upper(p) == 'K' { // the general itself moved
			ngr, ngf = m.ToRank, m.ToFile
		}
		u, _ := e.make(m)
		if !e.inCheckFrom(c, ngr, ngf) {
			legal = append(legal, m)
		}
		e.unmake(m, u)
	}
	return legal
}

// ---------- make / unmake ----------

// make applies a move and returns the info needed to undo it.
func (e *Engine) make(m Move) (undoInfo, bool) {
	p := e.board[m.FromRank][m.FromFile]
	if p == 0 {
		return undoInfo{}, false
	}
	u := undoInfo{captured: e.board[m.ToRank][m.ToFile]}
	e.board[m.ToRank][m.ToFile] = p
	e.board[m.FromRank][m.FromFile] = 0
	e.turn = Red
	if pieceColor(p) == Red {
		e.turn = Black
	}
	return u, true
}

func (e *Engine) unmake(m Move, u undoInfo) {
	p := e.board[m.ToRank][m.ToFile]
	e.board[m.FromRank][m.FromFile] = p
	e.board[m.ToRank][m.ToFile] = u.captured
	e.turn = pieceColor(p)
}

// PlayMove applies a move if it is legal. Returns false when rejected.
func (e *Engine) PlayMove(m Move) bool {
	for _, lm := range e.legalMoves() {
		if lm == m {
			e.make(m)
			return true
		}
	}
	return false
}

// ---------- status ----------

type Status struct {
	Turn      Color
	InCheck   bool
	Checkmate bool
	Stalemate bool // no moves, not in check: still a loss in xiangqi
	Over      bool
	Winner    Color // 0 while the game runs
}

func (e *Engine) Status() Status {
	st := Status{Turn: e.turn, InCheck: e.inCheck(e.turn)}
	moves := e.legalMoves()
	if len(moves) == 0 {
		st.Over = true
		st.Checkmate = st.InCheck
		st.Stalemate = !st.InCheck
		st.Winner = Red
		if e.turn == Red {
			st.Winner = Black
		}
	}
	return st
}

// ---------- presentation ----------

func (e *Engine) ascii() string {
	s := "   0 1 2 3 4 5 6 7 8\n"
	for r := 0; r < 10; r++ {
		s += fmt.Sprintf(" %d ", r)
		for f := 0; f < 9; f++ {
			p := e.board[r][f]
			if p == 0 {
				if (r == 4 && (f == 0 || f == 8)) || (r == 5 && (f == 0 || f == 8)) {
					s += "+ " // river edge markers
				} else {
					s += ". "
				}
			} else {
				s += string(p) + " "
			}
		}
		s += "\n"
	}
	return s
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "play" {
		playCLI(os.Args[2:])
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "simulate" {
		aiDepth, botDepth := 2, 1
		if len(os.Args) > 3 {
			aiDepth, _ = strconv.Atoi(os.Args[2])
			botDepth, _ = strconv.Atoi(os.Args[3])
		}
		simulate(aiDepth, botDepth)
		return
	}
	e := NewEngine()
	fmt.Println("initial position, red to move")
	fmt.Println(e.ascii())
	fmt.Printf("legal moves: %d\n", len(e.legalMoves()))

	// Cannon opening: cannon file 1 -> center file 4 (C2=5 style ping)
	played := e.PlayMove(Move{7, 1, 7, 4})
	fmt.Printf("cannon (1,7)->(4,7): %v\n", played)
	e.PlayMove(Move{2, 7, 2, 4})
	fmt.Printf("black mirrors, red legal moves now: %d\n", len(e.legalMoves()))
	fmt.Println(e.ascii())
	st := e.Status()
	fmt.Printf("status: turn=%c over=%v check=%v\n", st.Turn, st.Over, st.InCheck)

	// rule spot-checks on small positions
	fmt.Println()
	checkRules()
}

// ---------- interactive CLI (human vs AI) ----------

type cliPreset struct {
	depth  int
	spread int // random among top N root moves (0 = always best)
}

func playCLI(args []string) {
	presets := map[string]cliPreset{
		"easy":   {depth: 1, spread: 3},
		"medium": {depth: 2, spread: 1},
		"hard":   {depth: 3, spread: 0},
	}
	difficulty := "medium"
	if len(args) > 0 {
		if _, ok := presets[args[0]]; ok {
			difficulty = args[0]
		}
	}
	humanIsRed := !(len(args) > 1 && args[1] == "black")
	preset := presets[difficulty]
	rand.Seed(time.Now().UnixNano())

	e := NewEngine()
	var history []Move
	fmt.Printf("xiangqi CLI — difficulty: %s, you play %s\n",
		difficulty, map[bool]string{true: "red", false: "black"}[humanIsRed])
	fmt.Println("moves: \"fromFile,fromRank toFile,toRank\" e.g. 1,7 4,7 | u = undo | q = quit")

	reader := bufio.NewScanner(os.Stdin)
	for {
		st := e.Status()
		fmt.Println(e.ascii())
		if st.Over {
			fmt.Printf("game over: %s wins (%s)\n",
				map[Color]string{Red: "red", Black: "black"}[st.Winner],
				map[bool]string{true: "checkmate", false: "stalemate"}[st.Checkmate])
			return
		}
		if st.InCheck {
			fmt.Println("** you are in check **")
		}
		humanTurn := (humanIsRed && e.turn == Red) || (!humanIsRed && e.turn == Black)
		if !humanTurn {
			m := pickAIMove(e, preset)
			fmt.Printf("AI plays: %s\n", m)
			e.make(m)
			history = append(history, m)
			continue
		}
		fmt.Print("your move> ")
		if !reader.Scan() {
			fmt.Println("\nbye")
			return
		}
		line := strings.TrimSpace(reader.Text())
		switch line {
		case "q":
			fmt.Println("bye")
			return
		case "u":
			if len(history) >= 2 {
				history = history[:len(history)-2]
				fresh := NewEngine()
				for _, m := range history {
					fresh.make(m)
				}
				*e = *fresh
				fmt.Println("undone")
			} else {
				fmt.Println("nothing to undo")
			}
			continue
		}
		var ff, fr, tf, tr int
		n, err := fmt.Sscanf(line, "%d,%d %d,%d", &ff, &fr, &tf, &tr)
		if err != nil || n != 4 {
			fmt.Println("cannot parse move; use \"fromFile,fromRank toFile,toRank\" e.g. 1,7 4,7")
			continue
		}
		m := Move{FromRank: fr, FromFile: ff, ToRank: tr, ToFile: tf}
		if !e.PlayMove(m) {
			fmt.Println("illegal move")
			continue
		}
		history = append(history, m)
	}
}

// pickAIMove: rank root moves by negamax and pick within the preset's spread.
func pickAIMove(e *Engine, preset cliPreset) Move {
	moves := e.legalMoves()
	if len(moves) == 0 {
		return Move{}
	}
	type scored struct {
		m Move
		s int
	}
	ranked := make([]scored, 0, len(moves))
	for _, m := range moves {
		u, _ := e.make(m)
		s := -negamax(e, preset.depth-1, -1<<30, 1<<30)
		e.unmake(m, u)
		ranked = append(ranked, scored{m, s})
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].s > ranked[j].s })
	idx := 0
	if preset.spread > 0 && len(ranked) > 1 {
		idx = rand.Intn(min(preset.spread+1, len(ranked)))
	}
	return ranked[idx].m
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ---------- bot (negamax + alpha-beta) ----------

func pieceValue(p Piece, rank int) int {
	switch upper(p) {
	case 'K':
		return 0
	case 'A', 'E':
		return 120
	case 'H':
		return 270
	case 'R':
		return 600
	case 'C':
		return 285
	case 'P':
		if !ownSide(rank, pieceColor(p)) { // crossed the river
			return 60
		}
		return 30
	}
	return 0
}

func evaluate(e *Engine) int {
	// positive = good for red
	score := 0
	for r := 0; r < 10; r++ {
		for f := 0; f < 9; f++ {
			p := e.board[r][f]
			if p == 0 {
				continue
			}
			v := pieceValue(p, r)
			// small centralization bonus
			v -= 2 * (abs(r-4) + abs(f-4)) / 3
			if pieceColor(p) == Red {
				score += v
			} else {
				score -= v
			}
		}
	}
	return score
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func negamax(e *Engine, depth, alpha, beta int) int {
	moves := e.legalMoves()
	if len(moves) == 0 {
		return -(100000 + depth) // side to move is mated or stalemated: loss
	}
	if depth == 0 {
		if e.turn == Red {
			return evaluate(e)
		}
		return -evaluate(e)
	}
	best := -1 << 30
	for _, m := range moves {
		u, _ := e.make(m)
		score := -negamax(e, depth-1, -beta, -alpha)
		e.unmake(m, u)
		if score > best {
			best = score
		}
		if score > alpha {
			alpha = score
		}
		if alpha >= beta {
			break
		}
	}
	return best
}

// ChooseBest picks the best move for the side to move at the given depth.
func (e *Engine) ChooseBest(depth int) (Move, bool) {
	moves := e.legalMoves()
	if len(moves) == 0 {
		return Move{}, false
	}
	best := moves[0]
	bestScore := -1 << 31
	for _, m := range moves {
		u, _ := e.make(m)
		score := -negamax(e, depth-1, -1<<30, 1<<30)
		e.unmake(m, u)
		if score > bestScore {
			bestScore = score
			best = m
		}
	}
	return best, true
}

// ---------- AI-vs-bot simulation ----------

const simPlyLimit = 200

func simulate(aiDepth, botDepth int) {
	fmt.Printf("Xiangqi: AI (red, depth %d) vs Bot (black, depth %d)\n", aiDepth, botDepth)
	e := NewEngine()
	var record []string
	result := "unknown"
	for ply := 0; ply < simPlyLimit; ply++ {
		st := e.Status()
		if st.Over {
			winner := "red"
			if st.Winner == Black {
				winner = "black"
			}
			if st.Checkmate {
				result = winner + " wins by checkmate"
			} else {
				result = winner + " wins (stalemate is a loss in xiangqi)"
			}
			break
		}
		depth := aiDepth
		if e.turn == Black {
			depth = botDepth
		}
		m, ok := e.ChooseBest(depth)
		if !ok {
			result = "no moves"
			break
		}
		who := "R"
		if e.turn == Black {
			who = "B"
		}
		record = append(record, fmt.Sprintf("%s%s", who, m))
		e.make(m)
	}
	if result == "unknown" {
		result = "draw (move limit reached)"
	}
	for i, mv := range record {
		if i%2 == 0 {
			fmt.Printf("%d. ", i/2+1)
		}
		fmt.Printf("%s ", mv)
	}
	fmt.Println()
	fmt.Println(e.ascii())
	fmt.Printf("plies: %d, result: %s\n", len(record), result)
}

func checkRules() {
	pass := 0
	fail := 0
	check := func(name string, ok bool) {
		if ok {
			pass++
		} else {
			fail++
			fmt.Printf("FAIL: %s\n", name)
		}
	}
	has := func(moves []Move, m Move) bool {
		for _, x := range moves {
			if x == m {
				return true
			}
		}
		return false
	}
	base := func() *Engine {
		// two generals only, red to move
		e := &Engine{turn: Red}
		e.board[9][4] = 'K'
		e.board[0][4] = 'k'
		return e
	}

	// 1. initial position per-piece move counts
	e := NewEngine()
	counts := map[Piece]int{}
	for _, m := range e.legalMoves() {
		counts[e.board[m.FromRank][m.FromFile]]++
	}
	check("initial: 4 chariot moves (2 each)", counts['R'] == 4)
	check("initial: 4 horse moves (2 each)", counts['H'] == 4)
	check("initial: 4 elephant moves (2 each)", counts['E'] == 4)
	check("initial: 2 advisor moves (1 each)", counts['A'] == 2)
	check("initial: 1 general move", counts['K'] == 1)
	check("initial: 24 cannon moves (12 each)", counts['C'] == 24)
	check("initial: 5 soldier moves (1 each)", counts['P'] == 5)
	check("initial: total 44 moves", len(e.legalMoves()) == 44)

	// 2. horse leg blocking
	h := base()
	h.board[9][0] = 'H'
	h.board[8][0] = 'p' // blocks leg toward rank 7
	check("horse: free-leg move allowed", has(h.pseudoLegal(Red), Move{9, 0, 8, 2}))
	check("horse: blocked-leg move rejected", !has(h.pseudoLegal(Red), Move{9, 0, 7, 1}))

	// 3. elephant eye and river
	el := base()
	el.board[9][2] = 'E'
	el.board[8][3] = 'p' // blocked eye toward (7,4)
	check("elephant: free eye move allowed", has(el.pseudoLegal(Red), Move{9, 2, 7, 0}))
	check("elephant: blocked eye rejected", !has(el.pseudoLegal(Red), Move{9, 2, 7, 4}))
	river := base()
	river.board[5][2] = 'E' // red elephant standing on the river bank
	check("elephant: cannot cross river", !has(river.pseudoLegal(Red), Move{5, 2, 3, 4}))

	// 4. cannon screen capture
	c := base()
	c.board[5][4] = 'C'
	c.board[4][4] = 'P' // screen (own color is fine)
	c.board[3][4] = 'r' // enemy chariot beyond the screen
	c.board[1][4] = 'p'
	check("cannon: slides past empty squares", has(c.pseudoLegal(Red), Move{5, 4, 6, 4}))
	check("cannon: captures over one screen", has(c.pseudoLegal(Red), Move{5, 4, 3, 4}))
	c2 := base()
	c2.board[5][4] = 'C'
	c2.board[4][4] = 'P'
	c2.board[3][4] = 'p' // now two screens before the enemy piece
	c2.board[1][4] = 'r'
	check("cannon: no capture over two screens", !has(c2.pseudoLegal(Red), Move{5, 4, 1, 4}))

	// 5. soldier movement
	s := base()
	s.board[4][2] = 'P' // red soldier past the river
	check("soldier: forward past river", has(s.pseudoLegal(Red), Move{4, 2, 3, 2}))
	check("soldier: sideways past river", has(s.pseudoLegal(Red), Move{4, 2, 4, 3}))
	s2 := base()
	s2.board[6][2] = 'P' // red soldier on its own side
	check("soldier: no sideways on own side", !has(s2.pseudoLegal(Red), Move{6, 2, 6, 3}))
	check("soldier: forward on own side", has(s2.pseudoLegal(Red), Move{6, 2, 5, 2}))

	// 5b. soldier on the last rank cannot advance off the board
	last := base()
	last.board[0][2] = 'P' // red soldier on black's back rank
	offBoard := false
	for _, mv := range last.pseudoLegal(Red) {
		if last.board[mv.FromRank][mv.FromFile] == 'P' && mv.ToRank < 0 {
			offBoard = true
		}
	}
	check("soldier: no off-board advance from last rank", !offBoard)

	// 6. flying general: moving the only blocker off the file is illegal
	g := base()
	g.board[4][4] = 'P' // red pawn past the river, sole blocker on file 4
	check("flying general: blocker may step forward", has(g.legalMoves(), Move{4, 4, 3, 4}))
	check("flying general: blocker may not step aside", !has(g.legalMoves(), Move{4, 4, 4, 3}))

	// 7. general confined to the palace
	k := base()
	k.board[9][4] = 0
	k.board[8][4] = 'K' // red general one step up
	k.board[0][4] = 0
	k.board[0][3] = 'k'
	check("general: stays inside palace", has(k.pseudoLegal(Red), Move{8, 4, 8, 3}) &&
		!has(k.pseudoLegal(Red), Move{8, 4, 8, 2}))

	// 8. checkmate: chariot checks, soldiers and chariot seal every escape
	m := base()
	m.board[0][4] = 'k'  // black general, palace center
	m.board[1][4] = 'R' // checking chariot, defended by the soldier below
	m.board[0][2] = 'P' // red soldier covers (0,3)
	m.board[0][6] = 'P' // red soldier covers (0,5)
	m.board[2][4] = 'P' // defends the chariot so KxR is impossible
	m.turn = Black
	st := m.Status()
	check("checkmate detected", st.Over && st.Checkmate && st.Winner == Red)

	// 9. stalemate is a loss in xiangqi: not in check, no legal moves
	sm := base()
	sm.board[0][4] = 0
	sm.board[0][3] = 'k' // black general in the palace corner
	sm.board[1][4] = 'R' // covers both escapes (1,3) and (0,4), gives no check
	sm.turn = Black
	st2 := sm.Status()
	check("stalemate detected as loss", st2.Over && st2.Stalemate && st2.Winner == Red)

	fmt.Printf("rule checks: %d passed, %d failed\n", pass, fail)
}
