/* wordstack.js – Parasha "תיבה ואות" game (module)
   Expects Apps Script:
   ?mode=wordstack&parasha=...
   returns:
   { ok:true, row:{ parasha, level1_words, level2_words } }

   NO AI. NO UrlFetch. Local validation placeholder.
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

  // ✅ מאפשר הוספת אות אחת בכל מקום (התחלה/אמצע/סוף)
  function isOneLetterAdded_(oldWord, newWord) {
    const a = normalizeWord_(oldWord);
    const b = normalizeWord_(newWord);

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
        j++; // skip one char in b (the inserted letter)
      }
    }

    // If a not fully consumed, b ended too early => invalid
    if (i !== a.length) return false;

    // If no skip happened inside, the extra char is at the end => valid
    return true;
  }

  // Temporary computer move:
  // tries inserting ONE letter at start or end (simple placeholder).
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

    const model = {
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

            <div class="ws-openCard" aria-label="כאן כותבים מילה חדשה">
              <div class="ws-openTitle">כאן כותבים מילה חדשה</div>
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
      elInput.disabled = false;
      btnMain.disabled = false;
      btnMain.textContent = "סיימתי";
      elStatus.textContent = "התור שלך — בנה מילה חדשה והוסף אות אחת";
      elInput.focus();
    }

    function setComputerThinking_() {
      state.turn = "computer";
      elInput.disabled = true;
      btnMain.disabled = true;
      btnMain.textContent = "סיימתי";
      elStatus.textContent = "המחשב חושב…";
    }

    function setAfterComputer_() {
      state.turn = "afterComputer";
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

      // ✅ ברגע שלחץ "סיימתי" והכל תקין — נועל מיד ומתחיל תור מחשב
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

      // מציג את המילה של המחשב בתיבה הפתוחה (מייד)
      setInput_(next);

      // המילה הנוכחית מתעדכנת (כי כבר זה ה"מצב" החדש)
      state.lockedWord = next;
      renderLocked_();

      // כפתור הופך ל"תורי ▶"
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
        clearInput_();
        setChildTurn_();
        return;
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
