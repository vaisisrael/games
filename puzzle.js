/* puzzle.js
 * Parasha Weekly – Puzzle (grid jigsaw) – Pointer Events drag & drop (mobile-first)
 * Expected: games.js loads this file and then calls the registered module.
 * Register API: window.ParashaGamesRegister("puzzle", module)
 *
 * Module init supports:
 *   init(rootEl, ctx)
 * where ctx may include:
 *   - parasha: string
 *   - apiUrl / CONTROL_API: string (Apps Script web app URL)
 *   - row: { parasha, imageUrl, caption, level1, level2 }
 */

(function () {
  "use strict";

  // ---------- utils ----------
  function el(tag, cls, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        if (k === "text") e.textContent = v;
        else if (k === "html") e.innerHTML = v;
        else e.setAttribute(k, String(v));
      }
    }
    return e;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function asInt(v) {
    const n = parseInt(String(v || "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  function isTruthy(v) {
    if (v === true) return true;
    const s = String(v || "").trim().toLowerCase();
    return s === "true" || s === "yes" || s === "1";
  }

  // xorshift32 PRNG for shuffle
  function makeRng(seed) {
    let x = (seed >>> 0) || 2463534242;
    return function rand() {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17; x >>>= 0;
      x ^= x << 5;  x >>>= 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, seed) {
    const rnd = makeRng(seed);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function formatTime(sec) {
    sec = Math.max(0, sec | 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  async function fetchPuzzleRow(apiUrl, parasha) {
    if (!apiUrl) throw new Error("Missing apiUrl/CONTROL_API");
    const url = apiUrl + (apiUrl.includes("?") ? "&" : "?") + "mode=puzzle&parasha=" + encodeURIComponent(parasha || "");
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!data || data.ok !== true || !data.row) throw new Error("Bad puzzle response");
    return data.row;
  }

  function computeSideFromN(N) {
    const side = Math.round(Math.sqrt(N));
    // per your spec: assume user provides perfect squares; do not show errors.
    return Math.max(1, side);
  }

  function pieceStyle(imageUrl, side, index) {
    const r = Math.floor(index / side);
    const c = index % side;
    const size = `${side * 100}% ${side * 100}%`;
    const posX = side === 1 ? "0%" : `${(c / (side - 1)) * 100}%`;
    const posY = side === 1 ? "0%" : `${(r / (side - 1)) * 100}%`;
    return {
      backgroundImage: `url("${imageUrl}")`,
      backgroundSize: size,
      backgroundPosition: `${posX} ${posY}`,
      backgroundRepeat: "no-repeat",
    };
  }

  // ---------- module ----------
  const PuzzleModule = {
    name: "puzzle",
    async init(rootEl, ctx) {
      // ctx can arrive in different shapes depending on your games.js
      const parasha = (ctx && (ctx.parasha || (ctx.row && ctx.row.parasha))) || "";
      const apiUrl = (ctx && (ctx.apiUrl || ctx.CONTROL_API || ctx.controlApi || ctx.control_api)) || "";
      let row = (ctx && ctx.row) ? ctx.row : null;

      // If we didn't get row injected, fetch it.
      if (!row) {
        row = await fetchPuzzleRow(apiUrl, parasha);
      }

      // ---- validate minimal fields (quietly) ----
      const imageUrl = String(row.imageUrl || "").trim();
      const caption = String(row.caption || "").trim();
      const level1 = asInt(row.level1) || 9;
      const level2 = asInt(row.level2);

      // UI structure (names intentionally "puz-*" to avoid clashes; your puzzle.css already styles these)
      rootEl.innerHTML = "";
      const card = el("div", "puz-card");
      const top = el("div", "puz-top");
      const leftStats = el("div", "puz-stats");
      const rightBtns = el("div", "puz-actions");

      // Stats
      const statMoves = el("div", "puz-stat", { html: `<span class="puz-stat-label">מהלכים</span><span class="puz-stat-val" data-moves>0</span>` });
      const statTime  = el("div", "puz-stat", { html: `<span class="puz-stat-label">זמן</span><span class="puz-stat-val" data-time>00:00</span>` });
      leftStats.append(statMoves, statTime);

      // Buttons
      const btnStart = el("button", "puz-btn puz-start", { type: "button", text: "התחל" });
      const btnHelp  = el("button", "puz-btn puz-help",  { type: "button", text: "עזרה" });
      const btnReset = el("button", "puz-btn puz-reset", { type: "button", text: "איפוס" });

      // Levels (only if level2 exists)
      const levelsWrap = el("div", "puz-levels");
      const hasLevel2 = Number.isFinite(level2) && level2 > 0;
      let btnL1 = null, btnL2 = null;

      if (hasLevel2) {
        btnL1 = el("button", "puz-btn puz-level", { type: "button", "data-level": "1", text: "רמה 1" });
        btnL2 = el("button", "puz-btn puz-level", { type: "button", "data-level": "2", text: "רמה 2" });
        levelsWrap.append(btnL1, btnL2);
      }

      // Place buttons right side (levels + start/help/reset)
      if (hasLevel2) rightBtns.append(levelsWrap);
      rightBtns.append(btnStart, btnHelp, btnReset);

      top.append(leftStats, rightBtns);

      // Caption
      const captionEl = caption ? el("div", "puz-caption", { text: caption }) : null;

      // Board + tray
      const boardWrap = el("div", "puz-board-wrap");
      const board = el("div", "puz-board");
      const grid = el("div", "puz-grid"); // cells
      const overlay = el("div", "puz-overlay"); // for "start state" and "finish banner"
      const overlayInner = el("div", "puz-overlay-inner");
      overlay.appendChild(overlayInner);

      board.append(grid, overlay);
      boardWrap.appendChild(board);

      const trayWrap = el("div", "puz-tray-wrap");
      const trayHintL = el("div", "puz-tray-hint puz-tray-hint-left");
      const trayHintR = el("div", "puz-tray-hint puz-tray-hint-right");
      const tray = el("div", "puz-tray");
      trayWrap.append(trayHintL, tray, trayHintR);

      card.append(top);
      if (captionEl) card.append(captionEl);
      card.append(boardWrap, trayWrap);

      rootEl.appendChild(card);

      // ---------- state ----------
      const state = {
        imageUrl,
        levelN1: level1,
        levelN2: hasLevel2 ? level2 : null,
        currentLevel: 1,
        N: level1,
        side: computeSideFromN(level1),
        started: false,
        finished: false,
        placedCount: 0,
        moves: 0,
        sec: 0,
        timerId: null,
        helpTimeout: null,
        drag: null, // {pieceEl, ghostEl, index, pointerId}
        seedNonce: 0,
      };

      const movesEl = card.querySelector("[data-moves]");
      const timeEl = card.querySelector("[data-time]");

      function setMoves(n) {
        state.moves = n;
        movesEl.textContent = String(n);
      }
      function setTime(sec) {
        state.sec = sec | 0;
        timeEl.textContent = formatTime(state.sec);
      }

      function stopTimer() {
        if (state.timerId) {
          clearInterval(state.timerId);
          state.timerId = null;
        }
      }
      function startTimer() {
        if (state.timerId) return;
        state.timerId = setInterval(() => {
          state.sec += 1;
          timeEl.textContent = formatTime(state.sec);
        }, 1000);
      }

      function setBoardBackgroundOpacity(opacity) {
        // rely on puzzle.css for .puz-board background image layer if exists;
        // here we also set inline fallback:
        board.style.setProperty("--puz-bg-opacity", String(opacity));
      }

      function applyBoardBackgroundFull() {
        // show full image (not dim) as background on board itself
        board.style.backgroundImage = `url("${state.imageUrl}")`;
        board.style.backgroundSize = "cover";
        board.style.backgroundPosition = "center";
        board.style.backgroundRepeat = "no-repeat";
        setBoardBackgroundOpacity(1);
      }

      function applyBoardBackgroundDim() {
        board.style.backgroundImage = `url("${state.imageUrl}")`;
        board.style.backgroundSize = "cover";
        board.style.backgroundPosition = "center";
        board.style.backgroundRepeat = "no-repeat";
        setBoardBackgroundOpacity(0.18); // dim like "helper background"
      }

      function clearOverlay() {
        overlayInner.innerHTML = "";
        overlay.classList.remove("is-visible");
      }

      function showOverlay(kind, html) {
        overlayInner.innerHTML = html;
        overlay.classList.add("is-visible");
        overlay.setAttribute("data-kind", kind);
      }

      function showStartOverlay() {
        // Full image + start button overlay (no alert)
        showOverlay(
          "start",
          `
            <div class="puz-start-box">
              <div class="puz-start-title">פאזל</div>
              <div class="puz-start-sub">לחצו “התחל” כדי להתחיל לגרור חתיכות אל הלוח</div>
              <button class="puz-btn puz-start-overlay" type="button">התחל</button>
            </div>
          `
        );
        const overlayBtn = overlayInner.querySelector(".puz-start-overlay");
        if (overlayBtn) overlayBtn.onclick = () => beginGame();
      }

      function showWinOverlay() {
        showOverlay(
          "win",
          `
            <div class="puz-win-box">
              <div class="puz-win-title">כל הכבוד! 🎉</div>
              <div class="puz-win-sub">סיימתם את הפאזל.</div>
            </div>
          `
        );
      }

      function setLevelActiveUI() {
        if (!hasLevel2) return;
        btnL1.classList.toggle("is-active", state.currentLevel === 1);
        btnL2.classList.toggle("is-active", state.currentLevel === 2);
      }

      function buildGrid() {
        grid.innerHTML = "";
        grid.style.setProperty("--puz-side", String(state.side));
        // build cells
        for (let i = 0; i < state.N; i++) {
          const cell = el("div", "puz-cell", { "data-cell": String(i), "data-filled": "0" });
          // optional: show subtle grid lines via CSS; here just append
          grid.appendChild(cell);
        }
      }

      function clearTray() {
        tray.innerHTML = "";
      }

      function buildTrayPieces(seed) {
        clearTray();
        const indices = Array.from({ length: state.N }, (_, i) => i);
        shuffle(indices, seed);

        for (const idx of indices) {
          const p = el("div", "puz-piece", { "data-piece": String(idx), role: "button", tabindex: "0" });
          const st = pieceStyle(state.imageUrl, state.side, idx);
          Object.assign(p.style, st);

          // pointer events for drag
          p.addEventListener("pointerdown", onPiecePointerDown, { passive: false });

          // keyboard fallback (optional minimal): Enter tries to "select" (we keep it simple)
          p.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
            }
          });

          tray.appendChild(p);
        }

        // mobile hint: keep half piece visible on both sides handled by CSS;
        // we also ensure tray is scrollable.
        tray.scrollLeft = 0;
      }

      function resetCounters() {
        setMoves(0);
        setTime(0);
        state.placedCount = 0;
        state.finished = false;
      }

      function setStartedUI(started) {
        state.started = started;
        // When started: dim background and show tray; before start: full image and hide tray
        trayWrap.classList.toggle("is-hidden", !started);
        btnStart.disabled = started;
      }

      function lockCell(cellEl, pieceIndex) {
        // lock only if correct cell for pieceIndex
        const cellIndex = parseInt(cellEl.getAttribute("data-cell"), 10);
        if (cellIndex !== pieceIndex) return false;
        if (cellEl.getAttribute("data-filled") === "1") return false;

        const st = pieceStyle(state.imageUrl, state.side, pieceIndex);
        cellEl.style.backgroundImage = st.backgroundImage;
        cellEl.style.backgroundSize = st.backgroundSize;
        cellEl.style.backgroundPosition = st.backgroundPosition;
        cellEl.style.backgroundRepeat = "no-repeat";
        cellEl.setAttribute("data-filled", "1");
        cellEl.classList.add("is-filled");

        state.placedCount += 1;
        setMoves(state.moves + 1);

        if (state.placedCount >= state.N) {
          finishGame();
        }
        return true;
      }

      function removePieceFromTray(pieceEl) {
        if (!pieceEl) return;
        pieceEl.remove();
      }

      function finishGame() {
        state.finished = true;
        stopTimer();
        showWinOverlay();
        // show full image nicely at end
        setBoardBackgroundOpacity(1);
      }

      function beginGame() {
        if (state.started) return;
        clearOverlay();
        setStartedUI(true);
        applyBoardBackgroundDim();
        startTimer();
      }

      function hardRebuild() {
        // called on level change / reset
        stopTimer();
        resetCounters();

        state.seedNonce += 1;
        const seed = (Date.now() ^ (state.seedNonce * 2654435761)) >>> 0;

        state.N = state.currentLevel === 2 ? state.levelN2 : state.levelN1;
        state.side = computeSideFromN(state.N);

        // board style for grid slicing
        buildGrid();
        // Keep full image state until start
        applyBoardBackgroundFull();
        showStartOverlay();

        setStartedUI(false);
        buildTrayPieces(seed);
      }

      // ---------- drag & drop (Pointer Events) ----------
      function cleanupDrag() {
        const d = state.drag;
        if (!d) return;
        try {
          if (d.pieceEl) d.pieceEl.classList.remove("is-dragging");
          if (d.pieceEl) d.pieceEl.style.opacity = "";
          if (d.ghostEl) d.ghostEl.remove();
        } catch (_) {}
        state.drag = null;
      }

      function makeGhostFromPiece(pieceEl, x, y) {
        const idx = pieceEl.getAttribute("data-piece");
        const g = el("div", "puz-drag", { "data-ghost": "1", "data-piece": idx });
        // copy background slicing
        g.style.backgroundImage = pieceEl.style.backgroundImage;
        g.style.backgroundSize = pieceEl.style.backgroundSize;
        g.style.backgroundPosition = pieceEl.style.backgroundPosition;
        g.style.backgroundRepeat = pieceEl.style.backgroundRepeat;

        // size matches piece box (best effort)
        const r = pieceEl.getBoundingClientRect();
        const size = Math.max(40, Math.min(r.width || 80, r.height || 80));
        g.style.width = size + "px";
        g.style.height = size + "px";

        // position fixed
        g.style.position = "fixed";
        g.style.left = (x - size / 2) + "px";
        g.style.top = (y - size / 2) + "px";
        g.style.pointerEvents = "none";
        document.body.appendChild(g);
        return g;
      }

      function moveGhost(ghostEl, x, y) {
        if (!ghostEl) return;
        const w = ghostEl.offsetWidth || 80;
        const h = ghostEl.offsetHeight || 80;
        ghostEl.style.left = (x - w / 2) + "px";
        ghostEl.style.top = (y - h / 2) + "px";
      }

      function findDropCell(clientX, clientY) {
        const elAt = document.elementFromPoint(clientX, clientY);
        if (!elAt) return null;
        const cell = elAt.closest && elAt.closest(".puz-cell");
        return cell || null;
      }

      function onPiecePointerDown(e) {
        if (!state.started || state.finished) return;
        // only left click / primary touch
        if (e.button !== undefined && e.button !== 0) return;

        e.preventDefault();

        const pieceEl = e.currentTarget;
        const pieceIndex = parseInt(pieceEl.getAttribute("data-piece"), 10);
        if (!Number.isFinite(pieceIndex)) return;

        // mark original as ghosted while dragging
        pieceEl.classList.add("is-dragging");
        pieceEl.style.opacity = "0.35";

        const ghostEl = makeGhostFromPiece(pieceEl, e.clientX, e.clientY);

        state.drag = {
          pieceEl,
          ghostEl,
          index: pieceIndex,
          pointerId: e.pointerId,
        };

        window.addEventListener("pointermove", onPointerMove, { passive: false });
        window.addEventListener("pointerup", onPointerUp, { passive: false });
        window.addEventListener("pointercancel", onPointerUp, { passive: false });
      }

      function onPointerMove(e) {
        if (!state.drag) return;
        e.preventDefault();
        moveGhost(state.drag.ghostEl, e.clientX, e.clientY);
      }

      function onPointerUp(e) {
        if (!state.drag) return;
        e.preventDefault();

        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);

        const d = state.drag;
        const cell = findDropCell(e.clientX, e.clientY);

        let locked = false;
        if (cell) {
          locked = lockCell(cell, d.index);
        }

        // Always restore/remove ghost
        if (locked) {
          removePieceFromTray(d.pieceEl);
        } else {
          // return to tray: just un-ghost the original piece
          d.pieceEl.classList.remove("is-dragging");
          d.pieceEl.style.opacity = "";
        }

        cleanupDrag();
      }

      // ---------- buttons ----------
      btnStart.addEventListener("click", () => beginGame());
      btnReset.addEventListener("click", () => {
        // reset should rebuild current level, and go back to "start overlay" state
        clearOverlay();
        hardRebuild();
      });

      btnHelp.addEventListener("click", () => {
        if (!state.started || state.finished) return;

        // show image stronger for 3 seconds (no alert)
        if (state.helpTimeout) clearTimeout(state.helpTimeout);

        // temporarily increase opacity
        setBoardBackgroundOpacity(1);
        board.classList.add("is-helping");

        state.helpTimeout = setTimeout(() => {
          board.classList.remove("is-helping");
          setBoardBackgroundOpacity(0.18);
        }, 3000);
      });

      if (hasLevel2) {
        btnL1.addEventListener("click", () => {
          if (state.currentLevel === 1) return;
          state.currentLevel = 1;
          setLevelActiveUI();
          clearOverlay();
          hardRebuild();
        });
        btnL2.addEventListener("click", () => {
          if (state.currentLevel === 2) return;
          state.currentLevel = 2;
          setLevelActiveUI();
          clearOverlay();
          hardRebuild();
        });
      }

      // ---------- init run ----------
      // Hide tray until game started
      trayWrap.classList.add("is-hidden");

      // If image missing: keep UI but won't crash.
      if (!state.imageUrl) {
        // Quiet fallback: show overlay message inside game (no alert)
        showOverlay(
          "missing",
          `<div class="puz-missing">חסר imageUrl בגיליון עבור הפרשה הזו.</div>`
        );
        btnStart.disabled = true;
        btnHelp.disabled = true;
        btnReset.disabled = false;
        return;
      }

      setLevelActiveUI();
      hardRebuild();

      // Cleanup on detach (best effort)
      const observer = new MutationObserver(() => {
        if (!document.body.contains(rootEl)) {
          stopTimer();
          cleanupDrag();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },
  };

  // Register globally
  if (typeof window !== "undefined" && typeof window.ParashaGamesRegister === "function") {
    window.ParashaGamesRegister("puzzle", PuzzleModule);
  } else {
    // If games.js loads later and defines register after, we keep a fallback queue
    window.__ParashaGamesPending = window.__ParashaGamesPending || [];
    window.__ParashaGamesPending.push(["puzzle", PuzzleModule]);
  }
})();
