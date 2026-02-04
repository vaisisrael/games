/* wordstack.js – Parasha "סדר את המילה" game (module)

   NEW GAME (per your latest spec):
   - The child plays alone.
   - For each round, the game picks a random TARGET word from the sheet list (per level),
     scrambles its letters randomly, and shows the scrambled word LOCKED on top.
   - The child types the correct (ordered) word in the editor and clicks "סיימתי".
   - If correct -> +1 point, brief success banner, next word.
   - If incorrect -> brief fail banner, next word.
   - No dictionary, no AI, no computer move, no "ממשיכים", no plus-one validation.

   Data expected from Apps Script:
   ?mode=wordstack&parasha=...
   returns:
   { ok:true, row:{ parasha, level1_chain, level2_chain } }

   Notes:
   - Words are comma-separated in the sheet.
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

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

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

  function pickRandom_(arr) {
    const list = Array.isArray(arr) ? arr : [];
    if (!list.length) return "";
    return list[randInt_(0, list.length - 1)];
  }

  function shuffleString_(s) {
    const a = Array.from(String(s || ""));
    for (let i = a.length - 1; i > 0; i--) {
      const k = randInt_(0, i);
      const t = a[i]; a[i] = a[k]; a[k] = t;
    }
    return a.join("");
  }

  function scrambleNotSame_(word) {
    const w = normalizeWord_(word);
    if (w.length <= 1) return w;

    // Try a few shuffles to avoid returning the same word
    for (let i = 0; i < 8; i++) {
      const s = shuffleString_(w);
      if (s !== w) return s;
    }
    // If it keeps matching (e.g., repeated letters), return last shuffle
    return shuffleString_(w);
  }

  function sanitizeList_(list) {
    // Keep Hebrew-only, length>=2 (you can relax later if you want)
    return (Array.isArray(list) ? list : [])
      .map(normalizeWord_)
      .filter(w => w && w.length >= 2 && isHebrewOnly_(w));
  }

  // ---------- module init ----------
  async function initWordstack(rootEl, ctx) {
    const { CONTROL_API, parashaLabel } = ctx;

    const url = `${CONTROL_API}?mode=wordstack&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.row) {
      rootEl.innerHTML = `<div>לא נמצאו נתונים למשחק “סדר את המילה” לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    // NEW FIELD NAMES (per your request)
    const level1Raw = data.row.level1_chain || "";
    const level2Raw = data.row.level2_chain || "";

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
            <div class="ws-lockedCard" aria-label="המילה המשובשת">
              <div class="ws-lockedTitle">סדר את המילה</div>
              <div class="ws-lockedWord" aria-label="המילה המשובשת"></div>
            </div>

            <div class="ws-openCard" aria-label="משטח עריכה">
              <div class="ws-openTitle">כתוב למטה את המילה הנכונה</div>
              <textarea class="ws-openInput" rows="1" aria-label="כתיבת המילה הנכונה"></textarea>

              <div class="ws-openActions">
                <button type="button" class="ws-btn ws-mainBtn">סיימתי</button>
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

    const elInput = rootEl.querySelector(".ws-openInput");
    const btnMain = rootEl.querySelector(".ws-mainBtn");

    // ---------- state ----------
    let state = null;

    function currentList_() {
      return state.level === 2 ? model.level2List : model.level1List;
    }

    function setLevelUI_() {
      const isL1 = state.level === 1;
      btnLevel1.classList.toggle("is-active", isL1);
      btnLevel2.classList.toggle("is-active", !isL1);
      btnLevel1.setAttribute("aria-selected", isL1 ? "true" : "false");
      btnLevel2.setAttribute("aria-selected", !isL1 ? "true" : "false");
    }

    function updateStatus_() {
      // Simple & clear
      elStatus.textContent = `ניקוד: ${state.score}`;
    }

    function autoGrowInput_() {
      elInput.style.height = "auto";
      elInput.style.height = Math.min(elInput.scrollHeight, 92) + "px";
    }

    function clearInput_() {
      elInput.value = "";
      autoGrowInput_();
    }

    function setInputsEnabled_(enabled) {
      elInput.disabled = !enabled;
      btnMain.disabled = !enabled;
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

    function nextRound_() {
      hideBanner_();

      const list = currentList_();
      const target = normalizeWord_(pickRandom_(list));

      // Fallback if list empty
      state.targetWord = target || "בראשית";
      state.scrambledWord = scrambleNotSame_(state.targetWord);

      elLocked.textContent = state.scrambledWord;

      clearInput_();
      setInputsEnabled_(true);
      updateStatus_();

      // focus for quick play
      elInput.focus();
    }

    async function resetAll_() {
      state = {
        level: 1,
        score: 0,
        targetWord: "",
        scrambledWord: ""
      };

      setLevelUI_();
      updateStatus_();
      nextRound_();
    }

    async function setLevel_(lvl) {
      const n = Number(lvl);
      if (n !== 1 && n !== 2) return;
      if (state.level === n) return;

      state.level = n;
      state.score = 0; // clean start per level
      setLevelUI_();
      updateStatus_();
      nextRound_();
    }

    async function childSubmit_() {
      const typed = normalizeWord_(elInput.value);
      const target = normalizeWord_(state.targetWord);

      if (!typed) {
        await showBannerMessage_("כתוב משהו לפני סיימתי 🙂", 900);
        return;
      }

      // strict equality (simple and smart)
      if (typed === target) {
        state.score += 1;
        updateStatus_();
        setInputsEnabled_(false);
        await showBannerMessage_("כל הכבוד! 🌟", 850);
        nextRound_();
        return;
      }

      // fail: no point, move on
      setInputsEnabled_(false);
      await showBannerMessage_("לא הפעם 🙂 עוברים הלאה", 950);
      nextRound_();
    }

    // ---------- events ----------
    elInput.addEventListener("input", () => autoGrowInput_());

    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!btnMain.disabled) childSubmit_();
      }
    });

    btnMain.addEventListener("click", () => childSubmit_());

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
