(() => {
  "use strict";

  window.ParashaGamesRegister("puzzle", {
    init: async (rootEl, ctx) => {
      const { CONTROL_API, parashaLabel } = ctx;

      const url =
        `${CONTROL_API}?mode=puzzle&parasha=` +
        encodeURIComponent(parashaLabel);

      const res = await fetch(url);
      const data = await res.json();

      if (!data || !data.ok || !data.row) {
        rootEl.innerHTML =
          `<div>לא נמצאו נתוני פאזל לפרשה זו.</div>`;
        return { reset: () => {} };
      }

      const row = data.row;

      const imageUrl = String(row.imageUrl || "").trim();
      const caption = String(row.caption || "").trim();
      const level1 = Number(row.level1 || 0);
      const level2 = Number(row.level2 || 0);

      if (!imageUrl) {
        rootEl.innerHTML = `<div>חסר נתיב תמונה לפאזל.</div>`;
        return { reset: () => {} };
      }

      rootEl.innerHTML = `
        <div class="puz-wrap">
          <div class="puz-card">

            <div class="puz-topbar">
              <div class="puz-stats">
                <span class="puz-moves">מהלכים: 0</span>
                <span class="puz-time">זמן: 00:00</span>
              </div>

              <div class="puz-actions">
                <button class="puz-btn" data-level="1" aria-pressed="true">רמה 1</button>
                ${
                  level2
                    ? `<button class="puz-btn" data-level="2">רמה 2</button>`
                    : ""
                }
                <button class="puz-btn puz-reset">איפוס</button>
                <button class="puz-btn puz-help">עזרה</button>
              </div>
            </div>

            <div class="puz-caption">${caption}</div>

            <div class="puz-board">
              <div class="puz-guide"></div>
              <div class="puz-grid"></div>
            </div>

            <div class="puz-tray">
              <div class="puz-tray-title">חתיכות</div>
              <div class="puz-strip"></div>
            </div>

            <div class="puz-banner" hidden>
              🎉 כל הכבוד! הפאזל הושלם.
            </div>

          </div>
        </div>
      `;

      const board = rootEl.querySelector(".puz-board");
      const guide = rootEl.querySelector(".puz-guide");
      const grid = rootEl.querySelector(".puz-grid");
      const strip = rootEl.querySelector(".puz-strip");
      const banner = rootEl.querySelector(".puz-banner");

      const movesEl = rootEl.querySelector(".puz-moves");
      const timeEl = rootEl.querySelector(".puz-time");

      const resetBtn = rootEl.querySelector(".puz-reset");
      const helpBtn = rootEl.querySelector(".puz-help");

      guide.style.backgroundImage = `url("${imageUrl}")`;

      let state = null;
      let timerId = null;
      let startTime = 0;

      function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = String(Math.floor(s / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${m}:${sec}`;
      }

      function startTimer() {
        clearInterval(timerId);
        startTime = Date.now();
        timerId = setInterval(() => {
          timeEl.textContent =
            "זמן: " + formatTime(Date.now() - startTime);
        }, 1000);
      }

      function stopTimer() {
        clearInterval(timerId);
      }

      function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      function bestGrid(n) {
        const s = Math.sqrt(n);
        let best = 1;
        let diff = Infinity;

        for (let i = 1; i <= n; i++) {
          if (n % i !== 0) continue;
          const d = Math.abs(i - s);
          if (d < diff) {
            diff = d;
            best = i;
          }
        }
        return best;
      }

      function build(level) {
        banner.hidden = true;

        const piecesCount = level === 2 ? level2 : level1;
        const cols = bestGrid(piecesCount);
        const rows = piecesCount / cols;

        grid.innerHTML = "";
        strip.innerHTML = "";

        grid.style.gridTemplateColumns = `repeat(${cols},1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows},1fr)`;

        board.style.setProperty("--puz-n", cols);

        const pieces = [];

        for (let i = 0; i < piecesCount; i++) {
          const r = Math.floor(i / cols);
          const c = i % cols;

          const cell = document.createElement("div");
          cell.className = "puz-cell";
          cell.dataset.index = i;
          grid.appendChild(cell);

          pieces.push({ index: i, r, c });
        }

        state = {
          cols,
          rows,
          total: piecesCount,
          placed: 0,
          moves: 0,
        };

        movesEl.textContent = "מהלכים: 0";

        const shuffled = shuffle(pieces);

        shuffled.forEach(p => {
          const piece = document.createElement("div");
          piece.className = "puz-piece";
          piece.dataset.index = p.index;

          piece.style.backgroundImage = `url("${imageUrl}")`;
          piece.style.backgroundPosition =
            `${(p.c / (cols - 1)) * 100}% ${(p.r / (rows - 1)) * 100}%`;

          enableDrag(piece);

          strip.appendChild(piece);
        });

        startTimer();
      }

      function enableDrag(piece) {
        piece.addEventListener("pointerdown", e => {
          e.preventDefault();

          const ghost = piece.cloneNode(true);
          ghost.classList.add("puz-drag");
          document.body.appendChild(ghost);

          moveGhost(e);

          function moveGhost(ev) {
            ghost.style.left = ev.clientX - 40 + "px";
            ghost.style.top = ev.clientY - 40 + "px";
          }

          function up(ev) {
            document.removeEventListener("pointermove", moveGhost);
            document.removeEventListener("pointerup", up);

            ghost.remove();

            const el = document.elementFromPoint(
              ev.clientX,
              ev.clientY
            );

            const cell = el && el.closest(".puz-cell");
            if (!cell) return;

            if (
              Number(cell.dataset.index) ===
              Number(piece.dataset.index)
            ) {
              cell.style.backgroundImage =
                piece.style.backgroundImage;
              cell.style.backgroundSize =
                piece.style.backgroundSize;
              cell.style.backgroundPosition =
                piece.style.backgroundPosition;

              piece.remove();

              state.placed++;
              state.moves++;

              movesEl.textContent =
                "מהלכים: " + state.moves;

              if (state.placed >= state.total) {
                stopTimer();
                banner.hidden = false;
              }
            }
          }

          document.addEventListener("pointermove", moveGhost);
          document.addEventListener("pointerup", up);
        });
      }

      helpBtn.addEventListener("click", () => {
        board.dataset.help = "1";
        setTimeout(() => {
          board.dataset.help = "0";
        }, 3000);
      });

      resetBtn.addEventListener("click", () => build(1));

      rootEl.querySelectorAll("[data-level]").forEach(btn => {
        btn.addEventListener("click", () => {
          rootEl
            .querySelectorAll("[data-level]")
            .forEach(b => b.setAttribute("aria-pressed", "false"));

          btn.setAttribute("aria-pressed", "true");

          build(Number(btn.dataset.level));
        });
      });

      build(1);

      return {
        reset: () => build(1)
      };
    }
  });
})();
