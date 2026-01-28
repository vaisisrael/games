(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec"; // <-- כתובת ה-Web App שלך

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 משחק זיכרון" },
    { id: "puzzle", title: "🧩 פאזל" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji", title: "😄 חידת אימוג'ים" },
  ];

  // ====== PARASHA LABEL ======
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map((a) => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find((t) => re.test(t)) || null;
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";

    GAMES_DEFINITION.filter((g) => activeIds.includes(g.id)).forEach((game) => {
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

  // ====== MEMORY GAME (FULL) ======
  function parseCsvList(s) {
    return String(s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function clampEven(n) {
    n = Number(n || 0);
    if (!Number.isFinite(n) || n < 2) return 0;
    return n % 2 === 0 ? n : n - 1;
  }

  function renderMemoryGame(body, model) {
    // model: { symbols:[], alts:[], level1, level2, parashaLabel }

    const hasLevel1 = clampEven(model.level1) > 0;
    const hasLevel2 = clampEven(model.level2) > 0;

    // אם אין level2 — אין "בחירת רמה", ולכן לא מציגים גם "רמה 1"
    const showLevelButtons = hasLevel1 && hasLevel2;

    body.innerHTML = `
      <div class="mem-topbar">
        ${showLevelButtons ? `<button type="button" class="mem-level" data-level="1">רמה 1</button>` : ``}
        ${showLevelButtons ? `<button type="button" class="mem-level" data-level="2">רמה 2</button>` : ``}
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

    function buildDeck(cardCount) {
      const maxPairs = Math.min(model.symbols.length, model.alts.length);
      const pairsNeeded = Math.min(cardCount / 2, maxPairs);

      const items = [];
      for (let i = 0; i < pairsNeeded; i++) {
        items.push({
          key: String(i),
          symbol: model.symbols[i],
          alt: model.alts[i],
        });
      }

      // דופליקציה לזוגות
      const deck = [];
      items.forEach((it) => {
        deck.push({ ...it, uid: it.key + "-a" });
        deck.push({ ...it, uid: it.key + "-b" });
      });

      // ערבוב דטרמיניסטי לפי פרשה + כמות קלפים
      return seededShuffle(deck, `${model.parashaLabel}|${cardCount}|memory`);
    }

    function updateStats() {
      if (!state) {
        stats.textContent = "";
        return;
      }
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

    function reset(requestedLevel) {
      // אם אין בחירת רמות (אין level2) — תמיד רמה 1
      const levelNum = showLevelButtons ? (requestedLevel === 2 ? 2 : 1) : 1;

      const wanted = levelNum === 2 ? model.level2 : model.level1;
      const cardCount = clampEven(wanted);

      // אם אין מספיק נתונים—נציג הודעה ברורה
      if (!cardCount) {
        state = null;
        grid.innerHTML = "";
        stats.textContent = "אין נתונים מספיקים לרמת המשחק.";
        return;
      }

      const deck = buildDeck(cardCount);

      state = {
        level: levelNum,
        deck,
        open: [],
        lock: false,
        tries: 0,
        matchedPairs: 0,
        totalPairs: deck.length / 2,
        matchedUids: new Set(),
        byUid: new Map(deck.map((c) => [c.uid, c])),
      };

      // חשוב: לא לקבוע gridTemplateColumns כאן – ה-CSS שלך מנהל את זה
      grid.style.gridTemplateColumns = "";
      grid.innerHTML = "";

      deck.forEach((card) => {
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
      const b1 = buttons.find((b) => b.dataset.uid === u1);
      const b2 = buttons.find((b) => b.dataset.uid === u2);

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

    if (showLevelButtons) {
      btnL1.addEventListener("click", () => reset(1));
      btnL2.addEventListener("click", () => reset(2));
    }

    // init default level 1
    reset(1);

    // expose reset for accordion-close behavior
    return { reset: () => reset(1) };
  }

  async function initMemoryGame(gameBody, parashaLabel) {
    const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(
      parashaLabel
    )}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.row) {
      gameBody.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const symbols = parseCsvList(data.row.symbols);
    const alts = parseCsvList(data.row.alts);

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

    root.querySelectorAll(".game").forEach((game) => {
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
    const res = await fetch(
      `${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`
    );
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION.map((g) => g.id).filter(
      (id) => data.row[id] === true
    );

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
