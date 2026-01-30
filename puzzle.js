/* puzzle.js - Parasha Weekly (grid puzzle) */

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

  function asInt(v) {
    const n = parseInt(String(v || "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

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
    if (!apiUrl) throw new Error("Missing CONTROL_API (apiUrl)");
    const url =
      apiUrl +
      (apiUrl.includes("?") ? "&" : "?") +
      "mode=puzzle&parasha=" +
      encodeURIComponent(parasha || "");
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!data || data.ok !== true || !data.row) throw new Error("Bad puzzle response (expected {ok:true,row:{...}})");
    return data.row;
  }

  function computeSideFromN(N) {
    const side = Math.round(Math.sqrt(N));
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
      const renderFatal = (err) => {
        try {
          rootEl.innerHTML = `
            <div class="puz-card">
              <div class="puz-top" style="padding:12px; font-weight:700;">פאזל 🍀</div>
              <div style="padding:12px; direction:rtl; font-family:monospace; white-space:pre-wrap; line-height:1.4;">
שגיאה בפאזל (פירוט):
${String(err && (err.stack || err.message) || err)}
              </div>
            </div>
          `;
        } catch (_) {}
      };

      try {
        // ---- ctx shape (depends on your games.js) ----
        const parasha = (ctx && (ctx.parasha || (ctx.row && ctx.row.parasha))) || "";
        const apiUrl =
          (ctx && (ctx.apiUrl || ctx.CONTROL_API || ctx.controlApi || ctx.control_api)) || "";
        let row = (ctx && ctx.row) ? ctx.row : null;

        if (!row) row = await fetchPuzzleRow(apiUrl, parasha);

        const imageUrl = String(row.imageUrl || "").trim();
        const caption = String(row.caption || "").trim();
        const level1 = asInt(row.level1) || 9;
        const level2 = asInt(row.level2);
        const hasLevel2 = Number.isFinite(level2) && level2 > 0;

        // ---- build UI ----
        rootEl.innerHTML = "";

        const card = el("div", "puz-card");

        const top = el("div", "puz-top");
        const leftStats = el("div", "puz-stats");
        const rightBtns = el("div", "puz-actions");

        const statMoves = el("div", "puz-stat", {
          html: `<span class="puz-stat-label">מהלכים</span><span class="puz-stat-val" data-moves>0</span>`,
        });
        const statTime = el("div", "puz-stat", {
          html: `<span class="puz-stat-label">זמן</span><span class="puz-stat-val" data-time>00:00</span>`,
        });
        leftStats.append(statMoves, statTime);

        const btnStart = el("button", "puz-btn puz-start", { type: "button", text: "התחל" });
        const btnHelp = el("button", "puz-btn puz-help", { type: "button", text: "עזרה" });
        const btnReset = el("button", "puz-btn puz-reset", { type: "button", text: "איפוס" });

        const levelsWrap = el("div", "puz-levels");
        let btnL1 = null, btnL2 = null;
        if (hasLevel2) {
          btnL1 = el("button", "puz-btn puz-level", { type: "button", "data-level": "1", text: "רמה 1" });
          btnL2 = el("button", "puz-btn puz-level", { type: "button", "data-level": "2", text: "רמה 2" });
          levelsWrap.append(btnL1, btnL2);
          rightBtns.append(levelsWrap);
        }

        rightBtns.append(btnStart, btnHelp, btnReset);
        top.append(leftStats, rightBtns);

        const captionEl = caption ? el("div", "puz-caption", { text: caption }) : null;

        const boardWrap = el("div", "puz-board-wrap");
        const board = el("div", "puz-board");
        const grid = el("div", "puz-grid");

        // overlay (start/win) – FORCED via inline styles (not dependent on CSS)
        const overlay = el("div", "puz-overlay");
        const overlayInner = el("div", "puz-overlay-inner");
        overlay.appendChild(overlayInner);

        Object.assign(board.style, { position: "relative" });
        Object.assign(overlay.style, {
          position: "absolute",
          inset: "0",
          display: "none", // flex when visible
          alignItems: "center",
          justifyContent: "center",
          zIndex: "50",
          pointerEvents: "auto",
        });

        board.append(grid, overlay);
        boardWrap.appendChild(board);

        const trayWrap = el("div", "puz-tray-wrap");
        const tray = el("div", "puz-tray");
        trayWrap.appendChild(tray);

        // FORCE tray hidden by inline style until "start"
        trayWrap.style.display = "none";

        card.append(top);
        if (captionEl) card.append(captionEl);
        card.append(boardWrap, trayWrap);

        rootEl.appendChild(card);

        const movesEl = card.querySelector("[data-moves]");
        const timeEl = card.querySelector("[data-time]");

        // ---- state ----
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
          drag: null, // {pieceEl, ghostEl, index}
          seedNonce: 0,
        };

        // ---- helpers ----
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

        // "opacity" for image: 1 = full, 0.18 = dim
        function applyBoardBackground(opacity) {
          board.style.backgroundImage = `url("${state.imageUrl}")`;
          board.style.backgroundSize = "cover";
          board.style.backgroundPosition = "center";
          board.style.backgroundRepeat = "no-repeat";
          // dim using inset white overlay (CSS independent)
          board.style.boxShadow = `inset 0 0 0 9999px rgba(255,255,255,${1 - opacity})`;
        }

        function showOverlay(kind, html) {
          overlayInner.innerHTML = html;
          overlay.setAttribute("data-kind", kind);
          overlay.style.display = "flex";
        }

        function hideOverlay() {
          overlayInner.innerHTML = "";
          overlay.style.display = "none";
          overlay.removeAttribute("data-kind");
        }

        function showStartOverlay() {
          showOverlay(
            "start",
            `
              <div class="puz-start-box" style="text-align:center; padding:14px;">
                <div class="puz-start-title" style="font-weight:800; font-size:18px; margin-bottom:6px;">פאזל</div>
                <div class="puz-start-sub" style="opacity:.85; margin-bottom:10px;">לחצו “התחל” כדי להתחיל לגרור חתיכות אל הלוח</div>
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
              <div class="puz-win-box" style="text-align:center; padding:14px;">
                <div class="puz-win-title" style="font-weight:800; font-size:18px; margin-bottom:6px;">כל הכבוד! 🎉</div>
                <div class="puz-win-sub" style="opacity:.85;">סיימתם את הפאזל.</div>
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
          for (let i = 0; i < state.N; i++) {
            const cell = el("div", "puz-cell", { "data-cell": String(i), "data-filled": "0" });
            grid.appendChild(cell);
          }
        }

        function buildTrayPieces(seed) {
          tray.innerHTML = "";
          const indices = Array.from({ length: state.N }, (_, i) => i);
          shuffle(indices, seed);

          for (const idx of indices) {
            const p = el("div", "puz-piece", { "data-piece": String(idx) });

            // critical for drag (desktop + mobile)
            p.style.touchAction = "none";
            p.style.userSelect = "none";
            p.style.webkitUserSelect = "none";
            p.style.webkitTouchCallout = "none";

            Object.assign(p.style, pieceStyle(state.imageUrl, state.side, idx));

            p.addEventListener("pointerdown", onPiecePointerDown, { passive: false });
            tray.appendChild(p);
          }
        }

        function resetCounters() {
          setMoves(0);
          setTime(0);
          state.placedCount = 0;
          state.finished = false;
        }

        function setStartedUI(started) {
          state.started = started;
          trayWrap.style.display = started ? "" : "none"; // FORCE
          btnStart.disabled = started;
        }

        function lockCell(cellEl, pieceIndex) {
          const cellIndex = parseInt(cellEl.getAttribute("data-cell"), 10);
          if (cellIndex !== pieceIndex) return false; // magnet strict
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

          if (state.placedCount >= state.N) finishGame();
          return true;
        }

        function finishGame() {
          state.finished = true;
          stopTimer();
          applyBoardBackground(1); // full
          showWinOverlay();
        }

        function beginGame() {
          if (state.started || state.finished) return;
          hideOverlay();
          setStartedUI(true);
          applyBoardBackground(0.18); // dim
          startTimer();
        }

        function hardRebuild() {
          stopTimer();
          resetCounters();

          state.seedNonce += 1;
          const seed = (Date.now() ^ (state.seedNonce * 2654435761)) >>> 0;

          state.N = state.currentLevel === 2 ? state.levelN2 : state.levelN1;
          state.side = computeSideFromN(state.N);

          buildGrid();

          // pre-start
          applyBoardBackground(1);
          setStartedUI(false);
          showStartOverlay();

          buildTrayPieces(seed);
        }

        // ---------- drag ----------
        function cleanupDrag() {
          const d = state.drag;
          if (!d) return;
          try {
            if (d.pieceEl) {
              d.pieceEl.classList.remove("is-dragging");
              d.pieceEl.style.opacity = "";
            }
            if (d.ghostEl) d.ghostEl.remove();
          } catch (_) {}
          state.drag = null;
        }

        function makeGhost(pieceEl, x, y) {
          const idx = pieceEl.getAttribute("data-piece");
          const g = el("div", "puz-drag", { "data-piece": idx });

          g.style.backgroundImage = pieceEl.style.backgroundImage;
          g.style.backgroundSize = pieceEl.style.backgroundSize;
          g.style.backgroundPosition = pieceEl.style.backgroundPosition;
          g.style.backgroundRepeat = pieceEl.style.backgroundRepeat;

          const r = pieceEl.getBoundingClientRect();
          const size = Math.max(44, Math.min(r.width || 80, r.height || 80));

          Object.assign(g.style, {
            width: size + "px",
            height: size + "px",
            position: "fixed",
            left: (x - size / 2) + "px",
            top: (y - size / 2) + "px",
            pointerEvents: "none",
            zIndex: "999999",
          });

          document.body.appendChild(g);
          return g;
        }

        function moveGhost(ghostEl, x, y) {
          const w = ghostEl.offsetWidth || 80;
          const h = ghostEl.offsetHeight || 80;
          ghostEl.style.left = (x - w / 2) + "px";
          ghostEl.style.top = (y - h / 2) + "px";
        }

        function findDropCell(clientX, clientY) {
          const hit = document.elementFromPoint(clientX, clientY);
          return hit && hit.closest ? hit.closest(".puz-cell") : null;
        }

        function onPiecePointerDown(e) {
          if (!state.started || state.finished) return;
          if (e.button !== undefined && e.button !== 0) return;

          e.preventDefault();

          const pieceEl = e.currentTarget;
          const pieceIndex = parseInt(pieceEl.getAttribute("data-piece"), 10);
          if (!Number.isFinite(pieceIndex)) return;

          pieceEl.classList.add("is-dragging");
          pieceEl.style.opacity = "0.35";

          const ghostEl = makeGhost(pieceEl, e.clientX, e.clientY);

          state.drag = { pieceEl, ghostEl, index: pieceIndex };

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
          if (cell) locked = lockCell(cell, d.index);

          if (locked) {
            d.pieceEl.remove(); // remove from tray
          } else {
            d.pieceEl.classList.remove("is-dragging");
            d.pieceEl.style.opacity = "";
          }

          cleanupDrag();
        }

        // ---------- buttons ----------
        btnStart.addEventListener("click", () => beginGame());
        btnReset.addEventListener("click", () => hardRebuild());

        btnHelp.addEventListener("click", () => {
          if (!state.started || state.finished) return;
          if (state.helpTimeout) clearTimeout(state.helpTimeout);

          applyBoardBackground(1); // full
          state.helpTimeout = setTimeout(() => {
            applyBoardBackground(0.18); // back to dim
          }, 3000);
        });

        if (hasLevel2) {
          btnL1.addEventListener("click", () => {
            if (state.currentLevel === 1) return;
            state.currentLevel = 1;
            setLevelActiveUI();
            hardRebuild();
          });
          btnL2.addEventListener("click", () => {
            if (state.currentLevel === 2) return;
            state.currentLevel = 2;
            setLevelActiveUI();
            hardRebuild();
          });
        }

        // ---------- init ----------
        if (!imageUrl) {
          showOverlay("missing", `<div style="padding:12px; direction:rtl;">חסר imageUrl בגיליון עבור הפרשה הזו.</div>`);
          btnStart.disabled = true;
          btnHelp.disabled = true;
          return;
        }

        setLevelActiveUI();
        hardRebuild();
      } catch (err) {
        // IMPORTANT: do NOT throw again, otherwise games.js will replace with generic message
        renderFatal(err);
        return;
      }
    },
  };

  // Register globally
  if (typeof window !== "undefined" && typeof window.ParashaGamesRegister === "function") {
    window.ParashaGamesRegister("puzzle", PuzzleModule);
  } else {
    window.__ParashaGamesPending = window.__ParashaGamesPending || [];
    window.__ParashaGamesPending.push(["puzzle", PuzzleModule]);
  }
})();
