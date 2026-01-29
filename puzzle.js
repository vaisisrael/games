// puzzle.js – Parasha Games: Puzzle (drag on mobile via Pointer Events)
// CSS is injected from this file (so we keep 2 GitHub files total as requested).

(() => {
  "use strict";

  // --- register infrastructure (same pattern as memory.js) ---
  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames._registry = window.ParashaGames._registry || new Map();
  window.ParashaGames.register =
    window.ParashaGames.register ||
    function (id, factoryFn) {
      window.ParashaGames._registry.set(id, factoryFn);
    };

  // --- CSS injection once ---
  const STYLE_ID = "pg-puzzle-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
[data-parasha-games]{
  --pz-border: rgba(0,0,0,.10);
  --pz-shadow: 0 10px 25px rgba(0,0,0,.08);
  --pz-shadow2: 0 14px 28px rgba(0,0,0,.10);
  --pz-muted: rgba(17,24,39,.60);
  --pz-accent: rgba(37,99,235,.35);
  font-family: inherit;
}

[data-parasha-games] .pz-wrap{
  border: 1px solid var(--pz-border);
  border-radius: 14px;
  box-shadow: var(--pz-shadow);
  background: linear-gradient(180deg, rgba(246,247,251,1), #fff);
  padding: 12px;
}

[data-parasha-games] .pz-caption{
  font-weight: 800;
  font-size: 14px;
  color: rgba(17,24,39,.85);
  margin-bottom: 10px;
}

[data-parasha-games] .pz-topbar{
  display:flex;
  align-items:center;
  justify-content:flex-start;
  flex-wrap:wrap;
  gap: 6px;
  margin-bottom: 10px;
}

[data-parasha-games] .pz-topbar button{
  font-family: inherit;
  cursor:pointer;
  border: 1px solid var(--pz-border);
  background: linear-gradient(90deg, rgba(37,99,235,.10), rgba(124,58,237,.08));
  border-radius: 12px;
  padding: 7px 10px;
  font-weight: 800;
  font-size: 14px;
  color: rgba(17,24,39,.92);
  box-shadow: 0 6px 14px rgba(0,0,0,.06);
  transition: box-shadow .12s ease, border-color .12s ease;
}

[data-parasha-games] .pz-topbar button:hover{
  box-shadow: 0 10px 22px rgba(0,0,0,.08);
  border-color: var(--pz-accent);
}

[data-parasha-games] .pz-level[aria-pressed="true"]{
  border-color: rgba(37,99,235,.55);
  box-shadow: 0 10px 22px rgba(37,99,235,.12);
}

[data-parasha-games] .pz-stats{
  margin-inline-start:auto;
  display:inline-flex;
  align-items:center;
  gap:10px;
  color: var(--pz-muted);
  font-weight: 800;
  font-size: 14px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

[data-parasha-games] .pz-area{
  display:grid;
  gap: 12px;
  justify-items:center;
}

[data-parasha-games] .pz-board{
  position: relative;
  width: min(92vw, 420px);
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 10px 25px rgba(0,0,0,.06);
  background: #fff;
  touch-action: none; /* important: prevent scroll while dragging on board */
}

[data-parasha-games] .pz-board.pz-helping{
  pointer-events: none;
}

[data-parasha-games] .pz-img{
  position:absolute;
  inset:0;
  background-repeat:no-repeat;
  background-size: cover;
  background-position:center;
  transition: opacity .18s ease, filter .18s ease;
}

[data-parasha-games] .pz-img.pz-faded{
  opacity: .16;
  filter: blur(1.5px) saturate(.9);
}

[data-parasha-games] .pz-grid{
  position:absolute;
  inset:0;
  display:grid;
  gap: 0;
}

[data-parasha-games] .pz-cell{
  border: 1px solid rgba(0,0,0,.08);
  background: transparent;
  position: relative;
}

[data-parasha-games] .pz-cell.pz-hover{
  outline: 3px solid rgba(37,99,235,.22);
  outline-offset: -3px;
}

[data-parasha-games] .pz-piece-in-cell{
  position:absolute;
  inset:0;
  background-repeat:no-repeat;
  border-radius: 8px;
}

[data-parasha-games] .pz-pre{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap: 10px;
  width: 100%;
}

[data-parasha-games] .pz-pre .pz-board{
  width: min(92vw, 420px);
}

[data-parasha-games] .pz-banner{
  min-height: 30px;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,.06);
  background: rgba(255,255,255,.74);
  box-shadow: 0 8px 18px rgba(0,0,0,.05);
  color: rgba(17,24,39,.85);
  font-weight: 800;
  font-size: 13px;
  opacity: 0;
  transform: translateY(2px);
  transition: opacity .18s ease, transform .18s ease;
}

[data-parasha-games] .pz-banner.pz-banner--show{
  opacity: 1;
  transform: translateY(0);
}

[data-parasha-games] .pz-film{
  width: min(92vw, 520px);
  position: relative;
}

[data-parasha-games] .pz-film-viewport{
  overflow-x:auto;
  overflow-y:hidden;
  scroll-behavior:smooth;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,.08);
  background: rgba(255,255,255,.65);
  box-shadow: 0 8px 18px rgba(0,0,0,.05);
  padding: 10px;
  -webkit-overflow-scrolling: touch;
}

[data-parasha-games] .pz-film-row{
  display:flex;
  gap: 10px;
  align-items:center;
}

[data-parasha-games] .pz-arrow{
  position:absolute;
  top:50%;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(255,255,255,.85);
  box-shadow: 0 8px 18px rgba(0,0,0,.06);
  cursor:pointer;
  display:grid;
  place-items:center;
  font-weight: 900;
  color: rgba(17,24,39,.70);
}

[data-parasha-games] .pz-arrow[disabled]{
  opacity: .35;
  cursor: default;
}

[data-parasha-games] .pz-arrow.left{ left: -8px; }
[data-parasha-games] .pz-arrow.right{ right: -8px; }

[data-parasha-games] .pz-tile{
  flex: 0 0 auto;
  width: 78px;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: 0 8px 18px rgba(0,0,0,.07);
  background-repeat:no-repeat;
  background-size: 100% 100%;
  background-position:center;
  position: relative;
  touch-action: none; /* important: prevent scroll while dragging on tile */
}

[data-parasha-games] .pz-tile.pz-drag-dim{
  opacity: .35;
}

[data-parasha-games] .pz-drag-ghost{
  position: fixed;
  width: 88px;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,.10);
  box-shadow: var(--pz-shadow2);
  background-repeat:no-repeat;
  z-index: 999999;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1.10);
}

@media (prefers-reduced-motion: reduce){
  [data-parasha-games] .pz-img{ transition:none; }
  [data-parasha-games] .pz-banner{ transition:none; }
}
`;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // --- helpers ---
  function showBanner(el, text) {
    el.textContent = text || "";
    el.classList.remove("pz-banner--show");
    void el.offsetWidth;
    if (text) el.classList.add("pz-banner--show");
  }

  function hashStringToUint32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, seedStr) {
    const a = arr.slice();
    const rand = mulberry32(hashStringToUint32(seedStr));
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function clampParts(n) {
    const x = Number(n || 0);
    return Number.isFinite(x) && x > 0 ? x : 0;
  }

  function sqrtInt(n) {
    const r = Math.sqrt(n);
    const i = Math.round(r);
    return i * i === n ? i : i; // user asked: no invalid-message; we assume correct input
  }

  // --- puzzle factory ---
  function factory({ CONTROL_API, parashaLabel }) {
    ensureStyle();

    async function init(gameBody) {
      const url = `${CONTROL_API}?mode=puzzle&parasha=${encodeURIComponent(parashaLabel)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data || !data.row) {
        gameBody.innerHTML = `<div>לא נמצאו נתוני פאזל לפרשה זו.</div>`;
        return { reset: () => {} };
      }

      const row = data.row;

      const model = {
        parashaLabel,
        imageUrl: String(row.imageUrl || "").trim(),
        caption: String(row.caption || "").trim(),
        level1: clampParts(row.level1),
        level2: clampParts(row.level2),
      };

      return render(gameBody, model);
    }

    function render(body, model) {
      const hasL1 = clampParts(model.level1) > 0;
      const hasL2 = clampParts(model.level2) > 0;
      const showLevels = hasL1 && hasL2;

      body.innerHTML = `
        <div class="pz-wrap">
          <div class="pz-caption"></div>

          <div class="pz-topbar">
            ${showLevels ? `<button type="button" class="pz-level" data-level="1" aria-pressed="true">רמה 1</button>` : ``}
            ${showLevels ? `<button type="button" class="pz-level" data-level="2" aria-pressed="false">רמה 2</button>` : ``}
            <button type="button" class="pz-help">עזרה</button>
            <button type="button" class="pz-reset">איפוס</button>

            <div class="pz-stats" aria-live="polite">
              <span class="pz-moves"></span>
              <span class="pz-time"></span>
              <span class="pz-progress"></span>
            </div>
          </div>

          <div class="pz-banner" aria-live="polite"></div>

          <div class="pz-area">
            <div class="pz-pre">
              <div class="pz-board">
                <div class="pz-img"></div>
                <div class="pz-grid"></div>
              </div>
              <button type="button" class="pz-start">התחל פאזל</button>
            </div>

            <div class="pz-play" style="display:none;">
              <div class="pz-board">
                <div class="pz-img"></div>
                <div class="pz-grid"></div>
              </div>

              <div class="pz-film">
                <button class="pz-arrow left" type="button" aria-label="שמאלה">‹</button>
                <div class="pz-film-viewport">
                  <div class="pz-film-row"></div>
                </div>
                <button class="pz-arrow right" type="button" aria-label="ימינה">›</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const captionEl = body.querySelector(".pz-caption");
      const bannerEl = body.querySelector(".pz-banner");

      const preWrap = body.querySelector(".pz-pre");
      const playWrap = body.querySelector(".pz-play");

      const preBoard = preWrap.querySelector(".pz-board");
      const preImg = preWrap.querySelector(".pz-img");
      const preGrid = preWrap.querySelector(".pz-grid");
      const btnStart = preWrap.querySelector(".pz-start");

      const playBoard = playWrap.querySelector(".pz-board");
      const playImg = playWrap.querySelector(".pz-img");
      const playGrid = playWrap.querySelector(".pz-grid");

      const filmViewport = playWrap.querySelector(".pz-film-viewport");
      const filmRow = playWrap.querySelector(".pz-film-row");
      const arrowL = playWrap.querySelector(".pz-arrow.left");
      const arrowR = playWrap.querySelector(".pz-arrow.right");

      const btnHelp = body.querySelector(".pz-help");
      const btnReset = body.querySelector(".pz-reset");
      const btnL1 = body.querySelector('.pz-level[data-level="1"]');
      const btnL2 = body.querySelector('.pz-level[data-level="2"]');

      const elMoves = body.querySelector(".pz-moves");
      const elTime = body.querySelector(".pz-time");
      const elProgress = body.querySelector(".pz-progress");

      captionEl.textContent = model.caption || "";

      let state = {
        level: 1,
        parts: model.level1,
        n: sqrtInt(model.level1),
        started: false,
        moves: 0,
        placed: 0,
        total: 0,
        timerStart: 0,
        timerId: null,
        shuffleNonce: 0,
        dragging: null, // { idx, tileEl, ghostEl, pointerId }
        helping: false,
      };

      function setActiveLevel(levelNum) {
        if (!showLevels) return;
        if (btnL1) btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
        if (btnL2) btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
      }

      function stopTimer() {
        if (state.timerId) clearInterval(state.timerId);
        state.timerId = null;
      }

      function startTimer() {
        stopTimer();
        state.timerStart = Date.now();
        state.timerId = setInterval(updateStats, 1000);
      }

      function updateStats() {
        const elapsed = state.timerStart ? Date.now() - state.timerStart : 0;
        elMoves.textContent = `מהלכים: ${state.moves}`;
        elTime.textContent = `זמן: ${formatTime(elapsed)}`;
        elProgress.textContent = `הושלם: ${state.placed}/${state.total}`;
      }

      function setImg(el, url) {
        el.style.backgroundImage = url ? `url("${url}")` : "none";
      }

      function buildGrid(containerGrid, n) {
        containerGrid.innerHTML = "";
        containerGrid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
        containerGrid.style.gridTemplateRows = `repeat(${n}, 1fr)`;

        for (let i = 0; i < n * n; i++) {
          const cell = document.createElement("div");
          cell.className = "pz-cell";
          cell.dataset.idx = String(i);
          containerGrid.appendChild(cell);
        }
      }

      function applyPieceBackground(el, n, idx, imageUrl) {
        const r = Math.floor(idx / n);
        const c = idx % n;

        el.style.backgroundImage = `url("${imageUrl}")`;
        el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
        el.style.backgroundPosition = `${(c * 100) / (n - 1)}% ${(r * 100) / (n - 1)}%`;
      }

      function buildPreview() {
        const parts = state.parts;
        state.n = sqrtInt(parts);

        setImg(preImg, model.imageUrl);
        preImg.classList.remove("pz-faded");

        buildGrid(preGrid, state.n);
      }

      function buildPlay() {
        const parts = state.parts;
        state.n = sqrtInt(parts);

        state.started = true;
        state.moves = 0;
        state.placed = 0;
        state.total = state.n * state.n;

        // board
        setImg(playImg, model.imageUrl);
        playImg.classList.add("pz-faded");

        buildGrid(playGrid, state.n);

        // film pieces
        filmRow.innerHTML = "";

        const indices = Array.from({ length: state.total }, (_, i) => i);
        state.shuffleNonce += 1;
        const shuffled = seededShuffle(
          indices,
          `${model.parashaLabel}|${state.total}|puzzle|${state.shuffleNonce}`
        );

        shuffled.forEach((idx) => {
          const tile = document.createElement("div");
          tile.className = "pz-tile";
          tile.dataset.idx = String(idx);
          applyPieceBackground(tile, state.n, idx, model.imageUrl);
          filmRow.appendChild(tile);
        });

        updateArrows();
        startTimer();
        updateStats();
        showBanner(bannerEl, "");

        // UI switch
        preWrap.style.display = "none";
        playWrap.style.display = "block";
      }

      function reset(levelReq) {
        // reset always returns to preview (not auto-start), so child can see the grid meaning.
        stopTimer();
        state.started = false;
        state.helping = false;
        state.dragging = null;

        const levelNum = showLevels ? (levelReq === 2 ? 2 : 1) : 1;
        state.level = levelNum;
        state.parts = levelNum === 2 ? model.level2 : model.level1;

        setActiveLevel(levelNum);

        // show preview again
        playWrap.style.display = "none";
        preWrap.style.display = "flex";

        // rebuild preview grid
        buildPreview();

        // reset stats
        state.moves = 0;
        state.placed = 0;
        state.total = state.n * state.n;
        state.timerStart = 0;
        updateStats();
        showBanner(bannerEl, "");
      }

      function finish() {
        stopTimer();
        playImg.classList.remove("pz-faded");
        showBanner(bannerEl, "🎉 כל הכבוד! סיימת!");
      }

      function updateArrows() {
        const maxScroll = filmViewport.scrollWidth - filmViewport.clientWidth;
        const x = filmViewport.scrollLeft;

        arrowL.disabled = x <= 0;
        arrowR.disabled = x >= maxScroll - 1;
      }

      function scrollFilm(dir) {
        const step = 3 * 88; // ~3 tiles
        filmViewport.scrollBy({ left: dir * step, behavior: "smooth" });
      }

      filmViewport.addEventListener("scroll", () => updateArrows());
      arrowL.addEventListener("click", () => scrollFilm(-1));
      arrowR.addEventListener("click", () => scrollFilm(1));

      // --- drag logic (Pointer Events) ---
      function clearCellHover() {
        playGrid.querySelectorAll(".pz-cell.pz-hover").forEach((c) => c.classList.remove("pz-hover"));
      }

      function cellFromPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const cell = el.closest && el.closest(".pz-cell");
        return cell || null;
      }

      function createGhostFromTile(tile, x, y) {
        const ghost = document.createElement("div");
        ghost.className = "pz-drag-ghost";
        ghost.style.left = x + "px";
        ghost.style.top = y + "px";

        // copy bg
        ghost.style.backgroundImage = tile.style.backgroundImage;
        ghost.style.backgroundSize = tile.style.backgroundSize;
        ghost.style.backgroundPosition = tile.style.backgroundPosition;

        document.body.appendChild(ghost);
        return ghost;
      }

      function startDrag(tile, ev) {
        if (!state.started) return;
        if (state.helping) return;
        if (state.dragging) return;

        const idx = Number(tile.dataset.idx);
        tile.classList.add("pz-drag-dim");

        const ghost = createGhostFromTile(tile, ev.clientX, ev.clientY);

        state.dragging = {
          idx,
          tileEl: tile,
          ghostEl: ghost,
          pointerId: ev.pointerId,
        };

        // prevent film scroll while dragging
        filmViewport.style.overflowX = "hidden";
        playBoard.style.touchAction = "none";

        tile.setPointerCapture(ev.pointerId);
      }

      function moveDrag(ev) {
        if (!state.dragging) return;
        if (state.dragging.pointerId !== ev.pointerId) return;

        state.dragging.ghostEl.style.left = ev.clientX + "px";
        state.dragging.ghostEl.style.top = ev.clientY + "px";

        clearCellHover();
        const cell = cellFromPoint(ev.clientX, ev.clientY);
        if (cell && playBoard.contains(cell)) cell.classList.add("pz-hover");
      }

      function endDrag(ev) {
        if (!state.dragging) return;
        if (state.dragging.pointerId !== ev.pointerId) return;

        const { idx, tileEl, ghostEl } = state.dragging;

        // restore film scroll
        filmViewport.style.overflowX = "auto";

        clearCellHover();

        const cell = cellFromPoint(ev.clientX, ev.clientY);
        const insideBoard = cell && playBoard.contains(cell);

        if (insideBoard) {
          // count a move only if dropped inside board
          state.moves += 1;

          const targetIdx = Number(cell.dataset.idx);
          const alreadyHas = cell.querySelector(".pz-piece-in-cell");

          if (!alreadyHas && targetIdx === idx) {
            // place piece
            const piece = document.createElement("div");
            piece.className = "pz-piece-in-cell";
            applyPieceBackground(piece, state.n, idx, model.imageUrl);
            cell.appendChild(piece);

            // remove from film
            tileEl.remove();
            state.placed += 1;

            updateArrows();
            updateStats();

            if (state.placed >= state.total) finish();
          } else {
            // wrong place -> return (just undim)
            tileEl.classList.remove("pz-drag-dim");
            updateStats();
          }
        } else {
          // dropped outside board -> no move count
          tileEl.classList.remove("pz-drag-dim");
        }

        ghostEl.remove();
        state.dragging = null;
      }

      filmRow.addEventListener("pointerdown", (ev) => {
        const tile = ev.target.closest(".pz-tile");
        if (!tile) return;
        // prevent page scroll on mobile while dragging
        ev.preventDefault();
        startDrag(tile, ev);
      });

      document.addEventListener("pointermove", (ev) => {
        if (!state.dragging) return;
        ev.preventDefault();
        moveDrag(ev);
      }, { passive: false });

      document.addEventListener("pointerup", (ev) => {
        if (!state.dragging) return;
        endDrag(ev);
      });

      // --- help logic: show full image for 3 seconds ---
      let helpTimeout = null;
      function runHelp() {
        if (!state.started) return;
        if (state.helping) return;
        if (state.dragging) return;

        state.helping = true;
        playBoard.classList.add("pz-helping");

        // full image
        playImg.classList.remove("pz-faded");

        // disable dragging by pointer-events (board) + ignore startDrag via state.helping
        if (helpTimeout) clearTimeout(helpTimeout);
        helpTimeout = setTimeout(() => {
          playImg.classList.add("pz-faded");
          playBoard.classList.remove("pz-helping");
          state.helping = false;
        }, 3000);
      }

      // --- events buttons ---
      btnStart.addEventListener("click", () => {
        buildPlay();
      });

      btnHelp.addEventListener("click", () => {
        runHelp();
      });

      btnReset.addEventListener("click", () => {
        // reset to preview of current level
        reset(state.level);
      });

      if (showLevels) {
        btnL1.addEventListener("click", () => {
          // if playing: go to preview (reset) for clarity
          reset(1);
        });
        btnL2.addEventListener("click", () => {
          reset(2);
        });
      }

      // initial preview (default level 1)
      state.level = 1;
      state.parts = model.level1;
      setActiveLevel(1);
      buildPreview();
      updateStats();

      return {
        reset: () => reset(1),
      };
    }

    return { init };
  }

  window.ParashaGames.register("puzzle", factory);
})();
