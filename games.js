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
    { id: "emoji", title: "😄 חידת אימוג'ים" },
  ];

  const SWITCH_CONFIRM_TEXT = "לעבור למשחק אחר?\nהמשחק הנוכחי ייסגר";
  const FINISH_MESSAGE = "🎉 כל הכבוד! סיימת!";

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

  // ====== SEEDED SHUFFLE ======
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

  // ====== MEMORY GAME ======
  function parseCsvList(s) {
    return String(s || "").split(",").map(x => x.trim()).filter(Boolean);
  }
  function clampEven(n) {
    n = Number(n || 0);
    if (!Number.isFinite(n) || n < 2) return 0;
    return n % 2 === 0 ? n : n - 1;
  }
  function bestCols(n) {
    const target = Math.sqrt(n);
    let best = 1, bestScore = Infinity;
    for (let c = 1; c <= n; c++) {
      if (n % c !== 0) continue;
      const score = Math.abs(c - target);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }
  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function renderMemoryGame(body, model) {
    const hasLevel1 = clampEven(model.level1) > 0;
    const hasLevel2 = clampEven(model.level2) > 0;
    const showLevelButtons = hasLevel1 && hasLevel2;

    body.innerHTML = `
      <div class="mem-topbar">
        ${showLevelButtons ? `<button class="mem-level" data-level="1" aria-pressed="true">רמה 1</button>` : ``}
        ${showLevelButtons ? `<button class="mem-level" data-level="2" aria-pressed="false">רמה 2</button>` : ``}
        <button class="mem-reset">איפוס</button>
        <div class="mem-stats">
          <span class="mem-tries"></span>
          <span class="mem-matches"></span>
          <span class="mem-time"></span>
        </div>
      </div>
      <div class="mem-grid"></div>
    `;

    const grid = body.querySelector(".mem-grid");
    const btnReset = body.querySelector(".mem-reset");
    const btnL1 = body.querySelector('.mem-level[data-level="1"]');
    const btnL2 = body.querySelector('.mem-level[data-level="2"]');
    const elTries = body.querySelector(".mem-tries");
    const elMatches = body.querySelector(".mem-matches");
    const elTime = body.querySelector(".mem-time");

    let state = null;
    let shuffleNonce = 0;
    let timerStartMs = 0;
    let timerIntervalId = null;
    let finishedShown = false;

    function stopTimer() {
      if (timerIntervalId) clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    function startTimer() {
      stopTimer();
      timerStartMs = Date.now();
      timerIntervalId = setInterval(updateStats, 1000);
    }
    function updateStats() {
      if (!state) return;
      elTries.textContent = `ניסיונות: ${state.tries}`;
      elMatches.textContent = `התאמות: ${state.matchedPairs}/${state.totalPairs}`;
      elTime.textContent = `זמן: ${formatTime(Date.now() - timerStartMs)}`;
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
      const seed = `${model.parashaLabel}|${cardCount}|memory|${shuffleNonce}`;
      return seededShuffle(deck, seed);
    }

    function setCardFace(btn, faceUp) {
      const card = state.byUid.get(btn.dataset.uid);
      if (!card) return;
      if (faceUp) {
        btn.classList.remove("mem-face-down");
        btn.textContent = card.symbol;
      } else {
        btn.classList.add("mem-face-down");
        btn.textContent = "קלף";
      }
    }

    function reset(levelReq) {
      const level = showLevelButtons ? (levelReq === 2 ? 2 : 1) : 1;
      const wanted = level === 2 ? model.level2 : model.level1;
      const cardCount = clampEven(wanted);
      if (!cardCount) return;

      shuffleNonce++;
      finishedShown = false;

      const deck = buildDeck(cardCount);
      const cols = bestCols(deck.length);

      state = {
        level,
        deck,
        open: [],
        lock: false,
        tries: 0,
        matchedPairs: 0,
        totalPairs: deck.length / 2,
        matchedUids: new Set(),
        byUid: new Map(deck.map(c => [c.uid, c])),
      };

      grid.style.gridTemplateColumns = `repeat(${cols}, var(--card))`;
      grid.innerHTML = "";

      deck.forEach(card => {
        const btn = document.createElement("button");
        btn.className = "mem-card mem-face-down";
        btn.dataset.uid = card.uid;
        setCardFace(btn, false);
        grid.appendChild(btn);
      });

      startTimer();
      updateStats();
    }

    function finishIfNeeded() {
      if (finishedShown) return;
      if (state.matchedPairs >= state.totalPairs) {
        stopTimer();
        finishedShown = true;
        alert(FINISH_MESSAGE);
      }
    }

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".mem-card");
      if (!btn || state.lock) return;
      const uid = btn.dataset.uid;
      if (state.matchedUids.has(uid) || state.open.includes(uid)) return;

      setCardFace(btn, true);
      state.open.push(uid);

      if (state.open.length < 2) return;

      const [u1, u2] = state.open;
      const c1 = state.byUid.get(u1);
      const c2 = state.byUid.get(u2);
      state.tries++;

      const buttons = [...grid.querySelectorAll(".mem-card")];
      const b1 = buttons.find(b => b.dataset.uid === u1);
      const b2 = buttons.find(b => b.dataset.uid === u2);

      if (c1.key === c2.key) {
        state.matchedPairs++;
        state.matchedUids.add(u1);
        state.matchedUids.add(u2);
        state.open = [];
        updateStats();
        finishIfNeeded();
        return;
      }

      state.lock = true;
      setTimeout(() => {
        if (b1) setCardFace(b1, false);
        if (b2) setCardFace(b2, false);
        state.open = [];
        state.lock = false;
      }, 700);
    });

    btnReset.addEventListener("click", () => reset(state?.level || 1));
    if (showLevelButtons) {
      btnL1.addEventListener("click", () => reset(1));
      btnL2.addEventListener("click", () => reset(2));
    }

    reset(1);
    return {};
  }

  async function initMemoryGame(gameBody, parashaLabel) {
    const res = await fetch(`${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) {
      gameBody.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
      return {};
    }
    const model = {
      parashaLabel,
      symbols: parseCsvList(data.row.symbols),
      alts: parseCsvList(data.row.alts),
      level1: Number(data.row.level1 || 0),
      level2: Number(data.row.level2 || 0),
    };
    return renderMemoryGame(gameBody, model);
  }

  function initAccordion(root) {
    root.querySelectorAll(".game").forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");
      btn.addEventListener("click", async () => {
        const open = body.style.display === "block";
        body.style.display = open ? "none" : "block";
        if (!open && game.dataset.game === "memory") {
          body.innerHTML = "טוען משחק זיכרון...";
          await initMemoryGame(body, extractParashaLabel());
        }
      });
    });
  }

  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;
    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION.map(g => g.id).filter(id => data.row[id] === true);
    if (activeIds.length === 0) return;

    buildGames(root, activeIds);
    initAccordion(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
