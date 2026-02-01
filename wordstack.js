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
  // Returns: "תקין" | "לא תקין"
  function judgeWord_(word) {
    const w = normalizeWord_(word);

    if (!w) return "לא תקין";
    if (!/^[\u0590-\u05FF]+$/.test(w)) return "לא תקין";
    if (w.length < 2) return "לא תקין";

    return "תקין";
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
            <div class="ws-wordcard">
              <div class="ws-wordline">
                <div class="ws-drop ws-drop-start" data-side="start" aria-label="הנחה בתחילת המילה"></div>
                <div class="ws-word" aria-label="המילה הנוכחית"></div>
                <div class="ws-drop ws-drop-end" data-side="end" aria-label="הנחה בסוף המילה"></div>
              </div>

              <div class="ws-confirmbar" hidden>
                <button type="button" class="ws-btn ws-confirm">✔ סיימתי</button>
                <button type="button" class="ws-btn ws-cancel">↩ ביטול</button>
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

    const CHILD_HINT_TEXT =
      "גוררים אות צהובה, מניחים ליד המילה הירוקה ולוחצים סיימתי";

    function ensureAnimStyle_() {
      if (document.getElementById("ws-wordstack-anim-style")) return;
      const style = document.createElement("style");
      style.id = "ws-wordstack-anim-style";
      style.textContent = `
        [data-parasha-games] .ws-word .ws-anim-letter{
          display:inline-block;
          transform-origin: 50% 80%;
          animation: wsWordstackBounce .55s ease-out;
        }
        @keyframes wsWordstackBounce{
          0%   { transform: translateY(0) scale(1); }
          35%  { transform: translateY(-7px) scale(1.18); }
          70%  { transform: translateY(0) scale(1.03); }
          100% { transform: translateY(0) scale(1); }
        }
      `.trim();
      document.head.appendChild(style);
    }

    function hideBanner() {
      if (!banner) return;
      banner.hidden = true;
      banner.classList.remove("is-on");
      banner.textContent = "";
    }

    function showChildHint_() {
      if (!banner) return;
      banner.textContent = CHILD_HINT_TEXT;
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add("is-on"));
      state.bannerMode = "hint";
    }

    function showBanner(text, durationMs = 1600) {
      if (!banner) return Promise.resolve();

      showBanner._token = (showBanner._token || 0) + 1;
      const token = showBanner._token;

      state.bannerMode = "msg";
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
        elTurn.textContent = "המחשב חושב… 🤖";
        return;
      }
      if (turn === "child") {
        elTurn.textContent = "התור שלך";
        showChildHint_();
        return;
      }
      elTurn.textContent = "";
    }

    function updateStats_() {
      elScore.textContent = `ניקוד: 🧒 ${state.scoreChild} | 🤖 ${state.scoreComputer}`;
    }

    function buildLetters_() {
      const letters = [
        "א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ל","מ","נ","ס","ע","פ","צ","ק","ר","ש","ת",
        "ך","ם","ן","ף","ץ"
      ];
      return letters;
    }

    function randomStartLetter_() {
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

    function setWordHTML_(word, animSide, animLetter) {
      const w = String(word || "");
      if (!animSide || !animLetter || !w) {
        elWord.textContent = w;
        return;
      }

      const first = w.slice(0, 1);
      const restFrom1 = w.slice(1);
      const last = w.slice(-1);
      const restToLast = w.slice(0, -1);

      if (animSide === "start" && first === animLetter) {
        elWord.innerHTML =
          `<span class="ws-anim-letter">${first}</span>${restFrom1}`;
        return;
      }

      if (animSide === "end" && last === animLetter) {
        elWord.innerHTML =
          `${restToLast}<span class="ws-anim-letter">${last}</span>`;
        return;
      }

      // fallback: no span if mismatch
      elWord.textContent = w;
    }

    function renderWord_() {
      elWord.classList.toggle("is-empty", !state.word);

      // keep attrs (CSS highlight badge removed in your CSS)
      elWord.classList.toggle("has-highlight", !!state.highlight);
      elWord.dataset.hl = state.highlight ? state.highlight.letter : "";
      elWord.dataset.hlby = state.highlight ? state.highlight.by : "";

      // computer animation (bounce the newly added letter)
      if (state.computerAnim && state.computerAnim.word === state.word) {
        ensureAnimStyle_();
        setWordHTML_(state.word, state.computerAnim.side, state.computerAnim.letter);

        const animEl = elWord.querySelector(".ws-anim-letter");
        if (animEl) {
          animEl.addEventListener(
            "animationend",
            () => {
              // clear anim flag + normalize to plain text
              state.computerAnim = null;
              elWord.textContent = state.word || "";
            },
            { once: true }
          );
        } else {
          // if span not created, just clear flag
          state.computerAnim = null;
          elWord.textContent = state.word || "";
        }
        return;
      }

      elWord.textContent = state.word || "";
    }

    function showConfirmBar_(show) {
      confirmBar.hidden = !show;
    }

    function clearPlaced_() {
      state.placed = null;
      state.placedSide = null;
      state.placedNormalizedWord = null;
      showConfirmBar_(false);

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
      if (state.placed != null) return;
      if (state.turn !== "child") return;

      const { word: draft, usedLetter } = computeDraftWord_(letter, side);
      state.placed = usedLetter;
      state.placedSide = side;
      state.placedNormalizedWord = normalizeWord_(draft);

      Array.from(tray.querySelectorAll(".ws-letter")).forEach(btn => {
        const isThis = btn.dataset.letter === letter;
        btn.classList.toggle("is-picked", isThis);
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.setAttribute("draggable", "false");
      });

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

      const verdict = judgeWord_(draft);
      const isValid = verdict === "תקין";

      // scoring:
      // - valid word: +1
      // - bonus word: total should be +2 => add +1 extra
      const isBonus = isValid && model.bonusList.includes(draft);
      const basePts = isValid ? 1 : 0;
      const bonusPts = isBonus ? 1 : 0;

      state.word = draft;
      state.highlight = { letter: state.placed, by: "child" };

      state.scoreChild += basePts + bonusPts;

      renderWord_();
      updateStats_();

      if (!isValid) {
        await showBanner("🙂 מילה לא תקינה — ממשיכים לשחק", 1500);
      } else {
        // success feedback (always), then ONLY AFTER that -> computer turn
        await showBanner("כל הכבוד! 🌟", 2600);
      }

      clearPlaced_();

      await computerTurn_();
    }

    async function computerTurn_() {
      setTurnUI_("computer");
      await wait(400);

      const letters = buildLetters_();

      const seed = `${model.parashaLabel}|${state.word}|${state.scoreChild}|${state.scoreComputer}|wordstack`;
      const rand = mulberry32(hashStringToUint32(seed));
      const firstSide = rand() < 0.5 ? "start" : "end";
      const secondSide = firstSide === "start" ? "end" : "start";
      const sides = [firstSide, secondSide];

      function tryBuild(side, ltr) {
        const { word } = computeDraftWord_(ltr, side);
        const draft = normalizeWord_(word);
        const verdict = judgeWord_(draft);
        const isValid = verdict === "תקין";
        const usedLetter = applyFinalIfEnd_(ltr, side === "end");
        return { draft, isValid, usedLetter, side };
      }

      let chosen = null;

      for (const side of sides) {
        for (const ltr of letters) {
          const r = tryBuild(side, ltr);
          if (!r.isValid) continue;
          chosen = r;
          break;
        }
        if (chosen) break;
      }

      if (!chosen) {
        await showBanner("🎉 ניצחת! למחשב אין מהלך טוב", 2200);

        state.highlight = null;
        state.computerAnim = null;
        renderWord_();

        setTurnUI_("child");
        return;
      }

      state.word = chosen.draft;
      state.highlight = { letter: chosen.usedLetter, by: "computer" };

      // computer always gets +1 for a valid word
      state.scoreComputer += 1;

      // trigger animation for the newly added letter
      state.computerAnim = {
        word: state.word,
        side: chosen.side,
        letter: chosen.usedLetter
      };

      renderWord_();
      updateStats_();

      setTurnUI_("child");
    }

    function resetAll_() {
      hideBanner();

      state = {
        word: randomStartLetter_(),
        placed: null,
        placedSide: null,
        placedNormalizedWord: null,
        scoreChild: 0,
        scoreComputer: 0,
        turn: "child",
        highlight: null,
        bannerMode: null,
        computerAnim: null
      };

      renderTray_();
      clearPlaced_();
      renderWord_();
      updateStats_();
      setTurnUI_("child");
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

      // mobile fallback: click-to-pick + click-to-place
      let picked = null;
      tray.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".ws-letter");
        if (!btn) return;
        if (btn.disabled) return;
        if (state.turn !== "child") return;
        if (state.placed != null) return;

        picked = btn.dataset.letter || "";
        Array.from(tray.querySelectorAll(".ws-letter")).forEach(b =>
          b.classList.toggle("is-picked", b === btn)
        );
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

    return {
      reset: () => resetAll_()
    };
  }

  // ---------- register ----------
  window.ParashaGamesRegister("wordstack", {
    init: async (rootEl, ctx) => initWordstack(rootEl, ctx)
  });
})();
