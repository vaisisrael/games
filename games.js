(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 משחק זיכרון" },
    { id: "puzzle", title: "🧩 פאזל" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji", title: "😄 חידת אימוג'ים" }
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

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function renderMemoryGame(body, model) {
    // model: { symbols:[], alts:[], level1, level2, parashaLabel }
    const hasL1 = clampEven(model.level1) > 0;
    const hasL2 = clampEven(model.level2) > 0;
    const showLevels = hasL1 && hasL2;

    body.innerHTML = `
      <div class="mem-topbar">
        ${showLevels ? `<button type="button" class="mem-level" data-level="1" aria-pressed="true">רמה 1</button>` : ``}
        ${showLevels ? `<button type="button" class="mem-level" data-level="2" aria-pressed="false">רמה 2</button>` : ``}
        <button type="button" class="mem-reset">איפוס</button>
        <div class="mem-stats" aria-live="polite">
          <span class="mem-tries"></span>
          <span class="mem-time"></span>
          <span class="mem-matched"></span>
        </div>
      </div>
      <div class="mem-grid" role="grid"></div>
    `;

    const grid = body.querySelector(".mem-grid");
    const btnReset = body.querySelector(".mem-reset");
    const btnL1 = body.querySelector('.mem-level[data-level="1"]');
    const btnL2 = body.querySelector('.mem-level[data-level="2"]');
    const elTries = body.querySelector(".mem-tries");
    const elTime = body.querySelector(".mem-time");
    const elMatched = body.querySelector(".mem-matched");

    let state = null;
    let timerId = null;
    let timerStart = 0;

    function stopTimer() {
      if (timerId) clearInterval(timerId);
      timerId = null;
    }

    function startTimer() {
      stopTimer();
      timerStart = Date.now();
      timerId = setInterval(updateStats, 1000);
    }

    function computeCols(cardCount) {
      // תמיד שאיפה לריבוע: 4->2x2? אבל אצלך מינימום 8. נשמור כלל פשוט:
      if (cardCount === 16) return 4;
      if (cardCount === 12) return 4;
      if (cardCount === 8) return 4;
      if (cardCount === 20) return 5;
      return 6;
    }

    function updateLevelButtons(levelNum) {
      if (!showLevels) return;
      if (btnL1) btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
      if (btnL2) btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
    }

    function buildDeck(cardCount) {
      const maxPairs = Math.min(model.symbols.length, model.alts.length);
      const pairsNeeded = Math.min(cardCount / 2, maxPairs);

      const items = [];
      for (let i = 0; i < pairsNeeded; i++) {
        items.push({ key: String(i), symbol: model.symbols[i], alt: model.alts[i] });
      }

      const deck = [];
      items.forEach(it => {
        deck.push({ ...it, uid: it.key + "-a" });
        deck.push({ ...it, uid: it.key + "-b" });
      });

      // ✅ ערבוב חדש בכל איפוס: מוסיפים nonce שמשתנה
      state.shuffleNonce = (state.shuffleNonce || 0) + 1;
      return seededShuffle(deck, `${model.parashaLabel}|${cardCount}|memory|${state.shuffleNonce}`);
    }

    function updateStats() {
      if (!state) return;
      const elapsed = timerStart ? Date.now() - timerStart : 0;
      elTries.textContent = `ניסיונות: ${state.tries}`;
      elTime.textContent = `זמן: ${formatTime(elapsed)}`;
      elMatched.textContent = `התאמות: ${state.matchedPairs}/${state.totalPairs}`;

      // ✅ עצירת זמן בסיום
      if (state.matchedPairs >= state.totalPairs) stopTimer();
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
        btn.textContent = ""; // הטקסט מגיע מה-::before ("פרשת השבוע בניחותא")
        btn.setAttribute("aria-label", "קלף סגור");
        btn.setAttribute("aria-pressed", "false");
      }
    }

    function lockCard(btn, locked) {
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
      btn.disabled = !!locked;
    }

    function reset(level) {
      const levelNum = showLevels ? (level === 2 ? 2 : 1) : 1;
      updateLevelButtons(levelNum);

      const wanted = levelNum === 2 ? model.level2 : model.level1;
      const cardCount = clampEven(wanted);

      grid.innerHTML = "";

      state = {
        level: levelNum,
        open: [],
        lock: false,
        tries: 0,
        matchedPairs: 0,
        totalPairs: cardCount / 2,
        matchedUids: new Set(),
        byUid: new Map(),
        shuffleNonce: (state && state.shuffleNonce) ? state.shuffleNonce : 0,
      };

      const deck = buildDeck(cardCount);
      state.byUid = new Map(deck.map(c => [c.uid, c]));

      const cols = computeCols(deck.length);
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      // צמצום רווחים כדי שלא יהיו “מרווחי טורים” גדולים
      grid.style.gap = "10px";

      deck.forEach(card => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mem-card mem-face-down";
        btn.dataset.uid = card.uid;
        btn.setAttribute("role", "gridcell");
        setCardFace(btn, false);
        grid.appendChild(btn);
      });

      startTimer();
      updateStats();
    }

    function flip(btn) {
      if (!state || state.lock) return;
      if (btn.disabled) return;

      const uid = btn.dataset.uid;
      if (state.matchedUids.has(uid)) return;
      if (state.open.includes(uid)) return;

      setCardFace(btn, true);
      state.open.push(uid);

      if (state.open.length < 2) return;

      const [u1, u2] = state.open;
      const c1 = state.byUid.get(u1);
      const c2 = state.byUid.get(u2);

      state.tries += 1;

      const buttons = Array.from(grid.querySelectorAll(".mem-card"));
      const b1 = buttons.find(b => b.dataset.uid === u1);
      const b2 = buttons.find(b => b.dataset.uid === u2);

      if (c1 && c2 && c1.key === c2.key) {
        state.matchedUids.add(u1);
        state.matchedUids.add(u2);
        state.matchedPairs += 1;
        if (b1) lockCard(b1, true);
        if (b2) lockCard(b2, true);
        state.open = [];
        updateStats();
        return;
      }

      state.lock = true;
      updateStats();

      setTimeout(() => {
        if (b1) setCardFace(b1, false);
        if (b2) setCardFace(b2, false);
        state.open = [];
        state.lock = false;
      }, 700);
    }

    grid.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".mem-card");
      if (!btn) return;
      flip(btn);
    });

    btnReset.addEventListener("click", () => reset(state?.level || 1));
    if (btnL1) btnL1.addEventListener("click", () => reset(1));
    if (btnL2) btnL2.addEventListener("click", () => reset(2));

    // init
    reset(1);

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

    const model = {
      parashaLabel,
      symbols,
      alts,
      level1: Number(data.row.level1 || 0),
      level2: Number(data.row.level2 || 0),
    };

    return renderMemoryGame(gameBody, model);
  }

  // ====== LOAD puzzle assets (CSS + JS) ======
  function baseUrlForThisScript() {
    const s = document.currentScript && document.currentScript.src;
    if (!s) return "https://vaisisrael.github.io/games/";
    return s.substring(0, s.lastIndexOf("/") + 1);
  }

  const loadedAssets = new Set();

  function loadCssOnce(fileName) {
    return new Promise((resolve, reject) => {
      const url = baseUrlForThisScript() + fileName;
      if (loadedAssets.has(url)) return resolve();
      loadedAssets.add(url);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("Failed to load CSS: " + url));
      document.head.appendChild(link);
    });
  }

  function loadScriptOnce(fileName) {
    return new Promise((resolve, reject) => {
      const url = baseUrlForThisScript() + fileName;
      if (loadedAssets.has(url)) return resolve();
      loadedAssets.add(url);

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load JS: " + url));
      document.head.appendChild(script);
    });
  }

  // ====== ACCORDION ======
  function initAccordion(root, onOpenChange) {
    let openBody = null;

    root.querySelectorAll(".game").forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      btn.addEventListener("click", async () => {
        if (openBody && openBody !== body) {
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

    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION
      .map(g => g.id)
      .filter(id => data.row[id] === true);

    if (activeIds.length === 0) return;

    buildGames(root, activeIds);

    const gameControllers = new Map(); // id -> controller

    async function onOpenChange(bodyEl, isOpen) {
      const gameEl = bodyEl.closest(".game");
      const gameId = gameEl?.dataset?.game || "";
      if (!gameId) return;

      if (!isOpen) {
        const ctrl = gameControllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      if (gameControllers.has(gameId)) return;

      if (gameId === "memory") {
        bodyEl.innerHTML = "טוען משחק זיכרון...";
        const ctrl = await initMemoryGame(bodyEl, parashaLabel);
        gameControllers.set(gameId, ctrl);
        return;
      }

      if (gameId === "puzzle") {
        bodyEl.innerHTML = "טוען פאזל...";
        await loadCssOnce("puzzle.css");
        await loadScriptOnce("puzzle.js");

        const reg = window.ParashaGames && window.ParashaGames._registry;
        const factoryFn = reg && reg.get("puzzle");
        if (!factoryFn) {
          bodyEl.innerHTML = "שגיאה בטעינת הפאזל.";
          gameControllers.set(gameId, { reset: () => {} });
          return;
        }

        const api = factoryFn({ CONTROL_API, parashaLabel });
        const ctrl = await api.init(bodyEl);
        gameControllers.set(gameId, ctrl || { reset: () => {} });
        return;
      }

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
