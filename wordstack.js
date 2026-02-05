/* wordstack.js – Parasha "סדר את המילה" game (module)

   SPEC (current):
   - Top shows a SCRAMBLED word (locked look) + tiny hint button 💡 (design only for now)
   - Bottom is an editor where the child types the CORRECT word + tiny green check (✓) to submit
   - Submit:
       correct -> 👍
       wrong   -> 👎
     then move to NEXT word from the level word stack
   - Game ENDS when the level stack is finished (no refilling).
   - Status: 👍 X, 👎 Y, 👣 Z (moves remaining)

   Data expected from Apps Script:
   ?mode=wordstack&parasha=...
   returns:
   { ok:true, row:{ parasha, level1_words, level2_words } }

   Words are comma-separated in the sheet.
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

    // IMPORTANT: existing field names
    const level1Raw = data.row.level1_words || "";
    const level2Raw = data.row.level2_words || "";

    const level1List = sanitizeList_(parseCsvList(level1Raw));
    const level2List = sanitizeList_(parseCsvList(level2Raw));

    return render(rootEl, { level1List, level2List });
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

            <div class="ws-lockedCard" aria-label="המילה שהתבלבלה">
              <div class="ws-lockedTitle ws-titleRow">
                <span>המילה שהתבלבלה</span>
                <button type="button" class="ws-hintBtn" aria-label="רמז" title="רמז (בקרוב)">💡</button>
              </div>
              <div class="ws-lockedWord" aria-label="המילה שהתבלבלה" aria-disabled="true"></div>
            </div>

            <div class="ws-openCard" aria-label="המילה הנכונה">
              <div class="ws-openTitle ws-titleRow">
                <span>המילה הנכונה</span>
                <button type="button" class="ws-checkBtn" aria-label="בדיקה" title="בדיקה">✓</button>
              </div>
              <textarea class="ws-openInput" rows="1" aria-label="כתיבת המילה הנכונה"></textarea>
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
    const elInput = rootEl.querySelector(".ws-openInput");
    const btnCheck = rootEl.querySelector(".ws-checkBtn");

    // ---------- state ----------
    let state = null;

    function listForLevel_(lvl) {
      return (lvl === 2) ? model.level2List : model.level1List;
    }

    function buildStackForLevel_(lvl) {
      const list = listForLevel_(lvl);
      const stack = list.slice();
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
      // 👣 is what remains AFTER the current word was drawn
      elStatus.textContent = `👍 ${state.likes}  👎 ${state.dislikes}  👣 ${state.remaining}`;
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
      // lock UI + friendly message
      setInputsEnabled_(false);
      elLocked.textContent = "";
      clearInput_();
      updateStatus_();
      showBannerMessage_("כל הכבוד! 🎉 סיימת את כל המילים ברמה הזו.", 2200);
    }

    function drawNextTarget_() {
      const lvl = state.level;
      const stack = state.stackByLevel[lvl] || [];

      if (stack.length === 0) return "";

      const target = stack.pop() || "";
      state.remaining = stack.length; // after drawing this word
      return target;
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
        stackByLevel: { 1: [], 2: [] }
      };

      // build stacks ONCE (no refilling)
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

      // reset counters per level (simple & clean)
      state.likes = 0;
      state.dislikes = 0;

      // rebuild ONLY this level stack (start fresh for this level)
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

      // keep the "לא הפעם" message 1s longer (1950ms)
      await showBannerMessage_("לא הפעם 🙂 עוברים הלאה", 1950);
      nextRound_();
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
