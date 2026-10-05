<?php
// Sequence engine — PHP
// Difficulty: 3/5 (card-driven placement, wilds, sequence locking)
//
// Rules implemented (2-player Sequence):
//   - 10x10 board. Each of the 48 non-jack cards appears exactly twice;
//     the four corners are free wild spaces usable by both players.
//     The card layout is generated deterministically (seeded shuffle)
//     instead of copying the printed official board.
//   - Play is card-driven: choose a card from your hand, then place a chip
//     on one of that card's (empty) spaces.
//   - Two-eyed jacks (clubs/diamonds) are wild: place a chip on any empty
//     space. One-eyed jacks (spades/hearts) remove an opponent chip that is
//     not part of a completed sequence.
//   - A card whose spaces are all occupied is "dead": it may be discarded
//     once per turn in exchange for a replacement card.
//   - After each play the player draws a replacement from the deck
//     (double deck including jacks, seeded shuffle).
//   - A sequence is 5 chips in a row (horizontal, vertical, diagonal);
//     free corners count for both players. Chips in a completed sequence
//     are locked and cannot be removed. 9+ in one row counts as two
//     sequences. First player to complete 2 sequences wins.
//
// Run: php sequence.php

declare(strict_types=1);

const SIZE = 10;
const HAND_SIZE = 7;
const SEQUENCE_LEN = 5;
const SEQUENCES_TO_WIN = 2;
const LAYOUT_SEED = 4242;
const DECK_SEED = 90210;

final class Card
{
    public function __construct(public string $rank, public string $suit) {}

    public function id(): string
    {
        return $this->rank . $this->suit;
    }

    public function isJack(): bool
    {
        return $this->rank === 'J';
    }

    /** one-eyed jacks (spades/hearts) remove opponent chips */
    public function isOneEyedJack(): bool
    {
        return $this->isJack() && ($this->suit === 'S' || $this->suit === 'H');
    }

    /** two-eyed jacks (clubs/diamonds) are wild */
    public function isTwoEyedJack(): bool
    {
        return $this->isJack() && ($this->suit === 'C' || $this->suit === 'D');
    }
}

final class Move
{
    public function __construct(
        public int $cardIndex, // index into the acting player's hand
        public string $action,  // 'place' | 'remove' | 'discard'
        public ?int $row = null,
        public ?int $col = null,
    ) {}

    public function describe(array $hand): string
    {
        $card = $hand[$this->cardIndex]->id();
        return match ($this->action) {
            'place' => sprintf("play %s, chip at (%d,%d)", $card, $this->row, $this->col),
            'remove' => sprintf("play %s, remove opponent chip at (%d,%d)", $card, $this->row, $this->col),
            'discard' => sprintf("discard dead card %s", $card),
        };
    }
}

final class SequenceEngine
{
    /** @var array<int, array<int, string>> card on each space, or 'FREE' */
    private array $layout = [];
    /** @var array<int, array<int, int>> chip owner per space: 0, 1, 2 */
    private array $chips = [];
    /** @var array<int, array<int, bool>> chips locked into a sequence */
    private array $locked = [];
    /** @var array<int, array<int, string>> board card id -> [r, c] spaces */
    private array $cardSpaces = [];

    private array $deck = [];
    /** @var array<int, Card[]> player hands (index 1 and 2) */
    private array $hands = [1 => [], 2 => []];
    private array $discard = [];
    private array $sequences = [1 => 0, 2 => 0];

    public function __construct(private int $currentPlayer = 1)
    {
        $this->buildLayout();
        $this->buildDeck();
        for ($i = 0; $i < HAND_SIZE; $i++) {
            $this->hands[1][] = array_pop($this->deck);
            $this->hands[2][] = array_pop($this->deck);
        }
    }

    // ---------- setup ----------

    private function buildLayout(): void
    {
        $cards = [];
        foreach (['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as $rank) {
            foreach (['S','H','D','C'] as $suit) {
                if ($rank === 'J') {
                    continue; // jacks never appear on the board
                }
                $cards[] = $rank . $suit;
                $cards[] = $rank . $suit; // each card appears exactly twice
            }
        }
        // deterministic Fisher-Yates with an LCG
        mt_srand(LAYOUT_SEED);
        for ($i = count($cards) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$cards[$i], $cards[$j]] = [$cards[$j], $cards[$i]];
        }
        $k = 0;
        for ($r = 0; $r < SIZE; $r++) {
            for ($c = 0; $c < SIZE; $c++) {
                $isCorner = ($r === 0 || $r === SIZE - 1) && ($c === 0 || $c === SIZE - 1);
                $this->layout[$r][$c] = $isCorner ? 'FREE' : $cards[$k++];
                $this->chips[$r][$c] = 0;
                $this->locked[$r][$c] = false;
            }
        }
        for ($r = 0; $r < SIZE; $r++) {
            for ($c = 0; $c < SIZE; $c++) {
                $id = $this->layout[$r][$c];
                if ($id !== 'FREE') {
                    $this->cardSpaces[$id][] = [$r, $c];
                }
            }
        }
    }

    private function buildDeck(): void
    {
        $cards = [];
        foreach (['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as $rank) {
            foreach (['S','H','D','C'] as $suit) {
                $cards[] = new Card($rank, $suit);
                $cards[] = new Card($rank, $suit); // double deck
            }
        }
        mt_srand(DECK_SEED);
        for ($i = count($cards) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$cards[$i], $cards[$j]] = [$cards[$j], $cards[$i]];
        }
        $this->deck = $cards;
    }

    // ---------- queries ----------

    public function currentPlayer(): int
    {
        return $this->currentPlayer;
    }

    public function sequences(): array
    {
        return $this->sequences;
    }

    public function winner(): ?int
    {
        foreach ($this->sequences as $player => $count) {
            if ($count >= SEQUENCES_TO_WIN) {
                return $player;
            }
        }
        return null;
    }

    public function hand(int $player): array
    {
        return $this->hands[$player];
    }

    public function chipAt(int $row, int $col): int
    {
        return $this->chips[$row][$col];
    }

    /**
     * All legal moves for the current player:
     *   - place a chip for each empty space reachable by hand cards
     *     (normal cards -> their spaces, two-eyed jacks -> everywhere)
     *   - remove an unlocked opponent chip for each one-eyed jack
     *   - discard a dead card (all its spaces occupied, or a one-eyed
     *     jack with no legal target)
     *
     * @return Move[]
     */
    public function legalMoves(): array
    {
        if ($this->winner() !== null) {
            return [];
        }
        $player = $this->currentPlayer;
        $opponent = $player === 1 ? 2 : 1;
        $moves = [];
        $deadCards = [];
        foreach ($this->hands[$player] as $idx => $card) {
            if ($card->isTwoEyedJack()) {
                for ($r = 0; $r < SIZE; $r++) {
                    for ($c = 0; $c < SIZE; $c++) {
                        if ($this->chips[$r][$c] === 0) {
                            $moves[] = new Move($idx, 'place', $r, $c);
                        }
                    }
                }
                continue;
            }
            if ($card->isOneEyedJack()) {
                $canRemove = false;
                for ($r = 0; $r < SIZE; $r++) {
                    for ($c = 0; $c < SIZE; $c++) {
                        if ($this->chips[$r][$c] === $opponent && !$this->locked[$r][$c]) {
                            $moves[] = new Move($idx, 'remove', $r, $c);
                            $canRemove = true;
                        }
                    }
                }
                if (!$canRemove) {
                    $deadCards[] = $idx;
                }
                continue;
            }
            $hasTarget = false;
            foreach ($this->cardSpaces[$card->id()] as [$r, $c]) {
                if ($this->chips[$r][$c] === 0) {
                    $moves[] = new Move($idx, 'place', $r, $c);
                    $hasTarget = true;
                }
            }
            if (!$hasTarget) {
                $deadCards[] = $idx;
            }
        }
        foreach ($deadCards as $idx) {
            $moves[] = new Move($idx, 'discard');
        }
        return $moves;
    }

    // ---------- playing ----------

    public function applyMove(Move $move): bool
    {
        $legal = false;
        foreach ($this->legalMoves() as $m) {
            if ($m == $move) { // Move objects compare by value here
                $legal = true;
                break;
            }
        }
        if (!$legal) {
            return false;
        }
        $player = $this->currentPlayer;
        $opponent = $player === 1 ? 2 : 1;
        $card = $this->hands[$player][$move->cardIndex];

        if ($move->action === 'place') {
            $this->chips[$move->row][$move->col] = $player;
        } elseif ($move->action === 'remove') {
            $this->chips[$move->row][$move->col] = 0;
        }
        // 'discard' only cycles the card

        array_splice($this->hands[$player], $move->cardIndex, 1);
        $this->discard[] = $card;
        if ($move->action === 'place') {
            $this->detectSequences($player);
        }
        if ($this->deck !== []) {
            $this->hands[$player][] = array_pop($this->deck);
        }
        $this->currentPlayer = $opponent;
        return true;
    }

    /** maximal runs of >= SEQUENCE_LEN count: 5-8 chips = one sequence,
     * 9+ chips = two sequences. Member chips are locked. */
    private function detectSequences(int $player): void
    {
        foreach ([[0, 1], [1, 0], [1, 1], [1, -1]] as [$dr, $dc]) {
            foreach (range(0, SIZE - 1) as $row) {
                foreach (range(0, SIZE - 1) as $col) {
                    if ($this->chips[$row][$col] !== $player) {
                        continue;
                    }
                    // only count runs starting at their head to avoid duplicates
                    $pr = $row - $dr;
                    $pc = $col - $dc;
                    $atPrev = $pr >= 0 && $pr < SIZE && $pc >= 0 && $pc < SIZE
                        && $this->chips[$pr][$pc] === $player;
                    if ($atPrev) {
                        continue;
                    }
                    $len = 0;
                    $rr = $row;
                    $cc = $col;
                    while ($rr >= 0 && $rr < SIZE && $cc >= 0 && $cc < SIZE
                        && $this->chips[$rr][$cc] === $player) {
                        $len++;
                        $rr += $dr;
                        $cc += $dc;
                    }
                    if ($len >= SEQUENCE_LEN) {
                        $this->sequences[$player] += $len >= 9 ? 2 : 1;
                        $rr = $row;
                        $cc = $col;
                        for ($i = 0; $i < min($len, 9); $i++) {
                            $this->locked[$rr][$cc] = true;
                            $rr += $dr;
                            $cc += $dc;
                        }
                    }
                }
            }
        }
    }

    public function status(): array
    {
        return [
            'current_player' => $this->currentPlayer,
            'sequences' => $this->sequences,
            'winner' => $this->winner(),
            'legal_moves' => count($this->legalMoves()),
        ];
    }

    public function ascii(): string
    {
        $out = "   0  1  2  3  4  5  6  7  8  9\n";
        for ($r = 0; $r < SIZE; $r++) {
            $out .= sprintf("%2d ", $r);
            for ($c = 0; $c < SIZE; $c++) {
                $chip = $this->chips[$r][$c];
                if ($chip !== 0 && $this->locked[$r][$c]) {
                    $cell = '*';
                } else {
                    $cell = $chip === 0 ? '.' : (string) $chip;
                }
                $out .= str_pad($cell, 3);
            }
            $out .= "\n";
        }
        return $out;
    }
}

// ---------- bots ----------

/** Heuristic bot ("AI"): scores every legal move and picks the best.
 *  place: how much it extends/creates lines of own chips through the target
 *  remove: how strong the opponent's line through that chip is
 *  discard: neutral (only when nothing else exists) */
final class SmartBot
{
    public function __construct(private SequenceEngine $engine) {}

    public function chooseMove(): Move
    {
        $moves = $this->engine->legalMoves();
        $me = $this->engine->currentPlayer();
        $opp = $me === 1 ? 2 : 1;
        $mySequences = $this->engine->sequences()[$me];
        $best = null;
        $bestScore = PHP_INT_MIN;
        foreach ($moves as $move) {
            $score = match ($move->action) {
                'place' => $this->scorePlace($move->row, $move->col, $me, $opp, $mySequences),
                'remove' => $this->scoreRemove($move->row, $move->col, $opp),
                'discard' => -1,
            };
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $move;
            }
        }
        return $best;
    }

    private function scorePlace(int $r, int $c, int $me, int $opp, int $mySequences): int
    {
        $mine = $this->linePotential($r, $c, $me);
        $theirs = $this->linePotential($r, $c, $opp);
        // completing a sequence wins the game when it is our second one
        if ($mine >= SEQUENCE_LEN && $mySequences === SEQUENCES_TO_WIN - 1) {
            return 10000;
        }
        $score = $mine * 10;
        if ($mine >= SEQUENCE_LEN) {
            $score += 500; // completing any sequence is still great
        }
        if ($theirs >= SEQUENCE_LEN) {
            $score += 200; // blocking a spot where the opponent would complete
        } else {
            $score += $theirs * 4; // general denial
        }
        return $score;
    }

    private function scoreRemove(int $r, int $c, int $opp): int
    {
        $theirs = $this->linePotential($r, $c, $opp);
        return $theirs >= SEQUENCE_LEN ? 300 : $theirs * 8;
    }

    /** Longest count of a player's chips (treating empties as usable) in any
     * line through (r,c), assuming a chip of theirs lands there. */
    private function linePotential(int $r, int $c, int $player): int
    {
        $best = 0;
        foreach ([[0, 1], [1, 0], [1, 1], [1, -1]] as [$dr, $dc]) {
            $count = 1; // the chip we would place
            foreach ([1, -1] as $sign) {
                $rr = $r + $dr * $sign;
                $cc = $c + $dc * $sign;
                while ($rr >= 0 && $rr < SIZE && $cc >= 0 && $cc < SIZE
                    && $this->engine->chipAt($rr, $cc) === $player) {
                    $count++;
                    $rr += $dr * $sign;
                    $cc += $dc * $sign;
                }
            }
            $best = max($best, $count);
        }
        return $best;
    }
}

/** Random bot: any legal move, deterministic per call sequence. */
final class RandomBot
{
    public function __construct(private SequenceEngine $engine, private int $seed = 1) {}

    public function chooseMove(): Move
    {
        $moves = $this->engine->legalMoves();
        $index = hexdec(substr(md5((string) $this->seed++), 0, 8)) % count($moves);
        return $moves[$index];
    }
}

/** Play a full AI-vs-bot game and return a summary. */
function simulate(int $verbose = 1, int $botSeed = 7): array
{
    $engine = new SequenceEngine();
    $ai = new SmartBot($engine);
    $bot = new RandomBot($engine, seed: $botSeed);
    $plies = 0;
    $log = [];
    while ($engine->winner() === null && $plies < 400) {
        $moves = $engine->legalMoves();
        if ($moves === []) {
            break;
        }
        $move = $engine->currentPlayer() === 1
            ? $ai->chooseMove()
            : $bot->chooseMove();
        $who = $engine->currentPlayer();
        $text = $move->describe($engine->hand($who));
        $engine->applyMove($move);
        $log[] = "p$who: $text";
        $plies++;
    }
    if ($verbose) {
        foreach ($log as $entry) {
            echo $entry, "\n";
        }
        echo $engine->ascii();
    }
    return [
        'plies' => $plies,
        'sequences' => $engine->sequences(),
        'winner' => $engine->winner(),
    ];
}

// ---------- interactive CLI (human vs AI) ----------

function play_cli(string $difficulty = 'medium'): void
{
    $engine = new SequenceEngine();
    $smart = new SmartBot($engine);
    $random = new RandomBot($engine, seed: 99);
    $easyChance = ['easy' => 0.7, 'medium' => 0.3, 'hard' => 0.0][$difficulty] ?? 0.3;

    echo "sequence CLI — difficulty: $difficulty\n";
    echo "commands: p <card#> [r c] | d <card#> (discard dead card) | q quit\n";
    echo "two-eyed jacks (JC/JD) place anywhere; one-eyed jacks (JS/JH) remove an opponent chip\n\n";

    while ($engine->winner() === null) {
        $moves = $engine->legalMoves();
        if ($moves === []) {
            echo "no legal moves remain\n";
            break;
        }
        echo $engine->ascii(), "\n";
        $hand = $engine->hand($engine->currentPlayer());
        echo 'your cards: ' . implode(' ', array_map(
            fn (Card $c, int $i) => "$i)" . $c->id(),
            $hand,
            array_keys($hand),
        )) . "\n";

        if ($engine->currentPlayer() === 2) {
            // AI side: mostly the smart bot, sometimes random for easier levels
            $move = (lcg_value() < $easyChance) ? $random->chooseMove() : $smart->chooseMove();
            echo 'AI: ', $move->describe($engine->hand(2)), "\n";
            $engine->applyMove($move);
            continue;
        }

        $line = trim((string) fgets(STDIN));
        if ($line === 'q') {
            echo "bye\n";
            return;
        }
        $parts = preg_split('/\s+/', $line) ?: [];
        if (count($parts) < 2) {
            echo "usage: p <card#> [r c] | d <card#>\n";
            continue;
        }
        [$cmd, $idx] = [$parts[0], (int) $parts[1]];
        if (!array_key_exists($idx, $hand)) {
            echo "no such card index\n";
            continue;
        }
        if ($cmd === 'd') {
            $move = new Move($idx, 'discard');
        } elseif ($cmd === 'p') {
            $card = $hand[$idx];
            $candidates = array_values(array_filter(
                $moves,
                fn (Move $m) => $m->cardIndex === $idx,
            ));
            if ($candidates === []) {
                echo "that card has no legal play (use: d $idx to discard it)\n";
                continue;
            }
            if (count($parts) >= 4) {
                $action = $card->isOneEyedJack() ? 'remove' : 'place';
                $move = new Move($idx, $action, (int) $parts[2], (int) $parts[3]);
            } elseif (count($candidates) === 1) {
                $move = $candidates[0];
            } else {
                $move = null;
                echo "several spaces possible: ";
                foreach ($candidates as $cand) {
                    echo "{$cand->row},{$cand->col} ";
                }
                echo "\nEnter: p $idx <row> <col>\n";
                continue;
            }
        } else {
            echo "unknown command\n";
            continue;
        }
        if ($move !== null && $move->action !== null && !$engine->applyMove($move)) {
            echo "illegal move\n";
        }
    }
    echo "\n", $engine->ascii(), "\n";
    $winner = $engine->winner();
    echo $winner === 1 ? "you win!\n" : "AI wins!\n";
}

// ---------- demo ----------

if ($argc > 1 && $argv[1] === 'play') {
    play_cli($argv[2] ?? 'medium');
    exit(0);
}

if ($argc > 1 && $argv[1] === 'simulate') {
    $verbose = (int)($argv[2] ?? 1);
    $botSeed = (int)($argv[3] ?? 7);
    if ($verbose === 2) {
        // multi-game tournament: run 20 seeds quietly
        $wins = [1 => 0, 2 => 0];
        for ($seed = 1; $seed <= 20; $seed++) {
            $r = simulate(verbose: 0, botSeed: $seed);
            if ($r['winner'] !== null) {
                $wins[$r['winner']]++;
            }
        }
        printf("AI wins: %d, Bot wins: %d (20 games)\n", $wins[1], $wins[2]);
        exit(0);
    }
    echo "Sequence: AI (player 1, heuristic) vs Bot (player 2, random, seed $botSeed)\n\n";
    $result = simulate(verbose: $verbose, botSeed: $botSeed);
    echo "summary: ", json_encode($result), "\n";
    exit(0);
}

$engine = new SequenceEngine();
echo "Sequence engine (2 players, deterministic layout/deck)\n";
echo "player 1 hand: " . implode(' ', array_map(fn (Card $c) => $c->id(), $engine->hand(1))) . "\n";
echo "player 2 hand: " . implode(' ', array_map(fn (Card $c) => $c->id(), $engine->hand(2))) . "\n\n";

$moves = $engine->legalMoves();
echo "legal moves at start: " . count($moves) . " (7 cards x up to 2 spaces each)\n";

// Play a few turns: each player takes their first placement move
for ($turn = 0; $turn < 6; $turn++) {
    $options = array_values(array_filter($engine->legalMoves(), fn (Move $m) => $m->action === 'place'));
    if ($options === []) {
        break;
    }
    $move = $options[0];
    $who = $engine->currentPlayer();
    $text = $move->describe($engine->hand($who));
    $ok = $engine->applyMove($move);
    echo "p$who: $text -> " . ($ok ? 'ok' : 'REJECTED') . "\n";
}
echo "\n" . $engine->ascii();
echo "\nstatus: " . json_encode($engine->status()) . "\n";
