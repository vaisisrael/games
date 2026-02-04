/* wordstack.js – Parasha "תיבה ואות" game (module)
   Expects Apps Script:
   ?mode=wordstack&parasha=...
   returns:
   { ok:true, row:{ parasha, level1_words, level2_words } }

   NO AI. NO UrlFetch. Local validation placeholder.
   Next step: local Hebrew dictionary + inflection rules.
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

  function normalizeWord_(w) {
    return String(w || "")
      .trim()
      .replace(/\s+/g, ""); // no spaces
  }

  function isHebrewOnly_(w) {
    return /^[\u0590-\u05FF]+$/.test(w);
  }

  // Placeholder local judge (to be replaced with dictionary+inflection).
  // Returns true/false.
  function judgeWord_(word) {
    const w = normalizeWord_(word);
    if (!w) return false;
    if (!isHebrewOnly_(w)) return false;
    if (w.length < 2) return false;
    return true;
  }

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function randInt_(min, max) {
    // inclusive
    const a = Math.ceil(min);
    const b = Math.floor(max);
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      const span = (b - a + 1);
      return a + (buf[0] % span);
    }
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function pickRandom_(arr) {
    const list = Array.isArray(arr) ? arr : [];
    if (!list.length) return "";
    return list[randInt_(0, list.length - 1)];
  }

  // Check: newWord is oldWord with exactly ONE extra letter inserted anywhere.
  function isOneLetterAdded_(oldWord, newWord) {
    const a = normalizeWord_(oldWord);
    const b = normalizeWord_(newWord);

    if (!a || !b) return false;
    if (b.length !== a.length + 1) return false;
    if (!isHebrewOnly_(a) || !isHebrewOnly_(b)) return false;

    // two pointers: can skip exactly one char in b
    let i = 0; // a
    let j = 0; // b
    let skipped = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++; j++;
      } else {
        skipped++;
        if (skipped > 1) return false;
        j++; // skip one char in b (the added letter)
      }
    }

    // if we finished a and b has one char left => that's the inserted char
    if (i === a.length && j === b.length) {
      // inserted char must have happened earlier
      return skipped === 1;
    }
    if (i === a.length && j === b.length - 1) {
      // inserted char is last
      return skipped === 0;
    }
    return false;
  }

  // naive computer move (temporary):
  // tries to add one letter at start or end (randomly) from א..ת, plus finals,
  // and accepts the first candidate that passes judgeWord_.
  function computerPickMove_(current) {
    const base = normalizeWord_(current);
    if (!base) return "";

    const letters = [
      "א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ל","מ","נ","ס","ע","פ","צ","ק","ר","ש","ת",
      "ך","ם","ן","ף","ץ"
    ];

    const tryOrder = letters.slice();
    // shuffle tryOrder lightly
    for (let i = tryOrder.length - 1; i > 0; i--) {
      const k = randInt_(0, i);
      const t = tryOrder[i]; tryOrder[i] = tryOrder[k]; tryOrder[k] = t;
    }

    const preferSide = (randInt_(0, 1) === 0) ? "start" : "end";

    for (let pass = 0; pass < 2; pass++) {
      const side = (pass === 0) ? preferSide : (preferSide === "start" ? "end" : "start");
      for (const ch of tryOrder) {
        const candidate = side === "start" ? (ch + base) : (base + ch);
        if (!isOneLetterAdded_(base, candidate)) continue; // should be true, but keep safe
        if (!judgeWord_(candidate)) continue;
        return candidate;
      }
    }

    // no move found under placeholder judge
    return "";
  }

  // ---------- module init ----------
  async function initWordstack(rootEl, ctx) {
    const { CONTROL_API, parashaLabel } = ctx;

    const url = `${CONTROL_API}?mode=wordstack&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.row) {
      rootEl.innerHTML = `<div>לא נמצאו נתוני “תיבה ואות” לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const level1Raw = data.row.level1_words || "";
    const level2Raw = data.row.level2_words || "";

    const level1List = parseCsvList(level1Raw).map(normalizeWord_).filter(Boolean);
    const level2List = parseCsvList(level2Raw).map(normalizeWord_).filter(Boolean);

    const model = {
      parashaLabel,
      level1List,
      level2List
    };

    return render(rootEl, model);
  }

  function render(rootEl, model) {
    rootEl.innerHTML = `
      <div class="ws-wrap">
        <div class="ws-cardbox">
          <div class="ws-topbar">
            <div class="ws-actions">
              <div class="ws-levels" role="tablist" aria-label="בחירת רמה">
                <button type="button" class="ws-btn ws-level ws-level-1" role="tab" aria-selected="true">רמה 1</button>
                <button type="button" class="ws-btn ws-level ws-level-2" role="tab" aria-selected="false">רמה 2</button>
              </div>
              <button type="button" class="ws-btn ws-reset">איפוס</button>
            </div>

            <div class="ws-status" aria-live="polite"></div>
          </div>

          <div class="ws-banner" hidden></div>

          <div class="ws-body">
            <div class="ws-lockedCard" aria-label="תיבה נעולה">
              <div class="ws-lockedTitle">תיבה נעולה</div>
              <div class="ws-lockedWord" aria-label="המילה הנוכחית"></div>
            </div>

            <div class="ws-openCard" aria-label="תיבה פתוחה">
              <div class="ws-openTitle">תיבה פתוחה</div>

              <textarea class="ws-openInput" rows="1" aria-label="כתיבת מילה בתיבה הפתוחה"></textarea>

              <div class="ws-openActions">
                <button type="button" class="ws-btn ws-done">✔ סיימתי</button>
                <button type="button" class="ws-btn ws-next" hidden>המשך ▶</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `.trim();

    const banner = rootEl.querySelector(".ws-banner");
    const elStatus = rootEl.querySelector(".ws-status");

    const btnReset = rootEl.querySelector(".ws-reset");
    const btnLevel1 = rootEl.querySelector(".ws-level-1");
    const btnLevel2 = rootEl.querySelector(".ws-level-2");

    const elLocked = rootEl.querySelector(".ws-lockedWord");
    const elInput = rootEl.querySelector(".ws-openInput");

    const btnDone = rootEl.querySelector(".ws-done");
    const btnNext = rootEl.querySelector(".ws-next");

    // ---------- state ----------
    let state = null;

    function currentStartList_() {
      return state.level === 2 ? model.level2List : model.level1List;
    }

    function pickStartWord_() {
      const list = currentStartList_();
      const w = pickRandom_(list);
      return normalizeWord_(w) || "";
    }

    function hideBanner() {
      if (!banner) return;
      banner.hidden = true;
      banner.classList.remove("is-on");
      banner.textContent = "";
    }

    function showBanner(text, durationMs = 1400) {
      if (!banner) return Promise.resolve();

      showBanner._token = (showBanner._token || 0) + 1;
      const token = showBanner._token;

      banner.textContent = text;
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add("is-on"));

      return new Promise((resolve) => {
        setTimeout(() => {
          if (showBanner._token !== token) return resolve();
          banner.classList.remove("is-on");
          setTimeout(() => {
            if (showBanner._token !== token) return resolve();
            banner.hidden = true;
            resolve();
          }, 140);
        }, durationMs);
      });
    }

    function setLevelUI_() {
      const isL1 = state.level === 1;
      btnLevel1.classList.toggle("is-active", isL1);
      btnLevel2.classList.toggle("is-active", !isL1);
      btnLevel1.setAttribute("aria-selected", isL1 ? "true" : "false");
      btnLevel2.setAttribute("aria-selected", !isL1 ? "true" : "false");
    }

    function setTurnUI_(turn) {
      state.turn = turn; // "child" | "computer" | "lockstep"

      if (turn === "child") {
        elStatus.textContent = "התור שלך";
        elInput.disabled = false;
        btnDone.disabled = false;
        btnDone.hidden = false;
        btnNext.hidden = true;
        elInput.focus();
        return;
      }

      if (turn === "computer") {
        elStatus.textContent = "המחשב חושב…";
        elInput.disabled = true;
        btnDone.disabled = true;
        btnDone.hidden = false; // stays but disabled
        btnNext.hidden = true;
        return;
      }

      // lockstep: waiting for user to press "המשך"
      elStatus.textContent = "לחץ המשך כדי לנעול";
      elInput.disabled = true;
      btnDone.hidden = true;
      btnNext.hidden = false;
    }

    function renderLocked_() {
      elLocked.textContent = state.lockedWord || "";
    }

    function autoGrowInput_() {
      // keep it 1-2 lines comfortably
      elInput.style.height = "auto";
      elInput.style.height = Math.min(elInput.scrollHeight, 92) + "px";
    }

    function clearOpen_() {
      elInput.value = "";
      autoGrowInput_();
    }

    function setOpen_(word) {
      elInput.value = String(word || "");
      autoGrowInput_();
    }

    function resetAll_() {
      hideBanner();

      state = {
        level: 1,
        lockedWord: "",
        turn: "child"
      };

      const start = pickStartWord_();
      state.lockedWord = start || "בראשית"; // fallback safe

      setLevelUI_();
      renderLocked_();
      clearOpen_();
      setTurnUI_("child");
    }

    function setLevel_(lvl) {
      const n = Number(lvl);
      if (n !== 1 && n !== 2) return;
      if (state.level === n) return;

      state.level = n;
      setLevelUI_();

      // On level switch: soft reset to a fresh start word (per your "איפוס" idea)
      const start = pickStartWord_();
      state.lockedWord = start || state.lockedWord || "בראשית";
      renderLocked_();
      clearOpen_();
      setTurnUI_("child");
    }

    async function onDone_() {
      if (state.turn !== "child") return;

      const typed = normalizeWord_(elInput.value);
      const current = normalizeWord_(state.lockedWord);

      // basic checks
      if (!typed) {
        await showBanner("כתוב מילה לפני סיימתי 🙂", 1300);
        return;
      }

      if (!isOneLetterAdded_(current, typed)) {
        await showBanner("צריך להוסיף בדיוק אות אחת למילה הנעולה", 1600);
        return;
      }

      // local word validity (placeholder)
      if (!judgeWord_(typed)) {
        await showBanner("המילה לא נראית תקינה — נסה שוב 🙂", 1600);
        return;
      }

      // accept: keep it in open box, wait for "המשך"
      setOpen_(typed);
      setTurnUI_("lockstep");
    }

    async function onNext_() {
      // lockstep means: lock whatever is in open into locked, then next turn is other side
      const openWord = normalizeWord_(elInput.value);
      if (!openWord) {
        // should not happen, but keep safe
        setTurnUI_("child");
        return;
      }

      // commit lock
      state.lockedWord = openWord;
      renderLocked_();
      clearOpen_();

      // decide whose move is next:
      // after child commits -> computer turn
      // after computer commits -> child turn
      if (state.lastMover === "computer") {
        state.lastMover = "child";
        setTurnUI_("child");
        return;
      }

      // child just committed
      state.lastMover = "child";
      await computerTurn_();
    }

    async function computerTurn_() {
      setTurnUI_("computer");

      const thinkMs = randInt_(1200, 2000);
      await wait(thinkMs);

      const next = computerPickMove_(state.lockedWord);

      if (!next) {
        // no move under placeholder judge
        await showBanner("למחשב אין מהלך כרגע 🤖", 1800);
        setTurnUI_("child");
        return;
      }

      // show computer move in open box (immediate, no typing animation)
      setOpen_(next);
      state.lastMover = "computer";
      setTurnUI_("lockstep");
    }

    // ---------- events ----------
    elInput.addEventListener("input", () => {
      autoGrowInput_();
      // while child is typing, keep buttons state stable (no extra UI)
    });

    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // prevent newline; treat Enter as "סיימתי" in child turn
        e.preventDefault();
        if (state.turn === "child") onDone_();
        if (state.turn === "lockstep") onNext_();
      }
    });

    btnDone.addEventListener("click", () => onDone_());
    btnNext.addEventListener("click", () => onNext_());

    btnReset.addEventListener("click", () => resetAll_());
    btnLevel1.addEventListener("click", () => setLevel_(1));
    btnLevel2.addEventListener("click", () => setLevel_(2));

    // init
    resetAll_();

    return {
      reset: () => resetAll_()
    };
  }

  // ---------- register ----------
  window.ParashaGamesRegister("wordstack", {
    init: async (rootEl, ctx) => initWordstack(rootEl, ctx)
  });
})();
