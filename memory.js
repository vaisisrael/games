(() => {
  "use strict";

  // ===== registry =====
  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames._registry = window.ParashaGames._registry || new Map();

  // ===== utils =====
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

  // deterministic shuffle helpers
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

  function showBanner(el, text) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("mem-banner--show");
    void el.offsetWidth;
    if (text) el.classList.add("mem-banner--show");

    if (text) {
      setTimeout(() => el.classList.remove("mem-banner--show"), 1200);
    }
  }

  function computeCols(cardCount) {
    // מטרה: תמיד “מרובע” ככל האפשר
    if (cardCount === 16) return 4;
    if (cardCount === 12) return 4;
    if (cardCount === 8) return 4;
    if (cardCount === 20) return 5;
    return 6;
  }

  // ===== factory =====
  function factory({ CONTROL_API, parashaLabel }) {
    async function init(container) {
      // fetch memory row
      const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.row) {
        container.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
        return { reset: () => {} };
      }

      const symbols = parseCsvList(data.row.symbols);
      const alts = parseCsvList(data.row.alts);

      const model = {
        parashaLabel,
        symbols,
        alts,
        level1: Number(data.row.level1 || 0),
        level2: Number(data.row.level2 || 0)
      };

      container.innerHTML = `
        <div class="mem-topbar">
          <button type="button" class="mem-level" data-level="1" aria-pressed="true">רמה 1</button>
          <button type="button" class="mem-level" data-level="2" aria-pressed="false">רמה 2</button>
          <button type="button" class="mem-reset">איפוס</button>
          <div class="mem-stats" aria-live="polite">
            <span class="mem-tries"></span>
            <span class="mem-time"></span>
            <span class="mem-matched"></span>
          </div>
        </div>
        <div class="mem-banner" aria-live="polite"></div>
        <div class="mem-grid" role="grid"></div>
      `;

      const grid = container.querySelector(".mem-grid");
      const banner = container.querySelector(".mem-banner");
      const btnReset = container.querySelector(".mem-reset");
      const btnL1 = container.querySelector('.mem-level[data-level="1"]');
      const btnL2 = container.querySelector('.mem-level[data-level="2"]');
      const elTries = container.querySelector(".mem-tries");
      const elTime = container.querySelector(".mem-time");
      const elMatched = container.querySelector(".mem-matched");

      // אם אין רמה 2 – מסתירים גם את רמה 1 (כמו שסיכמת בעבר)
      const hasL2 = clampEven(model.level2) > 0;
      const hasL1 = clampEven(model.level1) > 0;
      const showLevels = hasL1 && hasL2;

      if (!showLevels) {
        btnL1.style.display = "none";
        btnL2.style.display = "none";
      }

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

      function updateLevelButtons(levelNum) {
        if (!showLevels) return;
        btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
        btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
      }

      function updateStats() {
        if (!state) return;
        const elapsed = timerStart ? Date.now() - timerStart : 0;

        elTries.textContent = `ניסיונות: ${state.tries}`;
        elTime.textContent = `זמן: ${formatTime(elapsed)}`;
        elMatched.textContent = `התאמות: ${state.matchedPairs}/${state.totalPairs}`;

        if (state.matchedPairs >= state.totalPairs) stopTimer();
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

        // ערבוב דטרמיניסטי – אבל כל איפוס מחדש משנה מיקום
        state.shuffleNonce = (state.shuffleNonce || 0) + 1;
        return seededShuffle(deck, `${model.parashaLabel}|${cardCount}|memory|${state.shuffleNonce}`);
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

      function reset(level) {
        const levelNum = showLevels ? (level === 2 ? 2 : 1) : 1;
        updateLevelButtons(levelNum);

        const wanted = levelNum === 2 ? model.level2 : model.level1;
        const cardCount = clampEven(wanted);

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

        showBanner(banner, "");
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

          // הודעת התאמה – תמיד אותה התאמה, לא “צמד מוזר”
          showBanner(banner, `✨ יפה! ${c1.symbol} — ${c1.alt}`);

          state.open = [];
          updateStats();

          if (state.matchedPairs >= state.totalPairs) {
            showBanner(banner, "🎉 כל הכבוד! סיימת!");
          }
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
      btnL1.addEventListener("click", () => reset(1));
      btnL2.addEventListener("click", () => reset(2));

      reset(1);

      return { reset: () => reset(1) };
    }

    return { init };
  }

  // register
  window.ParashaGames._registry.set("memory", factory);
})();
