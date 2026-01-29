// memory.js – Parasha Games: Memory Game (module)
// Exposes: window.ParashaGames.register("memory", factory)

(() => {
  "use strict";

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

  function showBanner(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("mem-banner--show");
    void el.offsetWidth; // retrigger animation
    if (text) el.classList.add("mem-banner--show");
  }

  function factory({ CONTROL_API, parashaLabel }) {
    async function init(gameBody) {
      const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data || !data.row) {
        gameBody.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
        return { reset: () => {} };
      }

      const row = data.row;

      const model = {
        parashaLabel,
        symbols: parseCsvList(row.symbols),
        alts: parseCsvList(row.alts),
        hints: parseCsvList(row.hints), // אופציונלי
        level1: Number(row.level1 || 0),
        level2: Number(row.level2 || 0),
      };

      return render(gameBody, model);
    }

    function render(body, model) {
      const hasLevel1 = clampEven(model.level1) > 0;
      const hasLevel2 = clampEven(model.level2) > 0;
      const showLevelButtons = hasLevel1 && hasLevel2;

      body.innerHTML = `
        <div class="mem-topbar">
          ${showLevelButtons ? `<button type="button" class="mem-level" data-level="1" aria-pressed="true">רמה 1</button>` : ``}
          ${showLevelButtons ? `<button type="button" class="mem-level" data-level="2" aria-pressed="false">רמה 2</button>` : ``}
          <button type="button" class="mem-reset">איפוס</button>

          <div class="mem-stats" aria-live="polite">
            <span class="mem-tries"></span>
            <span class="mem-time"></span>
            <span class="mem-matches"></span>
          </div>
        </div>

        <div class="mem-banner" aria-live="polite"></div>

        <div class="mem-grid" role="grid"></div>
      `;

      const grid = body.querySelector(".mem-grid");
      const banner = body.querySelector(".mem-banner");

      const btnReset = body.querySelector(".mem-reset");
      const btnL1 = body.querySelector('.mem-level[data-level="1"]');
      const btnL2 = body.querySelector('.mem-level[data-level="2"]');

      const elTries = body.querySelector(".mem-tries");
      const elMatches = body.querySelector(".mem-matches");
      const elTime = body.querySelector(".mem-time");

      let state = null;
      let shuffleNonce = 0;

      // timer
      let timerStartMs = 0;
      let timerId = null;

      function stopTimer() {
        if (timerId) clearInterval(timerId);
        timerId = null;
      }

      function startTimer() {
        stopTimer();
        timerStartMs = Date.now();
        timerId = setInterval(updateStats, 1000);
      }

      function setActiveLevel(levelNum) {
        if (!showLevelButtons) return;
        if (btnL1) btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
        if (btnL2) btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
      }

      function buildDeck(cardCount) {
        const maxPairs = Math.min(model.symbols.length, model.alts.length);
        const pairsNeeded = Math.min(cardCount / 2, maxPairs);

        const items = [];
        for (let i = 0; i < pairsNeeded; i++) {
          items.push({
            key: String(i),
            symbol: model.symbols[i],
            alt: model.alts[i],
            hint: (model.hints && model.hints[i]) ? model.hints[i] : "",
          });
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
          btn.textContent = "קלף";
          btn.setAttribute("aria-label", "קלף סגור");
          btn.setAttribute("aria-pressed", "false");
        }
      }

      function lockCard(btn, locked) {
        btn.setAttribute("aria-disabled", locked ? "true" : "false");
        btn.disabled = !!locked;
      }

      function onMatchFound(card) {
        const text = card.hint
          ? `✨ יפה! ${card.alt} — ${card.hint}`
          : `✨ יפה! מצאת זוג: ${card.alt}`;
        showBanner(banner, text);
      }

      function finishIfNeeded() {
        if (!state) return;
        if (state.matchedPairs >= state.totalPairs) {
          stopTimer();
          showBanner(banner, "🎉 כל הכבוד! סיימת!");
        }
      }

      function reset(levelReq) {
        const levelNum = showLevelButtons ? (levelReq === 2 ? 2 : 1) : 1;
        const wanted = levelNum === 2 ? model.level2 : model.level1;
        const cardCount = clampEven(wanted);

        if (!cardCount) {
          state = null;
          grid.innerHTML = "";
          showBanner(banner, "אין נתונים מספיקים לרמת המשחק.");
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

        grid.style.gridTemplateColumns = `repeat(${cols}, var(--card))`;
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

        setActiveLevel(levelNum);
        startTimer();
        updateStats();
        showBanner(banner, "");
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

          onMatchFound(c1);
          finishIfNeeded();
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
      if (showLevelButtons) {
        btnL1.addEventListener("click", () => reset(1));
        btnL2.addEventListener("click", () => reset(2));
      }

      reset(1);

      return {
        reset: () => {
          stopTimer();
          reset(1);
        },
      };
    }

    return { init };
  }

  // ---- register to global core ----
  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames._registry = window.ParashaGames._registry || new Map();
  window.ParashaGames.register =
    window.ParashaGames.register ||
    function (id, factoryFn) {
      window.ParashaGames._registry.set(id, factoryFn);
    };

  window.ParashaGames.register("memory", factory);
})();
