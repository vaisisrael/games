/* wordstack.js – Parasha "תיבה ואות" game (module)
   Fixes in this version:
   1) One-letter-add check now treats final letters as equivalent (ן=נ, ך=כ, etc.)
   2) Computer word is NOT locked until user clicks "תורי ▶"
   3) Open title is dynamic: child/computer turn wording
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
    // replace finals anywhere (safe for comparison)
    return Array.from(s).map(ch => FINAL_TO_NORMAL.get(ch) || ch).join("");
  }

  // Placeholder local judge (to be replaced with dictionary+inflection).
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

  // ✅ one-letter add anywhere (start/middle/end) - comparison uses normalized finals
  function isOneLetterAdded_(oldWord, newWord) {
    const a = normalizeForCompare_(oldWord);
    const b = normalizeForCompare_(newWord);

    if (!a || !b) return false;
    if (!isHebrewOnly_(a) || !isHebrewOnly_(b)) return false;
    if (b.length !== a.length + 1) return false;

    let i = 0; // a
    let j = 0; // b
    let skipped = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++; j++;
      } else {
        skipped++;
        if (skipped > 1) return false;
        j++; // skip one inserted char in b
      }
    }

    // must have consumed all of a
    if (i !== a.length) return false;

    // if no skip happened inside, insertion is at the end -> still valid
    return true;
  }

  // Temporary computer move:
  // tries adding ONE letter at start/end (simple placeholder) and accepts first passing judgeWord_.
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
        if (!isOneLetterAdded_(base, cand)) continue;
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

    const model = { level1List, level2List };

    return render(rootEl, model);
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

          <div class="ws-banner" hidden></div>

          <div class="ws-body">
            <div class="ws-lockedCard" aria-label="המילה הנוכחית">
              <div class="ws-lockedTitle">המילה הנוכחית</div>
              <div class="ws-lockedWord" aria-label="המילה הנוכחית"></div>
            </div>

            <div class="ws-openCard" aria-label="אזור כתיבה">
              <div class="ws-openTitle"></div>
              <textarea class="ws-openInput" rows="1" aria-label="כתיבת מילה חדשה"></textarea>

              <div class="ws-openActions">
                <button type="button" class="ws-btn ws-mainBtn">סיימתי</button>
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
    const elOpenTitle = rootEl.querySelector(".ws-openTitle");
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

    function hideBanner_() {
      if (!banner) return;
      banner.hidden = true;
      banner.classList.remove("is-on");
      banner.textContent = "";
    }

    function showBanner_(text, durationMs = 1400) {
      if (!banner) return Promise.resolve();

      showBanner_._token = (showBanner_._token || 0) + 1;
      const token = showBanner_._token;

      banner.textContent = text;
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add("is-on"));

      return new Promise((resolve) => {
        setTimeout(() => {
          if (showBanner_._token !== token) return resolve();
          banner.classList.remove("is-on");
          setTimeout(() => {
            if (showBanner_._token !== token) return resolve();
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

    function renderLocked_() {
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

    function setInput_(word) {
      elInput.value = String(word || "");
      autoGrowInput_();
    }

    function setChildTurn_() {
      state.turn = "child";
      state.pendingComputerWord = null;

      elOpenTitle.textContent = "תורי לכתוב מילה חדשה";
      elInput.disabled = false;

      btnMain.disabled = false;
      btnMain.textContent = "סיימתי";

      elStatus.textContent = "התור שלך — בנה מילה חדשה והוסף אות אחת";
      elInput.focus();
    }

    function setComputerThinking_() {
      state.turn = "computer";

      elOpenTitle.textContent = "תור המחשב לכתוב מילה חדשה";
      elInput.disabled = true;

      btnMain.disabled = true;
      btnMain.textContent = "סיימתי";

      elStatus.textContent = "המחשב חושב…";
    }

    function setAfterComputer_() {
      state.turn = "afterComputer";

      elOpenTitle.textContent = "תור המחשב לכתוב מילה חדשה";
      elInput.disabled = true;

      btnMain.disabled = false;
      btnMain.textContent = "תורי ▶";

      elStatus.textContent = "עכשיו תורך";
    }

    function resetAll_() {
      hideBanner_();

      state = {
        level: 1,
        lockedWord: "",
        pendingComputerWord: null,
        turn: "child"
      };

      const start = pickStartWord_();
      state.lockedWord = start || "בראשית";

      setLevelUI_();
      renderLocked_();
      clearInput_();
      setChildTurn_();
    }

    function setLevel_(lvl) {
      const n = Number(lvl);
      if (n !== 1 && n !== 2) return;
      if (state.level === n) return;

      state.level = n;

      const start = pickStartWord_();
      state.lockedWord = start || state.lockedWord || "בראשית";

      setLevelUI_();
      renderLocked_();
      clearInput_();
      setChildTurn_();
    }

    async function childSubmit_() {
      const typed = normalizeWord_(elInput.value);
      const current = normalizeWord_(state.lockedWord);

      if (!typed) {
        await showBanner_("כתוב מילה לפני סיימתי 🙂", 1200);
        return;
      }

      if (!isOneLetterAdded_(current, typed)) {
        await showBanner_("צריך להוסיף בדיוק אות אחת למילה הנוכחית", 1600);
        return;
      }

      if (!judgeWord_(typed)) {
        await showBanner_("המילה לא נראית תקינה — נסה שוב 🙂", 1600);
        return;
      }

      // ✅ child locks immediately
      state.lockedWord = typed;
      renderLocked_();
      clearInput_();

      await computerTurn_();
    }

    async function computerTurn_() {
      setComputerThinking_();

      const thinkMs = randInt_(1200, 2000);
      await wait(thinkMs);

      const next = computerPickMove_(state.lockedWord);

      if (!next) {
        await showBanner_("למחשב אין מהלך כרגע 🤖", 1600);
        setChildTurn_();
        return;
      }

      // ❗ IMPORTANT: do NOT lock yet
      state.pendingComputerWord = next;

      // show only in open box
      setInput_(next);

      // lock stays unchanged until user clicks "תורי ▶"
      setAfterComputer_();
    }

    // ---------- events ----------
    elInput.addEventListener("input", () => autoGrowInput_());

    elInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (state.turn === "child") childSubmit_();
      }
    });

    btnMain.addEventListener("click", () => {
      if (state.turn === "child") {
        childSubmit_();
        return;
      }

      if (state.turn === "afterComputer") {
        // ✔ now lock computer word
        if (state.pendingComputerWord) {
          state.lockedWord = state.pendingComputerWord;
          state.pendingComputerWord = null;
          renderLocked_();
        }

        // and immediately clear open box
        clearInput_();

        setChildTurn_();
      }
    });

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
