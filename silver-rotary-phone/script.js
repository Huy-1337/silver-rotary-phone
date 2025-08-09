(() => {
  "use strict";

  // Configuration
  const GRID_COLUMNS = 21;
  const GRID_ROWS = 21;
  const INITIAL_SNAKE_LENGTH = 4;
  const BASE_SPEED_MS = 120; // lower is faster
  const SPEEDUP_EVERY_POINTS = 5;
  const SPEEDUP_PERCENT = 0.92; // multiply interval each step
  const MAX_SPEED_MULTIPLIER = 3.0;

  // Color palette
  const COLOR_BACKGROUND_A = getCssVar("--grid-a", "#0e1623");
  const COLOR_BACKGROUND_B = getCssVar("--grid-b", "#0c1320");
  const COLOR_SNAKE = getCssVar("--snake", "#22d3ee");
  const COLOR_SNAKE_HEAD = getCssVar("--snake-head", "#6ee7b7");
  const COLOR_FOOD = getCssVar("--food", "#f59e0b");

  // DOM elements
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const speedEl = document.getElementById("speed");
  const btnRestart = document.getElementById("btn-restart");
  const btnPause = document.getElementById("btn-pause");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySubtitle = document.getElementById("overlay-subtitle");
  const overlayResume = document.getElementById("overlay-resume");
  const overlayRestart = document.getElementById("overlay-restart");

  // Dynamic canvas scaling to keep crisp pixels
  function resizeCanvasToDisplaySize() {
    const cssWidth = Math.min(window.innerWidth * 0.92, 560);
    const size = Math.floor(cssWidth);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size * scale);
    canvas.height = Math.floor(size * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  resizeCanvasToDisplaySize();
  window.addEventListener("resize", resizeCanvasToDisplaySize);

  // Utility to read CSS custom properties with fallback
  function getCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v?.trim() || fallback;
  }

  // Pseudo-random int in [0, n)
  function randomInt(n) { return Math.floor(Math.random() * n); }

  function posEquals(a, b) { return a.x === b.x && a.y === b.y; }

  // Direction helpers
  const Directions = {
    Up: { x: 0, y: -1, name: "up" },
    Down: { x: 0, y: 1, name: "down" },
    Left: { x: -1, y: 0, name: "left" },
    Right: { x: 1, y: 0, name: "right" },
  };
  function isOpposite(a, b) { return a.x + b.x === 0 && a.y + b.y === 0; }

  class SnakeGame {
    constructor() {
      this.bestScore = Number(localStorage.getItem("snake-high-score") || 0);
      this.reset();
    }

    reset() {
      this.score = 0;
      this.isPaused = false;
      this.isGameOver = false;
      this.speedIntervalMs = BASE_SPEED_MS;
      this.speedMultiplier = 1;
      this.pendingDirection = Directions.Right;
      this.currentDirection = Directions.Right;
      const startX = Math.floor(GRID_COLUMNS / 3);
      const startY = Math.floor(GRID_ROWS / 2);
      this.snake = [];
      for (let i = INITIAL_SNAKE_LENGTH - 1; i >= 0; i--) {
        this.snake.push({ x: startX - i, y: startY });
      }
      this.food = this.spawnFood();
      this.lastTickAt = performance.now();
      this.accumulator = 0;
      this.updateHud();
      this.hideOverlay();
    }

    spawnFood() {
      const spaces = [];
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLUMNS; x++) {
          spaces.push({ x, y });
        }
      }
      const snakeSet = new Set(this.snake.map(p => `${p.x},${p.y}`));
      const empty = spaces.filter(p => !snakeSet.has(`${p.x},${p.y}`));
      return empty.length ? empty[randomInt(empty.length)] : { x: 0, y: 0 };
    }

    setDirection(dir) {
      if (!dir) return;
      if (isOpposite(dir, this.currentDirection)) return; // disallow immediate reverse
      this.pendingDirection = dir;
    }

    togglePause() {
      if (this.isGameOver) return;
      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        this.showOverlay("Paused", "Press Space or tap Resume");
      } else {
        this.hideOverlay();
        this.lastTickAt = performance.now(); // resync
      }
      this.updateHud();
    }

    gameOver() {
      this.isGameOver = true;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        localStorage.setItem("snake-high-score", String(this.bestScore));
      }
      this.showOverlay("Game Over", "Press R to restart or tap Restart");
      this.updateHud();
    }

    updateHud() {
      scoreEl.textContent = String(this.score);
      bestEl.textContent = String(this.bestScore);
      const speedX = Math.min(MAX_SPEED_MULTIPLIER, (BASE_SPEED_MS / this.speedIntervalMs)).toFixed(2);
      speedEl.textContent = `${speedX}x`;
      btnPause.textContent = this.isPaused ? "Resume" : "Pause";
    }

    showOverlay(title, subtitle) {
      overlayTitle.textContent = title;
      overlaySubtitle.textContent = subtitle;
      overlay.hidden = false;
    }
    hideOverlay() { overlay.hidden = true; }

    tick() {
      if (this.isPaused || this.isGameOver) return;
      this.currentDirection = this.pendingDirection;

      const nextHead = {
        x: this.snake[0].x + this.currentDirection.x,
        y: this.snake[0].y + this.currentDirection.y,
      };

      // Walls
      if (nextHead.x < 0 || nextHead.x >= GRID_COLUMNS || nextHead.y < 0 || nextHead.y >= GRID_ROWS) {
        this.gameOver();
        return;
      }

      // Self-collision (check against body)
      for (let i = 0; i < this.snake.length; i++) {
        if (posEquals(this.snake[i], nextHead)) {
          this.gameOver();
          return;
        }
      }

      // Move
      this.snake.unshift(nextHead);

      // Food
      const ateFood = posEquals(nextHead, this.food);
      if (ateFood) {
        this.score += 1;
        if (this.score % SPEEDUP_EVERY_POINTS === 0) {
          this.speedIntervalMs = Math.max(45, Math.floor(this.speedIntervalMs * SPEEDUP_PERCENT));
        }
        this.food = this.spawnFood();
      } else {
        this.snake.pop();
      }

      this.updateHud();
    }

    render() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cellSize = Math.floor(Math.min(width / GRID_COLUMNS, height / GRID_ROWS));
      const offsetX = Math.floor((width - cellSize * GRID_COLUMNS) / 2);
      const offsetY = Math.floor((height - cellSize * GRID_ROWS) / 2);

      // Background grid (checker)
      ctx.fillStyle = COLOR_BACKGROUND_A;
      ctx.fillRect(0, 0, width, height);

      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLUMNS; x++) {
          if ((x + y) % 2 === 1) {
            ctx.fillStyle = COLOR_BACKGROUND_B;
            ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
          }
        }
      }

      // Food
      drawRoundedCell(this.food.x, this.food.y, cellSize, offsetX, offsetY, COLOR_FOOD, 0.25);

      // Snake
      for (let i = this.snake.length - 1; i >= 0; i--) {
        const segment = this.snake[i];
        const isHead = i === 0;
        const color = isHead ? COLOR_SNAKE_HEAD : COLOR_SNAKE;
        const radius = isHead ? 0.35 : 0.25;
        drawRoundedCell(segment.x, segment.y, cellSize, offsetX, offsetY, color, radius);
      }
    }
  }

  function drawRoundedCell(x, y, cellSize, offsetX, offsetY, color, radiusFrac) {
    const r = Math.max(2, Math.floor(cellSize * radiusFrac));
    const px = offsetX + x * cellSize;
    const py = offsetY + y * cellSize;
    const w = cellSize;
    const h = cellSize;
    ctx.fillStyle = color;
    roundRect(ctx, px + 1, py + 1, w - 2, h - 2, r);
    ctx.fill();
  }

  function roundRect(ctx2d, x, y, w, h, r) {
    ctx2d.beginPath();
    ctx2d.moveTo(x + r, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, r);
    ctx2d.arcTo(x + w, y + h, x, y + h, r);
    ctx2d.arcTo(x, y + h, x, y, r);
    ctx2d.arcTo(x, y, x + w, y, r);
    ctx2d.closePath();
  }

  // Instantiate game
  const game = new SnakeGame();

  // Input: keyboard
  const KEY_TO_DIR = new Map([
    ["ArrowUp", Directions.Up],
    ["KeyW", Directions.Up],
    ["ArrowDown", Directions.Down],
    ["KeyS", Directions.Down],
    ["ArrowLeft", Directions.Left],
    ["KeyA", Directions.Left],
    ["ArrowRight", Directions.Right],
    ["KeyD", Directions.Right],
  ]);
  window.addEventListener("keydown", (e) => {
    if (KEY_TO_DIR.has(e.code)) {
      e.preventDefault();
      game.setDirection(KEY_TO_DIR.get(e.code));
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      game.togglePause();
      return;
    }
    if (e.code === "KeyR") {
      e.preventDefault();
      game.reset();
    }
  });

  // Input: on-screen buttons
  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    const dirName = btn.getAttribute("data-dir");
    const dir = Directions[capitalize(dirName)];
    const handler = (ev) => {
      ev.preventDefault();
      game.setDirection(dir);
    };
    btn.addEventListener("click", handler);
    btn.addEventListener("touchstart", handler, { passive: false });
  });

  // UI buttons
  btnRestart.addEventListener("click", () => game.reset());
  overlayRestart.addEventListener("click", () => game.reset());
  btnPause.addEventListener("click", () => game.togglePause());
  overlayResume.addEventListener("click", () => game.togglePause());

  function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  // Game loop
  function loop(now) {
    const dt = now - game.lastTickAt;
    game.lastTickAt = now;
    game.accumulator += dt;

    const interval = game.speedIntervalMs;
    while (game.accumulator >= interval) {
      game.accumulator -= interval;
      game.tick();
    }
    game.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();


