/* קובץ מלא: classify.js – Parasha "מגירון" (classification drawers game)
   Data expected from Apps Script:
   ?mode=classify&parasha=...
   returns:
   {
     ok:true,
     row:{
       parasha,
       classify_title,
       classify_drawers, // "יום א|🌓,יום ב|💧,..."
       level1_items,     // "אור|1,חושך|1,..."
       level2_items      // "..." (optional)
       // (optional legacy) classify_items // "אור|1,חושך|1,..."
       // (optional legacy) classify_type  // text only
     }
   }

   Behavior (updated per request):
   - No drag: child clicks a drawer and the note goes in with animation.
   - Levels: Level 1 default; can switch to Level 2 (full reset).
   - UI: remove drawer number + per-drawer counter from view (moved to comment).
   - Score: attempts, matches out of total, timer.
   - Support phrases with spaces (2–3 words).
*/

(() => {
  "use strict";

  const MODE = "classify";        // Apps Script mode
  const GAME_ID = "classify";     // module id used by games.js registration

  // ---------- helpers ----------
  function parseCsvList(s) {
    return String(s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, Math.trunc(x)));
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

  function shuffleArrayInPlace_(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const k = randInt_(0, i);
      const t = arr[i]; arr[i] = arr[k]; arr[k] = t;
    }
    return arr;
  }

  // ✅ Requested: KEEP nikud/cantillation and KEEP spaces between words.
  // Only trim and collapse whitespace sequences to a single space.
  function sanitizeWord_(w) {
    let s = String(w || "").trim();
    s = s.replace(/\s+/g, " ");
    return s;
  }

  function parseDrawers_(raw) {
    // "יום א|🌓,יום ב|💧"
    const parts = parseCsvList(raw);
    const out = [];
    for (const p of parts) {
      const [titleRaw, emojiRaw] = String(p).split("|");
      const title = String(titleRaw || "").trim();
      const emoji = String(emojiRaw || "").trim();
      if (!title) continue;
      out.push({ title, emoji });
    }
    return out;
  }

  function parseItems_(raw, drawersCount) {
    // "אור|1,חושך|1"
    const parts = parseCsvList(raw);
    const out = [];
    for (const p of parts) {
      const [wordRaw, drawerIdxRaw] = String(p).split("|");
      const word = sanitizeWord_(wordRaw);
      const idx = clampInt(drawerIdxRaw, 1, Math.max(1, drawersCount));
      if (!word) continue;
      out.push({ word, target: idx });
    }
    return out;
  }

  // ---------- init ----------
  async function init(rootEl, ctx) {
    const { CONTROL_API, parashaLabel } = ctx;

    const url = `${CONTROL_API}?mode=${encodeURIComponent(MODE)}&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.row) {
      rootEl.innerHTML = `<div>לא נמצאו נתונים למשחק "מגירון" בפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const row = data.row || {};
    const title = String(row.classify_title || "מגירון").trim();
    const type = String(row.classify_type || "").trim(); // legacy/optional (UI only)
    const drawers = parseDrawers_(row.classify_drawers || "");

    // ✅ levels support: prefer level1_items/level2_items, fallback to legacy classify_items
    const rawL1 = (row.level1_items != null && String(row.level1_items).trim() !== "")
      ? row.level1_items
      : row.classify_items;

    const rawL2 = row.level2_items;

    const itemsL1 = parseItems_(rawL1 || "", drawers.length);
    const itemsL2 = parseItems_(rawL2 || "", drawers.length);

    if (!drawers.length || (!itemsL1.length && !itemsL2.length)) {
      rootEl.innerHTML = `<div>חסרים נתונים: ודא שיש classify_drawers ו־level1_items (או classify_items). לרמה 2 צריך level2_items.</div>`;
      return { reset: () => {} };
    }

    return render(rootEl, { title, type, drawers, itemsL1, itemsL2 });
  }

  // ---------- UI ----------
  function render(rootEl, model) {
    rootEl.innerHTML = `
      <div class="mg-wrap">
        <div class="mg-cardbox">

          <div class="mg-topbar">
            <div class="mg-actions">
              <!-- ✅ Requested: Reset should be LEFT of level buttons (in RTL row, put it LAST) -->
              <button type="button" class="mg-btn mg-level is-on" data-level="1" aria-pressed="true">רמה 1</button>
              <button type="button" class="mg-btn mg-level" data-level="2" aria-pressed="false">רמה 2</button>
              <button type="button" class="mg-btn mg-reset">איפוס</button>
            </div>
            <div class="mg-status" aria-live="polite"></div>
          </div>

          <div class="mg-banner" hidden>
            <span class="mg-banner-text"></span>
          </div>

          <div class="mg-titleRow">
            <div class="mg-title"></div>
            <p class="mg-subtitle"></p>
          </div>

          <div class="mg-currentFrame">
            <!-- ✅ Requested: remove "הפתק הנוכחי" label entirely -->
            <div class="mg-note mg-currentNote" role="button" tabindex="0" aria-label="פתק נוכחי">
              <span class="mg-currentWord"></span>
            </div>

            <div class="mg-currentHint">לאיזו מגירה זה שייך?</div>
          </div>

          <div class="mg-grid" aria-label="מגירות סיווג"></div>

        </div>
      </div>
    `.trim();

    const elTitle = rootEl.querySelector(".mg-title");
    const elSubtitle = rootEl.querySelector(".mg-subtitle");
    const elGrid = rootEl.querySelector(".mg-grid");
    const elStatus = rootEl.querySelector(".mg-status");
    const banner = rootEl.querySelector(".mg-banner");
    const bannerText = rootEl.querySelector(".mg-banner-text");
    const btnReset = rootEl.querySelector(".mg-reset");
    const btnLevel1 = rootEl.querySelector('.mg-level[data-level="1"]');
    const btnLevel2 = rootEl.querySelector('.mg-level[data-level="2"]');

    const elCurrentFrame = rootEl.querySelector(".mg-currentFrame");
    const elCurrentNote = rootEl.querySelector(".mg-currentNote");
    const elCurrentWord = rootEl.querySelector(".mg-currentWord");

    elTitle.textContent = model.title || "מגירון";
    elSubtitle.textContent = model.type ? `מה המגירות מייצגות: ${model.type}` : "";

    // state
    let state = {
      level: 1,              // ✅ default
      correct: 0,
      wrong: 0,
      total: 0,
      remaining: 0,
      deck: [],
      current: null,
      // per drawer stacks (visual)
      drawerCounts: new Array(model.drawers.length).fill(0),
      drawerNotesEls: new Array(model.drawers.length).fill(null),
      drawerRootEls: new Array(model.drawers.length).fill(null),
      locked: false,
      // timer
      startTs: 0,
      timerId: null
    };

    // ----- banner -----
    function hideBanner_() {
      banner.hidden = true;
      banner.classList.remove("is-on");
      bannerText.textContent = "";
    }

    function showBanner_(text, durationMs = 900) {
      // +1000ms requested
      const dur = Math.max(0, Number(durationMs || 0)) + 1000;

      showBanner_._token = (showBanner_._token || 0) + 1;
      const token = showBanner_._token;

      bannerText.textContent = text;
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
        }, dur);
      });
    }

    // ----- timer + status -----
    function fmtTime_(sec) {
      sec = Math.max(0, Math.trunc(sec));
      const mm = String(Math.floor(sec / 60)).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    }

    function updateStatus_() {
      const attempts = state.correct + state.wrong;
      const elapsed = state.startTs ? Math.floor((Date.now() - state.startTs) / 1000) : 0;
      elStatus.textContent = `ניסיונות: ${attempts} | התאמות: ${state.correct}/${state.total} | זמן: ${fmtTime_(elapsed)}`;
    }

    function startTimer_() {
      if (state.timerId) clearInterval(state.timerId);
      state.startTs = Date.now();
      updateStatus_();
      state.timerId = setInterval(updateStatus_, 1000);
    }

    function stopTimer_() {
      if (state.timerId) clearInterval(state.timerId);
      state.timerId = null;
      updateStatus_();
    }

    // ----- deck management by level -----
    function buildDeckForLevel_(level) {
      const src = (level === 2) ? model.itemsL2 : model.itemsL1;
      const deck = (src || []).map(x => ({ word: x.word, target: x.target }));
      shuffleArrayInPlace_(deck);
      state.total = deck.length;
      return deck;
    }

    function setCurrent_(item) {
      state.current = item || null;

      if (!state.current) {
        // ✅ Requested: hide the whole "current" area (including hint) at end
        elCurrentWord.textContent = "";
        elCurrentFrame.style.display = "none";
        elCurrentNote.classList.add("is-disabled");
        elCurrentNote.setAttribute("aria-disabled", "true");
        return;
      }

      elCurrentFrame.style.display = "";
      elCurrentWord.textContent = state.current.word;
      elCurrentNote.classList.remove("is-disabled");
      elCurrentNote.removeAttribute("aria-disabled");
    }

    function next_() {
      hideBanner_();
      const item = state.deck.pop() || null;
      state.remaining = state.deck.length;
      setCurrent_(item);
      updateStatus_();

      if (!item) {
        stopTimer_();
        showBanner_("כל הכבוד! 🎉 סיימת את כל הפתקים.", 2200);
      }
    }

    // ----- full reset (requested) -----
    function resetAll_() {
      state.correct = 0;
      state.wrong = 0;
      state.drawerCounts.fill(0);

      state.deck = buildDeckForLevel_(state.level);
      state.remaining = state.deck.length;

      // clear drawer stacks
      for (let i = 0; i < state.drawerNotesEls.length; i++) {
        const slot = state.drawerNotesEls[i];
        const notes = slot.querySelectorAll(".mg-note.mg-mini");
        notes.forEach(n => n.remove());
        state.drawerRootEls[i].classList.remove("is-over", "is-peek");
      }

      setCurrent_(null);
      startTimer_();
      next_();
    }

    btnReset.addEventListener("click", () => resetAll_());

    function setLevel_(lvl) {
      lvl = (lvl === 2) ? 2 : 1;
      state.level = lvl;

      // toggle UI
      if (lvl === 1) {
        btnLevel1.classList.add("is-on");
        btnLevel1.setAttribute("aria-pressed", "true");
        btnLevel2.classList.remove("is-on");
        btnLevel2.setAttribute("aria-pressed", "false");
      } else {
        btnLevel2.classList.add("is-on");
        btnLevel2.setAttribute("aria-pressed", "true");
        btnLevel1.classList.remove("is-on");
        btnLevel1.setAttribute("aria-pressed", "false");
      }

      // ✅ requested: switching levels does FULL reset
      resetAll_();
    }

    btnLevel1.addEventListener("click", () => setLevel_(1));
    btnLevel2.addEventListener("click", () => setLevel_(2));

    // ----- build drawers -----
    for (let i = 0; i < model.drawers.length; i++) {
      const d = model.drawers[i];
      const accent = accentForIndex_(i + 1);

      const dw = document.createElement("section");
      dw.className = "mg-dw";
      dw.style.setProperty("--accent", accent);
      dw.setAttribute("data-drawer-idx", String(i + 1));

      // ✅ Requested: remove drawer number + drawer counter from view
      // by moving those UI chunks into a comment in the template.
      dw.innerHTML = `
        <div class="mg-dwHead">
          <!--
          <div class="mg-dwCount" aria-label="מונה פתקים">
            <span class="mg-picon" aria-hidden="true"></span>
            <span class="mg-dwCountNum">0</span>
          </div>
          -->
          <div class="mg-dwTitle">
            <span class="mg-dwTitleText"></span>
            ${d.emoji ? `<span class="mg-dwEmoji" aria-hidden="true">${escapeHtml_(d.emoji)}</span>` : ""}
            <!-- <span class="mg-dwNum" aria-label="מספר מגירה">${i + 1}</span> -->
          </div>
        </div>

        <div class="mg-dwBody">
          <div class="mg-slot" role="button" tabindex="0" aria-label="הכנס פתק למגירה"></div>
          <div class="mg-front" aria-hidden="true">
            <div class="mg-handle"></div>
          </div>
        </div>
      `.trim();

      dw.querySelector(".mg-dwTitleText").textContent = d.title;

      const slot = dw.querySelector(".mg-slot");

      state.drawerNotesEls[i] = slot;
      state.drawerRootEls[i] = dw;

      // ✅ Requested: "approach" animation (peek/open feel) when hovering / focusing
      slot.addEventListener("pointerenter", () => dw.classList.add("is-peek"));
      slot.addEventListener("pointerleave", () => dw.classList.remove("is-peek"));
      slot.addEventListener("focus", () => dw.classList.add("is-peek"));
      slot.addEventListener("blur", () => dw.classList.remove("is-peek"));
      // on touch, give a short peek so it feels alive
      slot.addEventListener("pointerdown", () => {
        dw.classList.add("is-peek");
        setTimeout(() => dw.classList.remove("is-peek"), 240);
      });

      // click-to-drop (requested)
      slot.addEventListener("click", () => attemptDropOnDrawer_(i + 1));

      // keyboard: Enter acts like click
      slot.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          attemptDropOnDrawer_(i + 1);
        }
      });

      elGrid.appendChild(dw);
    }

    // ----- click animation: note flies into drawer -----
    function animateNoteToDrawer_(drawerIdx) {
      if (!state.current) return Promise.resolve();

      const idx = clampInt(drawerIdx, 1, model.drawers.length);
      const slot = state.drawerNotesEls[idx - 1];
      if (!slot) return Promise.resolve();

      const from = elCurrentNote.getBoundingClientRect();
      const to = slot.getBoundingClientRect();

      const fly = elCurrentNote.cloneNode(true);
      fly.classList.add("is-ghost");
      fly.style.position = "fixed";
      fly.style.left = from.left + "px";
      fly.style.top = from.top + "px";
      fly.style.width = from.width + "px";
      fly.style.height = from.height + "px";
      fly.style.margin = "0";
      fly.style.zIndex = "9999";
      fly.style.pointerEvents = "none";
      fly.style.transition = "transform 260ms ease, opacity 260ms ease";
      fly.style.transform = "translate(0,0) scale(1)";
      fly.style.opacity = "0.98";
      document.body.appendChild(fly);

      const dx = (to.left + to.width * 0.5) - (from.left + from.width * 0.5);
      const dy = (to.top + Math.min(40, to.height * 0.5)) - (from.top + from.height * 0.5);

      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          fly.style.transform = `translate(${dx}px, ${dy}px) scale(0.92)`;
          fly.style.opacity = "0.15";
        });

        setTimeout(() => {
          fly.remove();
          resolve();
        }, 300);
      });
    }

    // ----- drop logic -----
    async function attemptDropOnDrawer_(drawerIdx) {
      if (state.locked) return;
      if (!state.current) return;

      const idx = clampInt(drawerIdx, 1, model.drawers.length);
      const isCorrect = (idx === Number(state.current.target));

      state.locked = true;

      // small visual feedback on tapped drawer
      const dw = state.drawerRootEls[idx - 1];
      if (dw) {
        dw.classList.add("is-over");
        setTimeout(() => dw.classList.remove("is-over"), 220);
      }

      if (!isCorrect) {
        state.wrong += 1;
        updateStatus_();
        await showBanner_("לא כאן 🙂 נסה מגירה אחרת", 850); // +1s inside showBanner_
        state.locked = false;
        return;
      }

      // correct
      state.correct += 1;
      updateStatus_();

      // animate note flying in
      await animateNoteToDrawer_(idx);

      // add mini note into drawer slot (visual stack)
      const slot = state.drawerNotesEls[idx - 1];
      const countBefore = state.drawerCounts[idx - 1];
      const countAfter = countBefore + 1;
      state.drawerCounts[idx - 1] = countAfter;

      const mini = document.createElement("div");
      mini.className = "mg-note mg-mini";
      mini.style.setProperty("--i", String(Math.min(5, countBefore))); // stack tilt limited
      mini.textContent = state.current.word;
      slot.appendChild(mini);

      await showBanner_("יפה! ✅", 550); // +1s inside showBanner_

      next_();
      state.locked = false;
    }

    // init
    state.level = 1;
    resetAll_();

    return {
      reset: () => resetAll_()
    };
  }

  // accent palette by drawer index (soft)
  function accentForIndex_(n) {
    const palette = [
      "#7aa3ff", // blue
      "#4fd1c5", // teal
      "#b388ff", // purple
      "#ffcc66", // amber
      "#ff7a7a", // red
      "#5ad1ff", // light blue
      "#7bd389",
      "#fda4af"
    ];
    const i = (Number(n) - 1) % palette.length;
    return palette[i];
  }

  function escapeHtml_(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------- register ----------
  (function registerWhenReady_() {
    if (window.ParashaGamesRegister) {
      window.ParashaGamesRegister(GAME_ID, {
        init: async (rootEl, ctx) => init(rootEl, ctx)
      });
      return;
    }
    setTimeout(registerWhenReady_, 30);
  })();
})();
