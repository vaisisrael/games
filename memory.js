(() => {
  "use strict";

  // ===== Seeded shuffle (deterministic per parasha + nonce) =====
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

  // ===== Helpers =====
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
  function bestCols(n) {
    // try to be as square as possible
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

  // ===== Register =====
  window.ParashaGamesRegister("memory", {
    init: async (rootEl, ctx) => {
      const { CONTROL_API, parashaLabel } = ctx;

      const url = `${CONTROL_API}?mode=memory&parasha=${encodeURIComponent(parashaLabel)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data || !data.ok || !data.row) {
        rootEl.innerHTML = `<div>לא נמצאו נתוני זיכרון לפרשה זו.</div>`;
        return { reset: () => {} };
      }

      const row = data.row;
      const symbols = parseCsvList(row.symbols);
      const alts = parseCsvList(row.alts);

      const level1 = Number(row.level1 || 0);
      const level2 = Number(row.level2 || 0);

      const hasL1 = clampEven(level1) > 0;
      const hasL2 = clampEven(level2) > 0;
      const showLevels = hasL1 && hasL2;

      rootEl.innerHTML = `
        <div class="mem-wrap">
          <div class="mem-cardbox">

            <div class="mem-topbar">
              <div class="mem-stats" aria-live="polite">
                <span class="mem-tries">ניסיונות: 0</span>
                <span class="mem-matches">התאמות: 0/0</span>
                <span class="mem-time">זמן: 00:00</span>
              </div>

              <div class="mem-actions">
                ${
                  showLevels
                    ? `<button type="button" class="mem-btn mem-level" data-level="1" aria-pressed="true">רמה 1</button>
                       <button type="button" class="mem-btn mem-level" data-level="2" aria-pressed="false">רמה 2</button>`
                    : ``
                }
                <button type="button" class="mem-btn mem-reset">איפוס</button>
              </div>
            </div>

            <div class="mem-banner" hidden></div>
            <div class="mem-grid" role="grid"></div>

          </div>
        </div>
      `;

      const grid = rootEl.querySelector(".mem-grid");
      const banner = rootEl.querySelector(".mem-banner");

      const elTries = rootEl.querySelector(".mem-tries");
      const elMatches = rootEl.querySelector(".mem-matches");
      const elTime = rootEl.querySelector(".mem-time");

      const btnReset = rootEl.querySelector(".mem-reset");
      const btnL1 = rootEl.querySelector('.mem-level[data-level="1"]');
      const btnL2 = rootEl.querySelector('.mem-level[data-level="2"]');

      let state = null;

      // shuffle changes on every reset
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

      function showBanner(text) {
        banner.textContent = text;
        banner.hidden = false;
        banner.classList.add("is-on");

        // hide after a moment
        setTimeout(() => {
          banner.classList.remove("is-on");
          setTimeout(() => (banner.hidden = true), 180);
        }, 950);
      }

      function setActiveLevel(levelNum) {
        if (!showLevels) return;
        if (btnL1) btnL1.setAttribute("aria-pressed", levelNum === 1 ? "true" : "false");
        if (btnL2) btnL2.setAttribute("aria-pressed", levelNum === 2 ? "true" : "false");
      }

      function buildDeck(cardCount) {
        const maxPairs = Math.min(symbols.length, alts.length);
        const pairsNeeded = Math.min(cardCount / 2, maxPairs);

        const items = [];
        for (let i = 0; i < pairsNeeded; i++) {
          items.push({ key: String(i), symbol: symbols[i], alt: alts[i] });
        }

        const deck = [];
        items.forEach(it => {
          deck.push({ ...it, uid: it.key + "-a" });
          deck.push({ ...it, uid: it.key + "-b" });
        });

        const seed = `${parashaLabel}|${cardCount}|memory|${shuffleNonce}`;
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

      function onCompleted() {
        stopTimer();
        updateStats();
        showBanner("🎉 כל הכבוד! סיימת את המשחק!");
      }

      function reset(requestedLevel) {
        const levelNum = showLevels ? (requestedLevel === 2 ? 2 : 1) : 1;
        const wanted = levelNum === 2 ? level2 : level1;
        const cardCount = clampEven(wanted);

        if (!cardCount) {
          state = null;
          grid.innerHTML = "";
          elTries.textContent = "";
          elMatches.textContent = "אין נתונים מספיקים.";
          elTime.textContent = "";
          stopTimer();
          banner.hidden = true;
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
          byUid: new Map(deck.map(c => [c.uid, c]))
        };

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
        banner.hidden = true;
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
          // match
          state.matchedUids.add(u1);
          state.matchedUids.add(u2);
          state.matchedPairs += 1;

          if (b1) lockCard(b1, true);
          if (b2) lockCard(b2, true);

          state.open = [];
          updateStats();

          // ✅ match banner (alt labels)
          showBanner(`✨ יפה! ${c1.alt} — ${c2.alt}`);

          if (state.matchedPairs >= state.totalPairs) onCompleted();
          return;
        }

        // no match
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

      if (showLevels) {
        btnL1.addEventListener("click", () => reset(1));
        btnL2.addEventListener("click", () => reset(2));
      }

      // init
      reset(1);

      return { reset: () => reset(1) };
    }
  });
})();
