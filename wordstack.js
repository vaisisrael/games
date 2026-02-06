/* wordstack.js – Parasha "סדר את המילה" game (module)

   SPEC (current):
   - Top shows a SCRAMBLED word (locked look) + tiny hint button 💡 (now functional)
   - Bottom is an editor where the child types the CORRECT word + tiny green check (✓) to submit
   - Submit:
       correct -> 👍
       wrong   -> 👎
     then move to NEXT word from the level word stack
   - Game ENDS when the level stack is finished (no refilling).
   - Status: 👍 X | 👎 Y | 👣 Z (moves remaining)

   Data expected from Apps Script:
   ?mode=wordstack&parasha=...
   returns:
   {
     ok:true,
     row:{
       parasha,
       level1_words, level2_words,
       level1_hint,  level2_hint
     }
   }

   Words are comma-separated in the sheet.
   Hints are comma-separated emojis aligned by index to the words list.
   If a word has no emoji hint, sheet should contain "?" for that position.
*/

(() => {
  "use strict";

  // ---------- parsing / sanitize ----------
  function parseCsvList(s) {
    return String(s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function sanitizeWord_(w) {
    let s = String(w || "").trim();

    // remove nikud & cantillation
    s = s.replace(/[\u0591-\u05C7]/g, "");

    // remove spaces inside
    s = s.replace(/\s+/g, "");

    // remove common punctuation / quotes / maqaf etc.
    s = s.replace(/["'״׳\-–—־.,;:!?()\[\]{}<>/\\|`~@#$%^&*_+=]/g, "");

    return s;
  }

  function isHebrewOnly_(w) {
    return /^[\u0590-\u05FF]+$/.test(w);
  }

  function sanitizeList_(list) {
    return (Array.isArray(list) ? list : [])
      .map(sanitizeWord_)
      .filter(w => w && w.length >= 2 && isHebrewOnly_(w));
  }

  // ---------- hints ----------
  function sanitizeHint_(h) {
    const s = String(h || "").trim();
    if (!s || s === "?") return "?";
    return s; // allow emoji (or any short symbol) as-is
  }

  function buildHintsAlignedToWords_(rawHints, wordsList) {
    const hints = parseCsvList(rawHints || "").map(sanitizeHint_);
    const out = new Array(wordsList.length);

    for (let i = 0; i < wordsList.length; i++) {
      out[i] = (i < hints.length) ? sanitizeHint_(hints[i]) : "?";
    }
    return out;
  }

  // ---------- randomness ----------
  function randInt_(min, max) {
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

  function shuffleArrayInPlace_(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const k = randInt_(0, i);
      const t = arr[i]; arr[i] = arr[k]; arr[k] = t;
    }
    return arr;
  }

  function shuffleString_(s) {
    const a = Array.from(String(s || ""));
    shuffleArrayInPlace_(a);
    return a.join("");
  }

  function scrambleNotSame_(word) {
    const w = String(word || "");
    if (w.length <= 1) return w;

    for (let i = 0; i < 10; i++) {
      const s = shuffleString_(w);
      if (s !== w) return s;
    }
    return shuffleString_(w);
  }

  // ---------- module init ----------
  async function initWordstack(rootEl, ctx) {
    const { CONTROL_API, parashaLabel } = ctx;

    const url = `${CONTROL_API}?mode=wordstack&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.row) {
      rootEl.innerHTML = `<div>לא נמצאו נתונים למשחק הזה בפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const level1Raw = data.row.level1_words || "";
    const level2Raw = data.row.level2_words || "";

    // NEW: hint fields (renamed in sheet)
    const level1HintRaw = data.row.level1_hint || "";
    const level2HintRaw = data.row.level2_hint || "";

    const level1List = sanitizeList_(parseCsvList(level1Raw));
    const level2List = sanitizeList_(parseCsvList(level2Raw));

    const level1Hints = buildHintsAlignedToWords_(level1HintRaw, level1List);
    const level2Hints = buildHintsAlignedToWords_(level2HintRaw, level2List);

    return render(rootEl, { level1List, level2List, level1Hints, level2Hints });
  }

  function render(rootEl, model) {
    rootEl.innerHTML = `
      <div class="ws-wrap">
        <div class="ws-cardbox">

          <div class="ws-topbar">
            <div class="ws-actions">
              <div class="ws-levels" role="tablist" aria-label="בחירת רמה">
                <button type="button" class="ws-btn ws-level ws-level-1 is-active" role="tab" aria-selected="true">רמה 1</button>
                <button type="button" class="ws-btn ws-level ws-level-2" role="tab" aria-selected="false">רמה 2</button>
              </div>
              <button type="button" class="ws-btn ws-reset">איפוס</button>
            </div>

            <div class="ws-status" aria-live="polite"></div>
          </div>

          <div class="ws-banner" hidden>
            <div class="ws-banner-row">
              <span class="ws-banner-text"></span>
            </div>
          </div>

          <div class="ws-body">

            <div class="ws-lockedCard" aria-label="המילה מהפרשה - שהתבלבלה">
              <div class="ws-lockedTitle">המילה מהפרשה - שהתבלבלה</div>

              <div class="ws-fieldWrap ws-fieldWrap-locked">
                <div class="ws-lockedWord" aria-label="המילה מהפרשה - שהתבלבלה" aria-disabled="true"></div>
                <button type="button" class="ws-hintBtn ws-inboxBtn" aria-label="רמז" title="רמז">💡</button>
              </div>
            </div>

            <div class="ws-openCard" aria-label="המילה הנכונה">
              <div class="ws-openTitle">המילה הנכונה</div>

              <div class="ws-fieldWrap ws-fieldWrap-open">
                <textarea class="ws-openInput" rows="1" aria-label="כתיבת המילה הנכונה"></textarea>
                <button type="button" class="ws-checkBtn ws-inboxBtn" aria-label="בדיקה" title="בדיקה">✓</button>
              </div>
            </div>

          </div>

        </div>
      </div>
    `.trim();

    const elStatus = rootEl.querySelector(".ws-status");
    const banner = rootEl.querySelector(".ws-banner");
    const bannerText = rootEl.querySelector(".ws-banner-text");

    const btnReset = rootEl.querySelector(".ws-reset");
    const btnLevel1 = rootEl.querySelector(".ws-level-1");
    const btnLevel2 = rootEl.querySelector(".ws-level-2");

    const elLocked = rootEl.querySelector(".ws-lockedWord");
    const btnHint = rootEl.querySelector(".ws-hintBtn");

    const elInput = rootEl.querySelector(".ws-openInput");
    const btnCheck = rootEl.querySelector(".ws-checkBtn");

    // ---------- state ----------
    let state = null;

    function listForLevel_(lvl) {
      return (lvl === 2) ? model.level2List : model.level1List;
    }

    function hintsForLevel_(lvl) {
      return (lvl === 2) ? model.level2Hints : model.level1Hints;
    }

    function buildStackForLevel_(lvl) {
      const list = listForLevel_(lvl);
      const stack = list.slice(); // words only (shuffled)
      shuffleArrayInPlace_(stack);
      return stack;
    }

    function setLevelUI_() {
      const isL1 = state.level === 1;
      btnLevel1.classList.toggle("is-active", isL1);
      btnLevel2.classList.toggle("is-active", !isL1);
      btnLevel1.setAttribute("aria-selected", isL1 ? "true" : "false");
      btnLevel2.setAttribute("aria-selected", !isL1 ? "true" : "false");
    }

    function updateStatus_() {
      elStatus.textContent = `👍 ${state.likes} | 👎 ${state.dislikes} | 👣 ${state.remaining}`;
    }

    function autoGrowInput_() {
      elInput.style.height = "auto";
      elInput.style.height = Math.min(elInput.scrollHeight, 56) + "px";
    }

    function clearInput_() {
      elInput.value = "";
      autoGrowInput_();
    }

    function setInputsEnabled_(enabled) {
      elInput.disabled = !enabled;
      btnCheck.disabled = !enabled;
    }

    function hideBanner_() {
      banner.hidden = true;
      banner.classList.remove("is-on");
      bannerText.textContent = "";
    }

    function showBannerMessage_(text, durationMs = 900) {
      showBannerMessage_._token = (showBannerMessage_._token || 0) + 1;
      const token = showBannerMessage_._token;

      bannerText.textContent = text;
      banner.hidden = false;

      requestAnimationFrame(() => banner.classList.add("is-on"));

      return new Promise((resolve) => {
        setTimeout(() => {
          if (showBannerMessage_._token !== token) return resolve();
          banner.classList.remove("is-on");
          setTimeout(() => {
            if (showBannerMessage_._token !== token) return resolve();
            banner.hidden = true;
            resolve();
          }, 140);
        }, durationMs);
      });
    }

    function endGame_() {
      setInputsEnabled_(false);
      elLocked.textContent = "";
      clearInput_();
      updateStatus_();
      btnHint.hidden = true;
      showBannerMessage_("כל הכבוד! 🎉 סיימת את כל המילים ברמה הזו.", 2200);
    }

    function drawNextTarget_() {
      const lvl = state.level;
      const stack = state.stackByLevel[lvl] || [];

      if (stack.length === 0) return "";

      const target = stack.pop() || "";
      state.remaining = stack.length;
      return target;
    }

    function applyHintForCurrentTarget_() {
      const lvl = state.level;
      const hints = hintsForLevel_(lvl);
      const list = listForLevel_(lvl);

      const idx = list.indexOf(state.targetWord);
      const hint = (idx >= 0 && idx < hints.length) ? sanitizeHint_(hints[idx]) : "?";

      state.currentHint = hint;

      // bulb appears only if there is an emoji (not "?")
      btnHint.hidden = (hint === "?" || !hint);
    }

    function nextRound_() {
      hideBanner_();

      const target = drawNextTarget_();
      if (!target) {
        endGame_();
        return;
      }

      state.targetWord = target;
      state.scrambledWord = scrambleNotSame_(state.targetWord);

      elLocked.textContent = state.scrambledWord;

      applyHintForCurrentTarget_();

      clearInput_();
      setInputsEnabled_(true);
      updateStatus_();
      elInput.focus();
    }

    async function resetAll_() {
      state = {
        level: 1,
        likes: 0,
        dislikes: 0,
        remaining: 0,
        targetWord: "",
        scrambledWord: "",
        currentHint: "?",
        stackByLevel: { 1: [], 2: [] }
      };

      state.stackByLevel[1] = buildStackForLevel_(1);
      state.stackByLevel[2] = buildStackForLevel_(2);

      setLevelUI_();
      nextRound_();
    }

    async function setLevel_(lvl) {
      const n = Number(lvl);
      if (n !== 1 && n !== 2) return;
      if (state.level === n) return;

      state.level = n;
      state.likes = 0;
      state.dislikes = 0;
      state.stackByLevel[n] = buildStackForLevel_(n);

      setLevelUI_();
      nextRound_();
    }

    async function childSubmit_() {
      const typed = sanitizeWord_(elInput.value);
      const target = sanitizeWord_(state.targetWord);

      if (!typed) {
        await showBannerMessage_("כתוב משהו לפני הבדיקה 🙂", 900);
        return;
      }

      if (typed === target) {
        state.likes += 1;
        setInputsEnabled_(false);
        updateStatus_();
        await showBannerMessage_("כל הכבוד! 🌟", 850);
        nextRound_();
        return;
      }

      state.dislikes += 1;
      setInputsEnabled_(false);
      updateStatus_();

      await showBannerMessage_("לא הפעם 🙂 עוברים הלאה", 1950);
      nextRound_();
    }

    async function showHint_() {
      const h = sanitizeHint_(state.currentHint);
      if (!h || h === "?") return; // button should be hidden anyway
      await showBannerMessage_(`רמז: ${h}`, 2000);
    }

    // ---------- events ----------
    elInput.addEventListener("input", () => autoGrowInput_());

    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!btnCheck.disabled) childSubmit_();
      }
    });

    btnCheck.addEventListener("click", () => childSubmit_());

    btnHint.addEventListener("click", () => showHint_());

    btnReset.addEventListener("click", () => resetAll_());
    btnLevel1.addEventListener("click", () => setLevel_(1));
    btnLevel2.addEventListener("click", () => setLevel_(2));

    // init
    resetAll_();

    return { reset: () => resetAll_() };
  }

  // ---------- register (safe) ----------
  (function registerWhenReady_() {
    if (window.ParashaGamesRegister) {
      window.ParashaGamesRegister("wordstack", {
        init: async (rootEl, ctx) => initWordstack(rootEl, ctx)
      });
      return;
    }
    setTimeout(registerWhenReady_, 30);
  })();
})();
