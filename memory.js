(() => {
  "use strict";

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

  function bestCols(n) {
    const target = Math.sqrt(n);
    let best = 1;
    let bestScore = Infinity;

    for (let c = 1; c <= n; c++) {
      if (n % c !== 0) continue;
      const score = Math.abs(c - target);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  async function initMemoryGame({ CONTROL_API, parashaLabel }, bodyEl) {
    const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.row) {
      bodyEl.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
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

    const hasLevel1 = clampEven(model.level1) > 0;
    const hasLevel2 = clampEven(model.level2) > 0;
    const showLevelButtons = hasLevel1 && hasLevel2;

    bodyEl.innerHTML = `
      <div class="mem-topbar">
        ${
          showLevelButtons
            ? `<button type="button" class="mem-level" data-level="1" aria-pressed="true">רמה 1</button>`
            : ``
        }
        ${
          showLevelButtons
            ? `<button type="button" class="mem-level" data-level="2" aria-pressed="false">רמה 2</button>`
            : ``
        }
        <button type="button" class="mem-reset">איפוס</button>

        <div class="mem-stats" aria-live="polite">
          <span class="mem-tries"></span>
          <span class="mem-matches"></span>
          <span class="mem-time"></span>
        </div>
      </div>

      <div class="mem-banner" aria-live="polite"></div>
      <div class="mem-grid" role="grid"></div>
    `;

    const grid = bodyEl.querySelector(".mem-grid");
    const btnReset = bodyEl.querySelector(".mem-reset");
    const btnL1 = bodyEl.querySelector('.mem-level[data-level="1"]');
    const btnL2 = bodyEl.querySelector('.mem-level[data-level="2"]');

    const elTries = bodyEl.querySelector(".mem-tries");
    const elMatches = bodyEl.querySelector(".mem-matches");
    const elTime = bodyEl.querySelector(".mem-time");
    const banner = bodyEl.querySelector(".mem-banner");

    let state = null;
    let shuffleNonce = 0;

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

    function setActiveLevel(levelNum) {
      if (!showLevelButtons) return;
      if (btnL1) btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
      if (btnL2) btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
    }

    function showBanner(text) {
      banner.textContent = text || "";
    }

    function buildDeck(cardCount) {
      const maxPairs = Math.min(model.symbols.length, model.alts.length);
      const pairsNeeded = Math.min(cardCount / 2, maxPairs);

      const items = [];
      for (let i = 0; i < pairsNeeded; i++) {
        items.push({ key: String(i), symbol: model.symbols[i], alt: model.alts[i] });
      }

      const deck = [];
      items.forEach((it) => {
        deck.push({ ...it, uid: it.key + "-a" });
        deck.push({ ...it, uid: it.key + "-b" });
      });

      const seed = `${model.parashaLabel}|${cardCount}|memory|${shuffleNonce}`;
      return seededShuffle(deck, seed);
    }

    function updateStats() {
      if (!state) return;
      const elapsed = timerStartMs ? Date.now() - timerStartMs : 0;
      elTries.textContent = `ניסיונות: ${state.tries}`;
      elMatches.textContent = `התאמות: ${state.matchedPairs}/${state.totalPairs}`;
      elTime.textContent = `זמן: ${formatTime(elapsed)}`;
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
        btn.textContent = "";
        btn.setAttribute("aria-label", "קלף סגור");
        btn.setAttribute("aria-pressed", "false");
      }
    }

    function lockCard(btn, locked) {
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
      btn.disabled = !!locked;
    }

    function markCompletedIfNeeded() {
      if (!state) return;
      if (state.matchedPairs >= state.totalPairs) {
        stopTimer();
        updateStats();
        showBanner("🎉 כל הכבוד! סיימת את המשחק!");
      }
    }

    function reset(requestedLevel) {
      const levelNum = showLevelButtons ? (requestedLevel === 2 ? 2 : 1) : 1;
      const wanted = levelNum === 2 ? model.level2 : model.level1;
      const cardCount = clampEven(wanted);

      if (!cardCount) {
        state = null;
        grid.innerHTML = "";
        elTries.textContent = "";
        elMatches.textContent = "אין נתונים מספיקים לרמת המשחק.";
        elTime.textContent = "";
        showBanner("");
        stopTimer();
        return;
      }

      shuffleNonce += 1;

      const deck = buildDeck(cardCount);
      const cols = bestCols(deck.length);

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

      grid.style.setProperty("--card", cols >= 6 ? "62px" : cols === 5 ? "66px" : "74px");
      grid.style.gridTemplateColumns = `repeat(${cols}, var(--card))`;
      grid.style.gap = "10px";
      grid.innerHTML = "";
      showBanner("");

      deck.forEach((card) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mem-card mem-face-down";
        btn.dataset.uid = card.uid;
        btn.setAttribute("role", "gridcell");
        setCardFace(btn, false);
        grid.appendChild(btn);
      });

      setActiveLevel(levelNum);
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
      const b1 = buttons.find((b) => b.dataset.uid === u1);
      const b2 = buttons.find((b) => b.dataset.uid === u2);

      if (c1 && c2 && c1.key === c2.key) {
        state.matchedUids.add(u1);
        state.matchedUids.add(u2);
        state.matchedPairs += 1;
        if (b1) lockCard(b1, true);
        if (b2) lockCard(b2, true);
        state.open = [];
        updateStats();
        showBanner(`✨ יפה! ${c1.symbol} — ${c1.alt}`);
        markCompletedIfNeeded();
        return;
      }

      state.lock = true;
      updateStats();

      setTimeout(() => {
        if (b1) setCardFace(b1, false);
        if (b2) setCardFace(b2, false);
        state.open = [];
        state.lock = false;
      }, 650);
    }

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

    // init
    reset(1);

    return { reset: () => reset(1) };
  }

  // ====== REGISTER ======
  // This guarantees registry exists even if games.js loaded before/after
  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames.registry = window.ParashaGames.registry || new Map();

  const register = window.ParashaGamesRegister
    ? window.ParashaGamesRegister
    : (id, factory) => window.ParashaGames.registry.set(id, factory);

  register("memory", ({ CONTROL_API, parashaLabel }) => ({
    init: async (bodyEl) => initMemoryGame({ CONTROL_API, parashaLabel }, bodyEl),
  }));
})();
