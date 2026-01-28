(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API = "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec"; // <-- שים כאן את כתובת ה-Web App שלך

  const GAMES_DEFINITION = [
    { id: "memory",    title: "🧠 משחק זיכרון" },
    { id: "puzzle",    title: "🧩 פאזל" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji",     title: "😄 חידת אימוג'ים" }
  ];

  // ====== PARASHA LABEL ======
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map(a => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find(t => re.test(t)) || null;
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";

    GAMES_DEFINITION
      .filter(g => activeIds.includes(g.id))
      .forEach(game => {
        const el = document.createElement("div");
        el.className = "game";
        el.dataset.game = game.id;

        el.innerHTML = `
          <button class="game-toggle" type="button">${game.title}</button>
          <div class="game-body" style="display:none"></div>
        `;

        root.appendChild(el);
      });
  }

  // ====== SEEDED SHUFFLE (דטרמיניסטי לפי פרשה) ======
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
      let t = (seed += 0x6D2B79F5);
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

  // ====== MEMORY GAME (FULL) ======
  function parseCsvList(s) {
    return String(s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function clampEven(n) {
    n = Number(n || 0);
    if (!Number.isFinite(n) || n < 2) return 0;
    return n % 2 === 0 ? n : n - 1;
  }

  function renderMemoryGame(body, model) {
    // model: { symbols:[], alts:[], level1, level2, parashaLabel }
    body.innerHTML = `
      <div class="mem-topbar">
        <button type="button" class="mem-level" data-level="1">רמה 1</button>
        <button type="button" class="mem-level" data-level="2">רמה 2</button>
        <button type="button" class="mem-reset">איפוס</button>
        <div class="mem-stats" aria-live="polite"></div>
      </div>
      <div class="mem-grid" role="grid"></div>
    `;

    const grid = body.querySelector(".mem-grid");
    const stats = body.querySelector(".mem-stats");
    const btnReset = body.querySelector(".mem-reset");
    const btnL1 = body.querySelector('.mem-level[data-level="1"]');
    const btnL2 = body.querySelector('.mem-level[data-level="2"]');

    let state = null;

    function computeCols(cardCount) {
      // פשוט ויציב לילדים
      if (cardCount <= 8) return 4;
      if (cardCount <= 12) return 4;
      if (cardCount <= 16) return 4;
      if (cardCount <= 20) return 5;
      return 6;
    }

    function buildDeck(cardCount) {
      const maxPairs = Math.min(model.symbols.length, model.alts.length);
      const pairsNeeded = Math.min(cardCount / 2, maxPairs);

      const items = [];
      for (let i = 0; i < pairsNeeded; i++) {
        items.push({ key: String(i), symbol: model.symbols[i], alt: model.alts[i] });
      }

      // דופליקציה לזוגות
      const deck = [];
      items.forEach(it => {
        deck.push({ ...it, uid: it.key + "-a" });
        deck.push({ ...it, uid: it.key + "-b" });
      });

      // ערבוב דטרמיניסטי לפי פרשה + כמות קלפים + רמה
      return seededShuffle(deck, `${model.parashaLabel}|${cardCount}|memory`);
    }

    function updateStats() {
      stats.textContent = `ניסיונות: ${state.tries} | התאמות: ${state.matchedPairs}/${state.totalPairs}`;
    }

    function setCardFace(btn, faceUp) {
      const card = state.byUid.get(btn.dataset.uid);
      if (!card) return;

      if (faceUp) {
        btn.classList.remove("mem-face-down");
        btn.textContent = card.symbol;
        btn.setAttribute("aria-label", card.alt);
        btn.setAttribute("aria-pressed", "true");
      } else {
        btn.classList.add("mem-face-down");
        btn.textContent = "קלף";
        btn.setAttribute("aria-label", "קלף סגור");
        btn.setAttribute("aria-pressed", "false");
      }
    }

    function lockCard(btn, locked) {
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
      btn.disabled = !!locked;
    }

    function reset(level) {
      const levelNum = level === 2 ? 2 : 1;
      const wanted = levelNum === 2 ? model.level2 : model.level1;
      const cardCount = clampEven(wanted);

      // אם אין מספיק נתונים—נציג הודעה ברורה
      if (!cardCount) {
        grid.innerHTML = "";
        stats.textContent = "אין נתונים מספיקים לרמת המשחק.";
        return;
      }

      const deck = buildDeck(cardCount);
      const cols = computeCols(deck.length);

      state = {
        level: levelNum,
        deck,
        open: [],
        lock: false,
        tries: 0,
        matchedPairs: 0,
        totalPairs: deck.length / 2,
        matchedUids: new Set(),
        byUid: new Map(deck.map(c => [c.uid, c])),
      };

      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.innerHTML = "";

      deck.forEach(card => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mem-card mem-face-down";
        btn.dataset.uid = card.uid;
        btn.setAttribute("role", "gridcell");
        setCardFace(btn, false);
        grid.appendChild(btn);
      });

      updateStats();
    }

    function flip(btn) {
      if (!state || state.lock) return;
      if (btn.disabled) return;

      const uid = btn.dataset.uid;
      if (state.matchedUids.has(uid)) return;

      // לא לאפשר לפתוח אותו קלף פעמיים
      if (state.open.includes(uid)) return;

      setCardFace(btn, true);
      state.open.push(uid);

      if (state.open.length < 2) return;

      // שני קלפים פתוחים
      const [u1, u2] = state.open;
      const c1 = state.byUid.get(u1);
      const c2 = state.byUid.get(u2);

      state.tries += 1;

      const buttons = Array.from(grid.querySelectorAll(".mem-card"));
      const b1 = buttons.find(b => b.dataset.uid === u1);
      const b2 = buttons.find(b => b.dataset.uid === u2);

      if (c1 && c2 && c1.key === c2.key) {
        // התאמה
        state.matchedUids.add(u1);
        state.matchedUids.add(u2);
        state.matchedPairs += 1;
        if (b1) lockCard(b1, true);
        if (b2) lockCard(b2, true);
        state.open = [];
        updateStats();
        return;
      }

      // לא התאמה: לסגור אחרי רגע
      state.lock = true;
      updateStats();

      setTimeout(() => {
        if (b1) setCardFace(b1, false);
        if (b2) setCardFace(b2, false);
        state.open = [];
        state.lock = false;
      }, 700);
    }

    // events
    grid.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".mem-card");
      if (!btn) return;
      flip(btn);
    });

    btnReset.addEventListener("click", () => reset(state?.level || 1));
    btnL1.addEventListener("click", () => reset(1));
    btnL2.addEventListener("click", () => reset(2));

    // init default level 1
    reset(1);

    // expose reset for accordion-close behavior
    return { reset: () => reset(1) };
  }

  async function initMemoryGame(gameBody, parashaLabel) {
    const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.row) {
      gameBody.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const symbols = parseCsvList(data.row.symbols);
    const alts = parseCsvList(data.row.alts);

    // בחירה "מהתחלה" כבר מובנית: אנחנו לוקחים לפי סדר המערכים
    const model = {
      parashaLabel,
      symbols,
      alts,
      level1: Number(data.row.level1 || 0),
      level2: Number(data.row.level2 || 0),
    };

    return renderMemoryGame(gameBody, model);
  }

  // ====== ACCORDION (כולל reset אוטומטי בעת מעבר למשחק אחר) ======
  function initAccordion(root, onOpenChange) {
    let openBody = null;

    root.querySelectorAll(".game").forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      btn.addEventListener("click", async () => {
        if (openBody && openBody !== body) {
          // סגירת הקודם + איפוס מצב
          openBody.style.display = "none";
          await onOpenChange(openBody, false);
        }

        const open = body.style.display === "block";
        body.style.display = open ? "none" : "block";
        openBody = body.style.display === "block" ? body : null;

        if (openBody) await onOpenChange(openBody, true);
      });
    });
  }

  // ====== INIT ======
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    // שליפת Control (איזה משחקים פעילים)
    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION
      .map(g => g.id)
      .filter(id => data.row[id] === true);

    if (activeIds.length === 0) return;

    buildGames(root, activeIds);

    // registry למשחקים שדורשים reset
    const gameControllers = new Map(); // id -> controller

    // onOpenChange: בבחירה במשחק, נטען אותו (אם צריך) ונאפס בעת סגירה
    async function onOpenChange(bodyEl, isOpen) {
      const gameEl = bodyEl.closest(".game");
      const gameId = gameEl?.dataset?.game || "";

      if (!gameId) return;

      if (!isOpen) {
        const ctrl = gameControllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      // פתיחה: אם כבר נטען—לא טוענים שוב
      if (gameControllers.has(gameId)) return;

      if (gameId === "memory") {
        bodyEl.innerHTML = "טוען משחק זיכרון...";
        const ctrl = await initMemoryGame(bodyEl, parashaLabel);
        gameControllers.set(gameId, ctrl);
        return;
      }

      // משחקים אחרים (כרגע placeholder)
      bodyEl.innerHTML = `<div>(כאן ייבנה המשחק: ${gameId})</div>`;
      gameControllers.set(gameId, { reset: () => {} });
    }

    initAccordion(root, onOpenChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ===== Memory game – visual upgrade (square cards + nicer colors/fonts) ===== */

/* צבעים + טיפוגרפיה כללית לאזור המשחק */
[data-parasha-games]{
  --pg-bg: #f6f7fb;
  --pg-surface: #ffffff;
  --pg-border: rgba(0,0,0,.10);
  --pg-text: #1f2937;
  --pg-muted: #6b7280;
  --pg-accent: #2563eb;
  --pg-accent2: #7c3aed;
  --pg-shadow: 0 10px 25px rgba(0,0,0,.08);

  font-family: system-ui, -apple-system, "Segoe UI", Arial, "Noto Sans Hebrew", "Heebo", sans-serif;
  color: var(--pg-text);
}

/* מסגרת “כרטיס” נעימה למשחק */
[data-parasha-games] [data-game="memory"],
[data-parasha-games] .game-memory,
[data-parasha-games] .memory-game{
  background: linear-gradient(180deg, var(--pg-bg), #fff);
  border: 1px solid var(--pg-border);
  border-radius: 14px;
  box-shadow: var(--pg-shadow);
  padding: 14px;
}

/* כותרת המשחק */
[data-parasha-games] [data-game="memory"] .title,
[data-parasha-games] .game-memory .title,
[data-parasha-games] .memory-game .title{
  font-weight: 800;
  letter-spacing: .2px;
}

/* גריד קלפים – ריווח נעים ומותאם מובייל */
[data-parasha-games] [data-game="memory"] .grid,
[data-parasha-games] .game-memory .grid,
[data-parasha-games] .memory-game .grid,
[data-parasha-games] [data-game="memory"] .cards,
[data-parasha-games] .game-memory .cards,
[data-parasha-games] .memory-game .cards{
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  align-items: stretch;
}

/* הקלפים עצמם – מרובעים + צבע + “קליקיות” */
[data-parasha-games] [data-game="memory"] button,
[data-parasha-games] .game-memory button,
[data-parasha-games] .memory-game button,
[data-parasha-games] [data-game="memory"] .card,
[data-parasha-games] .game-memory .card,
[data-parasha-games] .memory-game .card{
  aspect-ratio: 1 / 1;              /* ✅ מרובע */
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--pg-border);
  background:
    radial-gradient(120% 120% at 10% 10%, rgba(37,99,235,.14), transparent 60%),
    radial-gradient(120% 120% at 90% 90%, rgba(124,58,237,.12), transparent 55%),
    var(--pg-surface);
  box-shadow: 0 8px 18px rgba(0,0,0,.07);
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
  display: grid;
  place-items: center;
  user-select: none;

  /* טקסט/אימוג’י גדול ונעים */
  font-weight: 800;
  font-size: clamp(18px, 3.2vw, 28px);
  color: var(--pg-text);
}

/* הובר/פוקוס */
[data-parasha-games] [data-game="memory"] button:hover,
[data-parasha-games] .game-memory button:hover,
[data-parasha-games] .memory-game button:hover,
[data-parasha-games] [data-game="memory"] .card:hover,
[data-parasha-games] .game-memory .card:hover,
[data-parasha-games] .memory-game .card:hover{
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(0,0,0,.10);
  border-color: rgba(37,99,235,.35);
}

[data-parasha-games] [data-game="memory"] button:focus-visible,
[data-parasha-games] .game-memory button:focus-visible,
[data-parasha-games] .memory-game button:focus-visible{
  outline: 3px solid rgba(37,99,235,.28);
  outline-offset: 2px;
}

/* טקסטים קטנים (ניסיונות/התאמות) – להפוך לקריא יותר */
[data-parasha-games] [data-game="memory"] .stats,
[data-parasha-games] .game-memory .stats,
[data-parasha-games] .memory-game .stats{
  color: var(--pg-muted);
  font-weight: 600;
}

/* כפתור “פאזל”/איפוס – אם קיים בתוך אותו כרטיס */
[data-parasha-games] [data-game="memory"] .btn,
[data-parasha-games] .game-memory .btn,
[data-parasha-games] .memory-game .btn{
  border-radius: 12px;
  border: 1px solid var(--pg-border);
  background: linear-gradient(90deg, rgba(37,99,235,.10), rgba(124,58,237,.08));
  font-weight: 800;
  padding: 10px 12px;
}

