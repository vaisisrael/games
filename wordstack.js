/* wordstack.js – Parasha "תיבה ואות" game (module)
   Current behavior (per your spec):
   - Locked title: first = "מילת הפתיחה", thereafter = "המילה הנוכחית"
   - Open box is ONLY for the child, with fixed instruction text
   - Child clicks "סיימתי": if valid -> locks immediately + banner "כל הכבוד"
   - Computer does NOT write into open box; computer word appears in yellow banner + small button "ממשיכים"
   - Clicking "ממשיכים" locks computer word and enables child input
   - Validation rule (no dictionary yet): ALL letters from locked word are used + exactly ONE extra letter (order doesn't matter)
     + final letters normalized for comparison (ך=כ, ם=מ, ן=נ, ף=פ, ץ=צ)
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
      .replace(/\s+/g, "");
  }

  function isHebrewOnly_(w) {
    return /^[\u0590-\u05FF]+$/.test(w);
  }

  // map final letters to normal for comparison only
  const FINAL_TO_NORMAL = new Map([
    ["ך","כ"], ["ם","מ"], ["ן","נ"], ["ף","פ"], ["ץ","צ"]
  ]);

  function normalizeForCompare_(w) {
    const s = normalizeWord_(w);
    return Array.from(s).map(ch => FINAL_TO_NORMAL.get(ch) || ch).join("");
  }

  // Placeholder local judge (dictionary will come later)
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

  // ✅ Validation: use ALL letters from oldWord + exactly ONE extra letter (order free)
  function isAllLettersPlusOne_(oldWord, newWord) {
    const aRaw = normalizeForCompare_(oldWord);
    const bRaw = normalizeForCompare_(newWord);

    if (!aRaw || !bRaw) return false;
    if (!isHebrewOnly_(aRaw) || !isHebrewOnly_(bRaw)) return false;

    if (bRaw.length !== aRaw.length + 1) return false;

    const counts = new Map();
    for (const ch of Array.from(aRaw)) {
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }

    let extra = 0;
    for (const ch of Array.from(bRaw)) {
      const c = counts.get(ch) || 0;
      if (c > 0) {
        counts.set(ch, c - 1);
      } else {
        extra++;
        if (extra > 1) return false;
      }
    }

    if (extra !== 1) return false;

    // ensure ALL old letters were used (no leftovers)
    for (const v of counts.values()) {
      if (v !== 0) return false;
    }

    return true;
  }

  // Temporary computer move:
  // tries adding ONE letter at start/end (order-free validation will accept anagrams anyway)
  function computerPickMove_(current) {
    const base = normalizeWord_(current);
    if (!base) return "";

    const letters = [
      "א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ל","מ","נ","ס","ע","פ","צ","ק","ר","ש","ת",
      "ך","ם","ן","ף","ץ"
    ];

    // shuffle attempts
    const tryOrder = letters.slice();
    for (let i = tryOrder.length - 1; i > 0; i--) {
      const k = randInt_(0, i);
      const t = tryOrder[i]; tryOrder[i] = tryOrder[k]; tryOrder[k] = t;
    }

    const preferSide = (randInt_(0, 1) === 0) ? "start" : "end";

    for (let pass = 0; pass < 2; pass++) {
      const side = (pass === 0) ? preferSide : (preferSide === "start" ? "end" : "start");
      for (const ch of tryOrder) {
        const cand = (side === "start") ? (ch + base) : (base + ch);

        // structural rule (all letters + one extra)
        if (!isAllLettersPlusOne_(base, cand)) continue;

        // dictionary placeholder
        if (!judgeWord_(cand)) continue;

        return cand;
      }
    }
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
              <button type="button" class="ws-banner-btn" hidden>ממשיכים</button>
            </div>
          </div>

          <div class="ws-body">
            <div class="ws-lockedCard" aria-label="המילה הנעולה">
              <div class="ws-lockedTitle"></div>
              <div class="ws-lockedWord" aria-label="המילה הנעולה"></div>
            </div>

            <div class="ws-openCard" aria-label="אזור כתיבה">
              <div class="ws-openTitle">כאן כותבים מילה חדשה מאותן אותיות בתוספת אות אחת</div>
              <textarea class="ws-openInput" rows="1" aria-label="כתיבת מילה חדשה"></textarea>

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
    const bannerBtn = rootEl.querySelector(".ws-banner-btn");

    const btnReset = rootEl.querySelector(".ws-reset");
    const btnLevel1 = rootEl.querySelector(".ws-level-1");
    const btnLevel2 = rootEl.querySelector(".ws-level-2");

    const elLockedTitle = rootEl.querySelector(".ws-lockedTitle");
    const elLocked = rootEl.querySelector(".ws-lockedWord");

    const elInput = rootEl.querySelector(".ws-openInput");
    const btnMain = rootEl.querySelector(".ws-mainBtn");

    // ---------- state ----------
    let state = null;

    function currentList_() {
      return state.level === 2 ? model.level2List : model.level1List;
    }

    function pickStartWord_() {
      const w = pickRandom_(currentList_());
      return normalizeWord_(w) || "";
    }

    function setLockedTitle_() {
      elLockedTitle.textContent = state.isFirstLock ? "מילת הפתיחה" : "המילה הנוכחית";
    }

    function renderLocked_() {
      setLockedTitle_();
      elLocked.textContent = state.lockedWord || "";
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

    function clearStatus_() {
      // per request: no explanatory text here
      elStatus.textContent = "";
    }

    function hideBanner_() {
      if (!banner) return;
      banner.hidden = true;
      banner.classList.remove("is-on");
      bannerText.textContent = "";
      bannerBtn.hidden = true;
    }

    function showBannerMessage_(text, durationMs = 1400) {
      if (!banner) return Promise.resolve();

      showBannerMessage_._token = (showBannerMessage_._token || 0) + 1;
      const token = showBannerMessage_._token;

      bannerBtn.hidden = true;
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

    function showBannerComputerWord_(word) {
      // persistent until user clicks "ממשיכים"
      bannerText.textContent = `המחשב כתב: ${word}`;
      bannerBtn.hidden = false;
      bannerBtn.textContent = "ממשיכים";
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add("is-on"));
    }

    function setLevelUI_() {
      const isL1 = state.level === 1;
      btnLevel1.classList.toggle("is-active", isL1);
      btnLevel2.classList.toggle("is-active", !isL1);
      btnLevel1.setAttribute("aria-selected", isL1 ? "true" : "false");
      btnLevel2.setAttribute("aria-selected", !isL1 ? "true" : "false");
    }

    function setChildTurn_() {
      state.turn = "child";
      state.pendingComputerWord = null;

      clearStatus_();
      hideBanner_();
      clearInput_();

      setInputsEnabled_(true);
      elInput.focus();
    }

    function setComputerThinking_() {
      state.turn = "computer";
      clearStatus_();
      setInputsEnabled_(false);

      // brief thinking message, then replaced by the word+button
      showBannerMessage_("המחשב חושב…", 1200);
    }

    function setAfterComputer_() {
      state.turn = "afterComputer";
      clearStatus_();
      setInputsEnabled_(false);
    }

    function resetAll_() {
      hideBanner_();
      clearStatus_();

      state = {
        level: 1,
        lockedWord: "",
        pendingComputerWord: null,
        turn: "child",
        isFirstLock: true
      };

      const start = pickStartWord_();
      state.lockedWord = start || "בראשית";

      setLevelUI_();
      renderLocked_();
      setChildTurn_();
    }

    function setLevel_(lvl) {
      const n = Number(lvl);
      if (n !== 1 && n !== 2) return;
      if (state.level === n) return;

      state.level = n;
      const start = pickStartWord_();

      state.lockedWord = start || state.lockedWord || "בראשית";
      state.isFirstLock = true;

      setLevelUI_();
      renderLocked_();
      setChildTurn_();
    }

    async function childSubmit_() {
      const typed = normalizeWord_(elInput.value);
      const current = normalizeWord_(state.lockedWord);

      if (!typed) {
        await showBannerMessage_("כתוב מילה לפני סיימתי 🙂", 1200);
        return;
      }

      if (!isAllLettersPlusOne_(current, typed)) {
        await showBannerMessage_("צריך לנצל את כל האותיות ולהוסיף אות אחת", 1700);
        return;
      }

      if (!judgeWord_(typed)) {
        await showBannerMessage_("המילה לא נראית תקינה — נסה שוב 🙂", 1600);
        return;
      }

      // child locks immediately
      state.lockedWord = typed;
      state.isFirstLock = false;
      renderLocked_();

      // banner praise (then computer turn)
      await showBannerMessage_("כל הכבוד! 🌟", 1100);

      await computerTurn_();
    }

    async function computerTurn_() {
      setComputerThinking_();

      const thinkMs = randInt_(1200, 2000);
      await wait(thinkMs);

      const next = computerPickMove_(state.lockedWord);

      if (!next) {
        await showBannerMessage_("למחשב אין מהלך כרגע 🤖", 1600);
        setChildTurn_();
        return;
      }

      state.pendingComputerWord = next;

      // open box belongs to child only
      clearInput_();

      // show computer word in banner + "ממשיכים"
      showBannerComputerWord_(next);

      setAfterComputer_();
    }

    function acceptComputerWord_() {
      if (state.turn !== "afterComputer") return;
      if (!state.pendingComputerWord) return;

      state.lockedWord = state.pendingComputerWord;
      state.pendingComputerWord = null;
      state.isFirstLock = false;

      renderLocked_();

      // enable child
      hideBanner_();
      setChildTurn_();
    }

    // ---------- events ----------
    elInput.addEventListener("input", () => autoGrowInput_());

    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!btnMain.disabled) childSubmit_();
      }
    });

    btnMain.addEventListener("click", () => {
      if (state.turn === "child") childSubmit_();
    });

    bannerBtn.addEventListener("click", () => acceptComputerWord_());

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
