/* puzzle.js - Parasha Weekly (grid puzzle) */

(function () {
  "use strict";

  // ---------- utils ----------
  function el(tag, cls, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
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
  }

  function formatTime(sec) {
    sec = Math.max(0, sec | 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  // ---------- API ----------
  async function fetchPuzzleRow(apiUrl, parasha) {
    if (!apiUrl) throw new Error("Missing CONTROL_API");

    const url =
      apiUrl +
      (apiUrl.includes("?") ? "&" : "?") +
      "mode=puzzle&parasha=" +
      encodeURIComponent(parasha || "");

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (data && data.ok === true && data.row) return data.row;
    if (data && Array.isArray(data.rows) && data.rows.length)
      return data.rows[0];

    throw new Error("Puzzle data not found");
  }

  function computeSideFromN(N) {
    return Math.max(1, Math.round(Math.sqrt(N)));
  }

  function pieceStyle(imageUrl, side, index) {
    const r = Math.floor(index / side);
    const c = index % side;

    return {
      backgroundImage: `url("${imageUrl}")`,
      backgroundSize: `${side * 100}% ${side * 100}%`,
      backgroundPosition: `${(c / (side - 1 || 1)) * 100}% ${(r / (side - 1 || 1)) * 100}%`,
      backgroundRepeat: "no-repeat",
    };
  }

  const PuzzleModule = {
    name: "puzzle",

    async init(rootEl, ctx) {
      const showFatal = (err) => {
        rootEl.innerHTML = `
          <div class="puz-card">
            <div class="puz-top" style="padding:12px;font-weight:700;">פאזל 🍀</div>
            <div style="padding:12px;direction:rtl;font-family:monospace;white-space:pre-wrap;">
שגיאה בפאזל:
${String(err && (err.stack || err.message) || err)}
            </div>
          </div>`;
      };

      try {
        const parasha = ctx?.parasha || ctx?.row?.parasha || "";
        const apiUrl =
          ctx?.apiUrl || ctx?.CONTROL_API || ctx?.controlApi || "";

        let row = ctx?.row || null;
        if (!row) row = await fetchPuzzleRow(apiUrl, parasha);

        const imageUrl = String(row.imageUrl || "").trim();
        const caption = String(row.caption || "").trim();
        const level1 = asInt(row.level1) || 9;
        const level2 = asInt(row.level2);
        const hasLevel2 = Number.isFinite(level2) && level2 > 0;

        rootEl.innerHTML = "";

        const card = el("div", "puz-card");
        const top = el("div", "puz-top");
        const stats = el("div", "puz-stats");
        const actions = el("div", "puz-actions");

        const movesEl = el("span", null, { text: "0" });
        const timeEl = el("span", null, { text: "00:00" });

        stats.innerHTML = `מהלכים: `;
        stats.append(movesEl, document.createTextNode(" | זמן: "), timeEl);

        const btnStart = el("button", null, { text: "התחל" });
        const btnReset = el("button", null, { text: "איפוס" });

        actions.append(btnStart, btnReset);
        top.append(stats, actions);

        const board = el("div", "puz-board");
        board.style.position = "relative";

        const overlay = el("div");
        Object.assign(overlay.style, {
          position: "absolute",
          inset: "0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.7)",
        });

        overlay.innerHTML = `<button>התחל</button>`;
        board.appendChild(overlay);

        const tray = el("div", "puz-tray");
        tray.style.display = "none";

        card.append(top);
        if (caption) card.append(el("div", null, { text: caption }));
        card.append(board, tray);
        rootEl.appendChild(card);

        let started = false;
        let sec = 0;
        let timer = null;

        function setTimeUI() {
          timeEl.textContent = formatTime(sec);
        }

        function startGame() {
          started = true;
          overlay.style.display = "none";
          tray.style.display = "";
          board.style.backgroundImage = `url("${imageUrl}")`;
          board.style.backgroundSize = "cover";
          board.style.boxShadow =
            "inset 0 0 0 9999px rgba(255,255,255,0.8)";

          timer = setInterval(() => {
            sec++;
            setTimeUI();
          }, 1000);
        }

        btnStart.onclick = startGame;
        overlay.querySelector("button").onclick = startGame;

        btnReset.onclick = () => location.reload();

        if (!imageUrl) {
          overlay.innerHTML = "חסר imageUrl";
          return;
        }

        board.style.backgroundImage = `url("${imageUrl}")`;
        board.style.backgroundSize = "cover";
      } catch (err) {
        showFatal(err);
      }
    },
  };

  if (window.ParashaGamesRegister)
    window.ParashaGamesRegister("puzzle", PuzzleModule);
})();
