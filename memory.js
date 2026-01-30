/* memory.js – Parasha memory game (module)
   Expects Apps Script:
   ?mode=memory&parasha=...
   returns:
   { ok:true, row:{ parasha, symbols, alts, hints(optional), level1, level2 } }
*/

(() => {
  "use strict";

  // ---------- helpers ----------
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

  // best column count for a near-square grid
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

  // seeded shuffle (stable per parasha + nonce)
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

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  // ---------- module init ----------
  async function initMemory(rootEl, ctx) {
    const { CONTROL_API, parashaLabel } = ctx;

    // fetch row
    const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.row) {
      rootEl.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const symbols = parseCsvList(data.row.symbols);
    const alts = parseCsvList(data.row.alts);
    const hints = parseCsvList(data.row.hints); // optional

    const level1 = Number(data.row.level1 || 0);
    const level2 = Number(data.row.level2 || 0);

    const model = {
      parashaLabel,
      symbols,
      alts,
      hints,
      level1,
      level2
    };

    return render(rootEl, model);
  }

  function render(rootEl, model) {
    // Decide levels visibility
    const hasL1 = clampEven(model.level1) > 0;
    const hasL2 = clampEven(model.level2) > 0;
    const showLevelButtons = hasL1 && hasL2;

    // Build UI (NOTE: mem-actions + mem-stats wrappers!)
    rootEl.innerHTML = `
      <div class="mem-wrap">
        <div class="mem-cardbox">
          <div class="mem-topbar">
            <div class="mem-actions">
              ${showLevelButtons ? `<button type="button" class="mem-btn mem-level" data-level="1" aria-pressed="true">רמה 1</button>` : ``}
              ${showLevelButtons ? `<button type="button" class="mem-btn mem-level" data-level="2" aria-pressed="false">רמה 2</button>` : ``}
              <button type="button" class="mem-btn mem-reset">איפוס</button>
            </div>

            <div class="mem-stats" aria-live="polite">
              <span class="mem-tries"></span>
              <span class="mem-matches"></span>
              <span class="mem-time"></span>
            </div>
          </div>

          <div class="mem-banner" hidden></div>

          <div class="mem-grid" role="grid"></div>
        </div>
      </div>
    `.trim();

    const grid = rootEl.querySelector(".mem-grid");
    const banner = rootEl.querySelector(".mem-banner");

    const btnReset = rootEl.querySelector(".mem-reset");
    const btnL1 = rootEl.querySelector('.mem-level[data-level="1"]');
    const btnL2 = rootEl.querySelector('.mem-level[data-level="2"]');

    const elTries = rootEl.querySelector(".mem-tries");
    const elMatches = rootEl.querySelector(".mem-matches");
    const elTime = rootEl.querySelector(".mem-time");

    let state = null;

    // reshuffle each reset
    let shuffleNonce = 0;

    // timer
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

    function hideBanner() {
      if (!banner) return;
      banner.hidden = true;
      banner.classList.remove("is-on");
      banner.textContent = "";
    }

    // ✅ FIX: longer banner + allow awaiting completion flow
    function showBanner(text, durationMs = 1600) {
      if (!banner) return Promise.resolve();

      // cancel any previous hide timers by bumping token
      showBanner._token = (showBanner._token || 0) + 1;
      const token = showBanner._token;

      banner.textContent = text;
      banner.hidden = false;

      // trigger animation
      requestAnimationFrame(() => banner.classList.add("is-on"));

      return new Promise((resolve) => {
        setTimeout(() => {
          if (showBanner._token !== token) return resolve(); // superseded
          banner.classList.remove("is-on");

          setTimeout(() => {
            if (showBanner._token !== token) return resolve(); // superseded
            if (banner.classList.contains("is-on")) return resolve();
            banner.hidden = true;
            resolve();
          }, 140);
        }, durationMs);
      });
    }

    function buildDeck(cardCount, levelNum) {
      const maxPairs = Math.min(model.symbols.length, model.alts.length);
      const pairsNeeded = Math.min(cardCount / 2, maxPairs);

      const items = [];
      for (let i = 0; i < pairsNeeded; i++) {
        items.push({
          key: String(i),
          symbol: model.symbols[i],
          alt: model.alts[i],
          hint: model.hints[i] || "" // optional
        });
      }

      const deck = [];
      items.forEach((it) => {
        deck.push({ ...it, uid: it.key + "-a" });
        deck.push({ ...it, uid: it.key + "-b" });
      });

      const seed = `${model.parashaLabel}|${cardCount}|memory|L${levelNum}|${shuffleNonce}`;
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
        btn.textContent = "פרשת השבוע בניחותא";
        btn.setAttribute("aria-label", "קלף סגור");
        btn.setAttribute("aria-pressed", "false");
      }
    }

    function lockCard(btn, locked) {
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
      btn.disabled = !!locked;
    }

    // ✅ FIX: completion banner must not swallow last match banner
    async function markCompletedIfNeeded() {
      if (!state) return;
      if (state.matchedPairs >= state.totalPairs) {
        stopTimer();
        updateStats();
        // show completion AFTER a short pause so last-match banner is visible
        await showBanner("👏 כל הכבוד! סיימת את המשחק", 2000);
      }
    }

    function reset(requestedLevel) {
      hideBanner();

      // choose level
      const levelNum = showLevelButtons ? (requestedLevel === 2 ? 2 : 1) : 1;
      const wanted = levelNum === 2 ? model.level2 : model.level1;
      const cardCount = clampEven(wanted);

      // You asked: no "invalid parts" message — your responsibility in the sheet.
      // If missing/invalid -> just empty state quietly.
      if (!cardCount) {
        stopTimer();
        state = null;
        grid.innerHTML = "";
        elTries.textContent = "";
        elMatches.textContent = "";
        elTime.textContent = "";
        return;
      }

      shuffleNonce += 1;

      const deck = buildDeck(cardCount, levelNum);
      const cols = bestCols(deck.length);

      // tweak spacing on small decks: tighter gap
      const gap = deck.length <= 8 ? 8 : 10;

      state = {
        level: levelNum,
        deck,
        open: [],
        lock: false,
        tries: 0,
        matchedPairs: 0,
        totalPairs: deck.length / 2,
        matchedUids: new Set(),
        byUid: new Map(deck.map(c => [c.uid, c]))
      };

      grid.style.setProperty("--gap", `${gap}px`);
      grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
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

      setActiveLevel(levelNum);

      startTimer();
      updateStats();
    }

    async function flip(btn) {
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

      // match
      if (c1 && c2 && c1.key === c2.key) {
        state.matchedUids.add(u1);
        state.matchedUids.add(u2);
        state.matchedPairs += 1;

        if (b1) lockCard(b1, true);
        if (b2) lockCard(b2, true);

        state.open = [];
        updateStats();

        // per-match banner
        const hint = (c1.hint || "").trim();
        if (hint) {
          await showBanner(`✨ יפה! ${hint}`, 1600);
        } else {
          await showBanner("✨ יפה! התאמה נכונה", 1600);
        }

        // ✅ after match banner has been shown, then possibly completion banner
        await markCompletedIfNeeded();
        return;
      }

      // not match
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
      // fire and forget (async)
      flip(btn);
    });

    btnReset.addEventListener("click", () => reset(state?.level || 1));
    if (showLevelButtons) {
      btnL1.addEventListener("click", () => reset(1));
      btnL2.addEventListener("click", () => reset(2));
    }

    // init
    reset(1);

    // controller API (games.js calls reset() on accordion close)
    return {
      reset: () => {
        stopTimer();
        reset(1);
      }
    };
  }

  // ---------- register ----------
  // games.js expects registry value to be either object with init(rootEl, ctx) OR function(ctx)->module
  window.ParashaGamesRegister("memory", {
    init: async (rootEl, ctx) => initMemory(rootEl, ctx)
  });
})();
