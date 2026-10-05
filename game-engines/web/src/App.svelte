<script lang="ts">
  // Common web interface: pick a game, pick AI (strong) or bot (weak),
  // pick a difficulty, and play. All six games share this UI.
  import { GAMES, type GameEntry } from './lib/registry.ts';
  import type { Difficulty, GameView, Opponent } from './lib/types.ts';

  let game: GameEntry = $state(GAMES[0]);
  let difficulty: Difficulty = $state('medium');
  let opponent: Opponent = $state('ai');
  let view = $state<GameView | null>(null);
  let controller = $state<ReturnType<GameEntry['make']> | null>(null);
  let thinking = $state(false);

  function newGame(): void {
    controller = game.make();
    controller.reset(difficulty, opponent);
    view = controller.view();
  }

  function refresh(): void {
    if (!controller) return;
    view = controller.view();
    maybeOpponentMove();
  }

  function maybeOpponentMove(): void {
    if (!controller || !controller.isOpponentTurn()) return;
    thinking = true;
    setTimeout(() => {
      if (!controller) return;
      controller.opponentAct();
      view = controller.view();
      thinking = false;
      // the opponent may pass (e.g. reversi) and get another turn
      if (controller.isOpponentTurn()) {
        maybeOpponentMove();
      }
    }, 150);
  }

  function clickCell(r: number, c: number): void {
    if (!controller || thinking) return;
    controller.humanClick(r, c);
    refresh();
  }

  function pressDigit(n: number): void {
    if (!controller || !controller.humanDigit) return;
    controller.humanDigit(n);
    refresh();
  }

  function clickCard(i: number): void {
    if (!controller || !controller.selectCard) return;
    controller.selectCard(i);
    refresh();
  }

  function runAction(a: { label: string; run: () => void }): void {
    a.run();
    refresh();
  }

  $effect(() => {
    // start a game whenever the selection changes
    game; difficulty; opponent;
    newGame();
  });
</script>

<main>
  <h1>game-engines</h1>
  <p class="tagline">Six rules engines, six languages, one interface. Play against the AI or the bot.</p>

  <div class="controls">
    <label>
      Game
      <select bind:value={game}>
        {#each GAMES as g}
          <option value={g}>{g.label} — {g.language} ({g.difficulty})</option>
        {/each}
      </select>
    </label>
    <label>
      Opponent
      <select bind:value={opponent}>
        <option value="ai">AI (search-based, strong)</option>
        <option value="bot">Bot (random legal moves)</option>
      </select>
    </label>
    <label>
      Difficulty
      <select bind:value={difficulty}>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
    </label>
    <button class="primary" onclick={newGame}>New game</button>
  </div>

  {#if view}
    <p class="status" class:over={view.over}>{view.status}</p>

    <div class="layout">
      <div class="board-col">
        <div
          class="board"
          style={`--cols: ${view.rows[0].length}; --cell: ${view.rows.length > 9 ? 34 : 46}px`}
        >
          {#each view.rows as row, r}
            {#each row as cell, c}
              <button
                class={cell.cls}
                class:disabled={!cell.clickable}
                title={cell.title ?? ''}
                onclick={() => clickCell(r, c)}
              >{cell.glyph}</button>
            {/each}
          {/each}
        </div>
        {#if view.cards.length > 0}
          <div class="cards">
            {#each view.cards as card, i}
              <button class={card.cls} onclick={() => clickCard(i)}>{card.label}</button>
            {/each}
          </div>
        {/if}
        {#if view.needsDigits}
          <div class="digits">
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as d}
              <button onclick={() => pressDigit(d)}>{d === 0 ? 'clr' : d}</button>
            {/each}
          </div>
        {/if}
        {#if controller && controller.actions().length > 0}
          <div class="actions">
            {#each controller.actions() as a}
              <button onclick={() => runAction(a)}>{a.label}</button>
            {/each}
          </div>
        {/if}
      </div>

      <aside class="panel">
        <h2>{game.label}</h2>
        <pre>{view.info}</pre>
        {#if thinking}
          <p class="thinking">opponent is thinking...</p>
        {/if}
      </aside>
    </div>
  {/if}
</main>
