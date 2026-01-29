(() => {
  "use strict";

  function seededShuffle(arr, seedStr) {
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

  function factorToGrid(pieceCount) {
    const s = Math.round(Math.sqrt(pieceCount));
    return { rows: s, cols: s };
  }

  function clampInt(n, min, max) {
    n = Math.floor(Number(n || 0));
    if (!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function computeCellSize(cols) {
    if (cols <= 2) return 92;
    if (cols === 3) return 86;
    if (cols === 4) return 78;
    if (cols === 5) return 70;
    return 64;
  }

  function createPieceEl(index, rows, cols, imageUrl) {
    const r = Math.floor(index / cols);
    const c = index % cols;

    const piece = document.createElement("div");
    piece.className = "puz-piece";
    piece.dataset.index = String(index);

    piece.style.backgroundImage = `url("${imageUrl}")`;
    piece.style.backgroundSize = `calc(${cols} * 100%) calc(${rows} * 100%)`;

    const bx = cols === 1 ? "0%" : `${(c / (cols - 1)) * 100}%`;
    const by = rows === 1 ? "0%" : `${(r / (rows - 1)) * 100}%`;
    piece.style.backgroundPosition = `${bx} ${by}`;

    return piece;
  }

  async function initPuzzle({ CONTROL_API, parashaLabel }, bodyEl) {
    const url = `${CONTROL_API}?mode=puzzle&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.row) {
      bodyEl.innerHTML = `<div>לא נמצאו נתוני פאזל לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const imageUrl = String(data.row.imageUrl || data.row.image || "").trim();
    const desc = String(data.row.desc || data.row.description || "").trim();
    const level1 = Number(data.row.level1 || 0);
    const level2 = Number(data.row.level2 || 0);

    if (!imageUrl) {
      bodyEl.innerHTML = `<div>חסר נתיב תמונה לפאזל בפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const hasL1 = level1 > 0;
    const hasL2 = level2 > 0;
    const showLevelButtons = hasL1 && hasL2;

    bodyEl.innerHTML = `
      <div class="puz-topbar">
        ${
          showLevelButtons
            ? `<button type="button" class="puz-level" data-level="1" aria-pressed="true">רמה 1</button>`
            : ``
        }
        ${
          showLevelButtons
            ? `<button type="button" class="puz-level" data-level="2" aria-pressed="false">רמה 2</button>`
            : ``
        }
        <button type="button" class="puz-help">עזרה</button>
        <button type="button" class="puz-reset">איפוס</button>

        <div class="puz-stats" aria-live="polite">
          <span class="puz-moves"></span>
          <span class="puz-left"></span>
          <span class="puz-time"></span>
        </div>
      </div>

      <div class="puz-banner" aria-live="polite"></div>
      <div class="puz-desc"></div>

      <div class="puz-board">
        <div class="puz-grid"></div>
      </div>

      <div class="puz-tray-wrap">
        <button class="puz-arrow puz-leftbtn" type="button">◀</button>
        <div class="puz-tray"><div class="puz-tray-row"></div></div>
        <button class="puz-arrow puz-rightbtn" type="button">▶</button>
      </div>
    `;

    const descEl = bodyEl.querySelector(".puz-desc");
    const gridEl = bodyEl.querySelector(".puz-grid");
    const boardEl = bodyEl.querySelector(".puz-board");
    const trayRow = bodyEl.querySelector(".puz-tray-row");
    const banner = bodyEl.querySelector(".puz-banner");

    const btnReset = bodyEl.querySelector(".puz-reset");
    const btnHelp = bodyEl.querySelector(".puz-help");
    const btnL1 = bodyEl.querySelector('.puz-level[data-level="1"]');
    const btnL2 = bodyEl.querySelector('.puz-level[data-level="2"]');

    const btnLeft = bodyEl.querySelector(".puz-leftbtn");
    const btnRight = bodyEl.querySelector(".puz-rightbtn");

    const elMoves = bodyEl.querySelector(".puz-moves");
    const elLeft = bodyEl.querySelector(".puz-left");
    const elTime = bodyEl.querySelector(".puz-time");

    descEl.textContent = desc;

    let state = null;

    let timerStartMs = 0;
    let timerIntervalId = null;

    function stopTimer() {
      if (timerIntervalId) clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    function startTimer() {
      stopTimer();
      timerStartMs = Date.now();
      timerIntervalId = setInterval(updateStats, 1000);
    }

    function showBanner(text) {
      banner.textContent = text || "";
    }

    function setActiveLevel(levelNum) {
      if (!showLevelButtons) return;
      if (btnL1) btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
      if (btnL2) btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
    }

    function updateStats() {
      if (!state) return;
      const elapsed = timerStartMs ? Date.now() - timerStartMs : 0;
      elMoves.textContent = `מהלכים: ${state.moves}`;
      elLeft.textContent = `נשארו: ${state.remaining}`;
      elTime.textContent = `זמן: ${formatTime(elapsed)}`;
    }

    function markCompletedIfNeeded() {
      if (!state) return;
      if (state.remaining <= 0) {
        stopTimer();
        updateStats();
        showBanner("🎉 כל הכבוד! הפאזל הושלם!");
      }
    }

    function reset(requestedLevel) {
      const levelNum = showLevelButtons ? (requestedLevel === 2 ? 2 : 1) : 1;
      const partsWanted = levelNum === 2 ? level2 : level1;
      const parts = clampInt(partsWanted, 4, 100);

      const { rows, cols } = factorToGrid(parts);
      const cell = computeCellSize(cols);

      state = {
        level: levelNum,
        rows,
        cols,
        parts,
        remaining: parts,
        moves: 0,
        shuffleNonce: (state?.shuffleNonce || 0) + 1,
      };

      setActiveLevel(levelNum);
      showBanner("");

      // style board background (faded full image) is done in puzzle.css.
      boardEl.style.setProperty("--puz-img", `url("${imageUrl}")`);
      boardEl.style.setProperty("--puz-fade", ".18");

      gridEl.innerHTML = "";
      trayRow.innerHTML = "";

      gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
      gridEl.style.gap = "8px";
      gridEl.style.padding = "10px";

      // target cells
      for (let i = 0; i < parts; i++) {
        const cellEl = document.createElement("div");
        cellEl.className = "puz-cell";
        cellEl.dataset.index = String(i);
        cellEl.style.width = `${cell}px`;
        cellEl.style.height = `${cell}px`;
        gridEl.appendChild(cellEl);
      }

      // tray pieces (shuffled)
      const order = seededShuffle(
        Array.from({ length: parts }, (_, i) => i),
        `${parashaLabel}|${parts}|puzzle|${state.shuffleNonce}`
      );

      order.forEach((idx) => {
        const slot = document.createElement("div");
        slot.className = "puz-tray-slot";
        slot.style.width = `${cell}px`;
        slot.style.height = `${cell}px`;

        const piece = createPieceEl(idx, rows, cols, imageUrl);
        slot.appendChild(piece);
        trayRow.appendChild(slot);
      });

      startTimer();
      updateStats();
    }

    // tray arrows
    btnLeft.addEventListener("click", () => trayRow.scrollBy({ left: -240, behavior: "smooth" }));
    btnRight.addEventListener("click", () => trayRow.scrollBy({ left: 240, behavior: "smooth" }));

    // help: show full image for 3 seconds
    btnHelp.addEventListener("click", () => {
      const prev = boardEl.style.getPropertyValue("--puz-fade") || ".18";
      boardEl.style.setProperty("--puz-fade", "0.95");
      setTimeout(() => boardEl.style.setProperty("--puz-fade", prev || ".18"), 3000);
    });

    btnReset.addEventListener("click", () => reset(state?.level || 1));
    if (showLevelButtons) {
      btnL1.addEventListener("click", () => reset(1));
      btnL2.addEventListener("click", () => reset(2));
    }

    // --- Drag (pointer) with magnet ---
    let drag = null;

    function makeGhost(pieceEl, sizePx) {
      const ghost = document.createElement("div");
      ghost.className = "puz-drag-ghost";
      ghost.style.width = `${sizePx}px`;
      ghost.style.height = `${sizePx}px`;
      ghost.style.position = "fixed";
      ghost.style.zIndex = "999999";
      ghost.style.pointerEvents = "none";
      ghost.style.transform = "translate(-50%, -50%)";

      const clone = pieceEl.cloneNode(true);
      clone.style.width = "100%";
      clone.style.height = "100%";
      ghost.appendChild(clone);

      document.body.appendChild(ghost);
      return ghost;
    }

    function findDropCellAt(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest(".puz-cell");
    }

    function snapIfCorrect(cellEl, idx, x, y) {
      const cellIdx = Number(cellEl.dataset.index || -1);
      if (cellIdx !== idx) return false;

      const rect = cellEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dist = Math.hypot(x - cx, y - cy);
      const tol = Math.max(10, rect.width * 0.28);
      return dist <= tol;
    }

    function placeIntoCell(cellEl, idx) {
      const piece = createPieceEl(idx, state.rows, state.cols, imageUrl);
      piece.style.cursor = "default";
      piece.style.boxShadow = "none";
      piece.style.border = "0";
      piece.style.borderRadius = "0";
      cellEl.innerHTML = "";
      cellEl.appendChild(piece);
      state.remaining -= 1;
    }

    function onPointerDown(ev) {
      const piece = ev.target.closest(".puz-piece");
      if (!piece) return;

      ev.preventDefault();

      const idx = Number(piece.dataset.index || -1);
      if (!Number.isFinite(idx) || idx < 0) return;

      const slot = piece.parentElement;
      if (!slot) return;

      const sizePx = slot.getBoundingClientRect().width || 76;
      const ghost = makeGhost(piece, sizePx);
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;

      piece.style.opacity = "0.35";

      drag = { idx, piece, slot, ghost, sizePx };

      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp, { passive: false, once: true });
    }

    function onPointerMove(ev) {
      if (!drag) return;
      ev.preventDefault();
      drag.ghost.style.left = `${ev.clientX}px`;
      drag.ghost.style.top = `${ev.clientY}px`;
    }

    function onPointerUp(ev) {
      window.removeEventListener("pointermove", onPointerMove);
      if (!drag || !state || state.remaining <= 0) return;

      const { idx, piece, slot, ghost } = drag;
      drag = null;

      piece.style.opacity = "1";
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);

      const cellEl = findDropCellAt(ev.clientX, ev.clientY);
      if (!cellEl) return;
      if (cellEl.querySelector(".puz-piece")) return;

      if (!snapIfCorrect(cellEl, idx, ev.clientX, ev.clientY)) return;

      state.moves += 1;
      placeIntoCell(cellEl, idx);
      slot.remove();

      updateStats();
      showBanner("✨ יפה! עוד חלק במקום");
      markCompletedIfNeeded();
    }

    trayRow.addEventListener("pointerdown", onPointerDown);

    // init
    reset(1);

    return { reset: () => reset(1) };
  }

  // ====== REGISTER ======
  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames.registry = window.ParashaGames.registry || new Map();

  const register = window.ParashaGamesRegister
    ? window.ParashaGamesRegister
    : (id, factory) => window.ParashaGames.registry.set(id, factory);

  register("puzzle", ({ CONTROL_API, parashaLabel }) => ({
    init: async (bodyEl) => initPuzzle({ CONTROL_API, parashaLabel }, bodyEl),
  }));
})();
