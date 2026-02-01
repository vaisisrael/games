/* wordstack.js – Parasha Wordstack game (module)
   Expects Apps Script:
   ?mode=wordstack&parasha=...
   returns:
   { ok:true, row:{ parasha, wordstack_bonus } }

   NOTE: This module includes a lightweight local judge (no external AI).
   Replace judgeWord_() with your AI judge later (without changing UI/CSS contract).
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

  // final letter conversions at END of word only
  const FINAL_MAP = new Map([
    ["כ", "ך"],
    ["מ", "ם"],
    ["נ", "ן"],
    ["פ", "ף"],
    ["צ", "ץ"],
    ["ך", "ך"],
    ["ם", "ם"],
    ["ן", "ן"],
    ["ף", "ף"],
    ["ץ", "ץ"]
  ]);

  function applyFinalIfEnd_(letter, isEnd) {
    const l = String(letter || "");
    if (!isEnd) return l; // only end
    return FINAL_MAP.get(l) || l;
  }

  function stripFinalToNormal_(word) {
    // keep as-is; no reverse mapping required for your rules
    return String(word || "");
  }

  // Basic local judge (placeholder).
  // Returns: "שגויה" | "מאולצת" | "נכונה"
  function judgeWord_(word) {
    const w = normalizeWord_(word);

    // must be Hebrew letters only
    if (!w) return "שגויה";
    if (!/^[\u0590-\u05FF]+$/.test(w)) return "שגויה";

    // very short words are allowed, but treat single letter as forced
    if (w.length === 1) return "מאולצת";

    // treat 2 letters as forced, 3+ as "נכונה"
    if (w.length === 2) return "מאולצת";
    return "נכונה";
  }

  function pointsForCategory_(cat) {
    if (cat === "מאולצת") return 1;
    if (cat === "נכונה") return 2;
    return 0;
  }

  // seeded random (stable-ish)
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

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
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

    const bonusRaw = data.row.wordstack_bonus || "";
    const bonusList = parseCsvList(bonusRaw).map(normalizeWord_);

    const model = {
      parashaLabel,
      bonusList
    };

    return render(rootEl, model);
  }

  function render(rootEl, model) {
    // Build UI (keep same topbar grouping pattern as memory: actions left, stats right)
    rootEl.innerHTML = `
      <div class="ws-wrap">
        <div class="ws-cardbox">
          <div class="ws-topbar">
            <div class="ws-actions">
              <button type="button" class="ws-btn ws-reset">איפוס</button>
            </div>

            <div class="ws-stats" aria-live="polite">
              <span class="ws-turn"></span>
              <span class="ws-score"></span>
            </div>
          </div>

          <div class="ws-banner" hidden></div>

          <div class="ws-body">
            <div class="ws-title">
              <div class="ws-sub">בכל תור מוסיפים אות לתיבה ויוצרים מילה חדשה.</div>
            </div>

            <div class="ws-wordcard">
              <div class="ws-wordline">
                <div class="ws-drop ws-drop-start" data-side="start" aria-label="הנחה בתחילת המילה"></div>
                <div class="ws-word" aria-label="המילה הנוכחית"></div>
                <div class="ws-drop ws-drop-end" data-side="end" aria-label="הנחה בסוף המילה"></div>
              </div>

              <div class="ws-confirmbar" hidden>
                <button type="button" class="ws-btn ws-confirm">סיימתי</button>
                <button type="button" class="ws-btn ws-cancel">תיקון</button>
              </div>
            </div>

            <div class="ws-tray" aria-label="מגש אותיות"></div>
          </div>
        </div>
      </div>
    `.trim();

    const banner = rootEl.querySelector(".ws-banner");
    const elWord = rootEl.querySelector(".ws-word");
    const tray = rootEl.querySelector(".ws-tray");
    const dropStart = rootEl.querySelector(".ws-drop-start");
    const dropEnd = rootEl.querySelector(".ws-drop-end");
    const confirmBar = rootEl.querySelector(".ws-confirmbar");
    const btnConfirm = rootEl.querySelector(".ws-confirm");
    const btnCancel = rootEl.querySelector(".ws-cancel");
    const btnReset = rootEl.querySelector(".ws-reset");

    const elTurn = rootEl.querySelector(".ws-turn");
    const elScore = rootEl.querySelector(".ws-score");

    // state
    let state = null;

    function hideBanner() {
      if (!banner) return;
      banner.hidden = true;
      banner.classList.remove("is-on");
      banner.textContent = "";
    }

    function showBanner(text, durationMs = 1600) {
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

    function setTurnUI_(turn) {
      // turn: "child" | "checking" | "computer" | "idle"
      state.turn = turn;

      const isChild = turn === "child";
      const disabled = !isChild;

      tray.classList.toggle("is-disabled", disabled);
      tray.setAttribute("aria-disabled", disabled ? "true" : "false");

      // disable/enable tray buttons
      Array.from(tray.querySelectorAll(".ws-letter")).forEach(btn => {
        btn.disabled = disabled || state.placed != null;
        btn.setAttribute("aria-disabled", btn.disabled ? "true" : "false");
        btn.setAttribute("draggable", (!btn.disabled).toString());
      });

      dropStart.classList.toggle("is-disabled", disabled);
      dropEnd.classList.toggle("is-disabled", disabled);

      if (turn === "checking") {
        elTurn.textContent = "בודקים…";
        return;
      }
      if (turn === "computer") {
        elTurn.textContent = "הבינה חושבת…";
        return;
      }
      if (turn === "child") {
        elTurn.textContent = "התור שלך";
        return;
      }
      elTurn.textContent = "";
    }

    function updateStats_() {
      elScore.textContent = `ניקוד: 👦 אתה ${state.scoreChild} | 😈 בינה ${state.scoreComputer}`;
    }

    function buildLetters_() {
      // Hebrew letters in "natural" order, including finals in-sequence (end of set)
      const letters = [
        "א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ל","מ","נ","ס","ע","פ","צ","ק","ר","ש","ת",
        "ך","ם","ן","ף","ץ"
      ];
      return letters;
    }

    // computer picks opening letter randomly (regular letters only, no finals)
    function randomOpeningLetter_() {
      const baseLetters = buildLetters_().slice(0, 22); // א..ת
      const n = baseLetters.length;

      if (window.crypto && window.crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        return baseLetters[buf[0] % n];
      }

      return baseLetters[Math.floor(Math.random() * n)];
    }

    function renderTray_() {
      tray.innerHTML = "";
      const letters = buildLetters_();
      letters.forEach((ch) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ws-letter";
        btn.textContent = ch;
        btn.dataset.letter = ch;
        btn.setAttribute("draggable", "true");
        btn.setAttribute("aria-label", `אות ${ch}`);
        tray.appendChild(btn);
      });
    }

    // Green highlight for last-added letter (NOT for opening letter)
    function renderWord_() {
      const w = state.word || "";
      elWord.classList.toggle("is-empty", !w);

      // start small like "one-letter box", then expand as needed
      if (w.length <= 1) {
        elWord.style.width = "3.1em";
        elWord.style.minWidth = "3.1em";
      } else {
        elWord.style.width = "auto";
        elWord.style.minWidth = "0";
      }

      elWord.innerHTML = "";

      for (let i = 0; i < w.length; i++) {
        const span = document.createElement("span");
        span.className = "ws-ch";
        span.textContent = w[i];

        // highlight only if state.lastAddedIndex is set
        if (state.lastAddedIndex === i) {
          span.style.color = "#15803d";       // green
          span.style.fontWeight = "800";
        }

        elWord.appendChild(span);
      }
    }

    function showConfirmBar_(show) {
      confirmBar.hidden = !show;
    }

    function clearPlaced_() {
      state.placed = null;
      state.placedSide = null;
      state.placedNormalizedWord = null;
      showConfirmBar_(false);

      // re-enable tray for current child turn
      Array.from(tray.querySelectorAll(".ws-letter")).forEach(btn => {
        btn.classList.remove("is-picked");
        btn.disabled = state.turn !== "child";
        btn.setAttribute("aria-disabled", btn.disabled ? "true" : "false");
        btn.setAttribute("draggable", (!btn.disabled).toString());
      });

      dropStart.classList.remove("is-hot");
      dropEnd.classList.remove("is-hot");
      dropStart.textContent = "";
      dropEnd.textContent = "";
    }

    function computeDraftWord_(letter, side) {
      const isEnd = side === "end";
      const letterFixed = applyFinalIfEnd_(letter, isEnd);
      const base = stripFinalToNormal_(state.word);

      if (!base) {
        return { word: letterFixed, usedLetter: letterFixed };
      }

      if (side === "start") {
        return { word: letterFixed + base, usedLetter: letterFixed };
      }
      return { word: base + letterFixed, usedLetter: letterFixed };
    }

    function placeLetter_(letter, side) {
      // Only one placement allowed
      if (state.placed != null) return;
      if (state.turn !== "child") return;

      const { word: draft, usedLetter } = computeDraftWord_(letter, side);
      state.placed = usedLetter;
      state.placedSide = side;
      state.placedNormalizedWord = normalizeWord_(draft);

      // mark picked + disable all letters (no multiple drags)
      Array.from(tray.querySelectorAll(".ws-letter")).forEach(btn => {
        const isThis = btn.dataset.letter === letter;
        btn.classList.toggle("is-picked", isThis);
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.setAttribute("draggable", "false");
      });

      // Show in drop zone
      if (side === "start") {
        dropStart.textContent = usedLetter;
        dropEnd.textContent = "";
      } else {
        dropEnd.textContent = usedLetter;
        dropStart.textContent = "";
      }

      dropStart.classList.toggle("is-hot", side === "start");
      dropEnd.classList.toggle("is-hot", side === "end");

      showConfirmBar_(true);
    }

    async function commitChildMove_() {
      if (!state.placedNormalizedWord) return;

      const draft = state.placedNormalizedWord;

      setTurnUI_("checking");

      const cat = judgeWord_(draft);
      const basePts = pointsForCategory_(cat);

      const isBonus = (cat !== "שגויה") && model.bonusList.includes(draft);
      const bonusPts = isBonus ? 5 : 0;

      state.word = draft;

      // highlight last added letter in green (child move)
      state.lastAddedIndex = (state.placedSide === "start") ? 0 : Math.max(0, draft.length - 1);

      state.scoreChild += basePts + bonusPts;

      renderWord_();
      updateStats_();

      if (cat === "שגויה") {
        await showBanner("🙂 מילה שגויה — ממשיכים", 1400);
      } else if (isBonus) {
        await showBanner(`🌟 מילה מהפרשה! (${cat}) +${basePts}+5`, 1700);
      } else {
        await showBanner(`👍 ${cat} +${basePts}`, 1400);
      }

      clearPlaced_();
      await computerTurn_();
    }

    async function computerTurn_() {
      setTurnUI_("computer");
      await wait(400);

      const letters = buildLetters_();

      // random side order (stable-ish per turn)
      const seed = `${model.parashaLabel}|${state.word}|${state.scoreChild}|${state.scoreComputer}|wordstack`;
      const rand = mulberry32(hashStringToUint32(seed));
      const firstSide = rand() < 0.5 ? "start" : "end";
      const secondSide = firstSide === "start" ? "end" : "start";
      const sides = [firstSide, secondSide];

      function tryBuild(side, ltr) {
        const { word } = computeDraftWord_(ltr, side);
        const draft = normalizeWord_(word);
        const cat = judgeWord_(draft);
        return { draft, cat, usedLetter: applyFinalIfEnd_(ltr, side === "end") };
      }

      let chosen = null;

      const lead = state.scoreComputer - state.scoreChild;
      const allowForcedOverCorrect = lead >= 5;

      for (const side of sides) {
        const candidates = [];
        for (const ltr of letters) {
          const r = tryBuild(side, ltr);
          if (r.cat === "שגויה") continue;
          candidates.push({ side, ...r });
        }
        if (candidates.length === 0) continue;

        if (allowForcedOverCorrect) {
          const forced = candidates.find(c => c.cat === "מאולצת");
          const correct = candidates.find(c => c.cat === "נכונה");
          if (forced && correct) {
            chosen = (rand() < 0.5) ? forced : correct;
          } else {
            chosen = candidates[0];
          }
        } else {
          chosen = candidates[0];
        }
        break;
      }

      if (!chosen) {
        await showBanner("🎉 ניצחת! לבינה אין מהלך טוב", 2200);
        setTurnUI_("child");
        return;
      }

      state.word = chosen.draft;

      // highlight last added letter in green (computer move)
      state.lastAddedIndex = (chosen.side === "start") ? 0 : Math.max(0, chosen.draft.length - 1);

      const pts = pointsForCategory_(chosen.cat);
      state.scoreComputer += pts;

      renderWord_();
      updateStats_();

      await showBanner(`😈 הבינה הוסיפה: ${chosen.usedLetter} (${chosen.cat}) +${pts}`, 1500);

      setTurnUI_("child");
    }

    async function computerOpening_() {
      // computer chooses the opening letter randomly (no scoring, no green highlight)
      setTurnUI_("computer");
      await wait(120);

      state.word = randomOpeningLetter_();
      state.lastAddedIndex = null; // IMPORTANT: no green on opening

      renderWord_();
      updateStats_();

      setTurnUI_("child");
    }

    function resetAll_() {
      hideBanner();

      state = {
        word: "",
        placed: null,
        placedSide: null,
        placedNormalizedWord: null,
        scoreChild: 0,
        scoreComputer: 0,
        turn: "computer",
        lastAddedIndex: null
      };

      renderTray_();
      clearPlaced_();
      renderWord_();
      updateStats_();

      // no "computer chose opening" message
      computerOpening_();

      // gentle hint (no mention of computer choosing)
      showBanner("בחר/י אות והנח/י בתחילת המילה או בסופה", 1500);
    }

    // ---------- drag/drop ----------
    function wireDnD_() {
      tray.addEventListener("dragstart", (ev) => {
        const btn = ev.target.closest(".ws-letter");
        if (!btn) return;
        if (btn.disabled) {
          ev.preventDefault();
          return;
        }
        ev.dataTransfer.setData("text/plain", btn.dataset.letter || "");
        ev.dataTransfer.effectAllowed = "copy";
      });

      function onDragOverDrop(ev) {
        if (state.turn !== "child") return;
        if (state.placed != null) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
      }

      function onDrop(ev) {
        if (state.turn !== "child") return;
        if (state.placed != null) return;
        ev.preventDefault();
        const letter = String(ev.dataTransfer.getData("text/plain") || "").trim();
        if (!letter) return;

        const side = ev.currentTarget?.dataset?.side || "";
        if (side !== "start" && side !== "end") return;

        placeLetter_(letter, side);
      }

      dropStart.addEventListener("dragover", onDragOverDrop);
      dropEnd.addEventListener("dragover", onDragOverDrop);
      dropStart.addEventListener("drop", onDrop);
      dropEnd.addEventListener("drop", onDrop);

      // click-to-place (mobile fallback)
      let picked = null;
      tray.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".ws-letter");
        if (!btn) return;
        if (btn.disabled) return;
        if (state.turn !== "child") return;
        if (state.placed != null) return;

        picked = btn.dataset.letter || "";
        Array.from(tray.querySelectorAll(".ws-letter")).forEach(b => b.classList.toggle("is-picked", b === btn));
      });

      function clickDrop(side) {
        if (state.turn !== "child") return;
        if (state.placed != null) return;
        if (!picked) return;
        placeLetter_(picked, side);
        picked = null;
      }

      dropStart.addEventListener("click", () => clickDrop("start"));
      dropEnd.addEventListener("click", () => clickDrop("end"));
    }

    // ---------- events ----------
    btnCancel.addEventListener("click", () => {
      clearPlaced_();
    });

    btnConfirm.addEventListener("click", () => {
      commitChildMove_();
    });

    btnReset.addEventListener("click", () => resetAll_());

    // init
    resetAll_();
    wireDnD_();

    // controller API (games.js calls reset() on accordion close)
    return {
      reset: () => resetAll_()
    };
  }

  // ---------- register ----------
  window.ParashaGamesRegister("wordstack", {
    init: async (rootEl, ctx) => initWordstack(rootEl, ctx)
  });
})();
