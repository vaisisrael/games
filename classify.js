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

   Behavior:
   - Top shows one yellow note (current item).
   - Child drags note to a drawer.
   - Correct: note goes into that drawer (visual stack) + counter increments + next note.
   - Wrong: reject animation (shake) and note returns to top. (Your choice: option ב)
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

  function sanitizeWord_(w) {
    let s = String(w || "").trim();
    // remove nikud & cantillation
    s = s.replace(/[\u0591-\u05C7]/g, "");
    // remove excessive whitespace inside
    s = s.replace(/\s+/g, "");
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

    // ✅ levels support (your style): prefer level1_items/level2_items, fallback to legacy classify_items
    const rawL1 = (row.level1_items != null && String(row.level1_items).trim() !== "")
      ? row.level1_items
      : row.classify_items;

    const rawL2 = row.level2_items;

    const itemsL1 = parseItems_(rawL1 || "", drawers.length);
    const itemsL2 = parseItems_(rawL2 || "", drawers.length);

    // current behavior uses one deck (no UI changes): use level1 if exists, else level2 if exists
    const items = itemsL1.length ? itemsL1 : itemsL2;

    if (!drawers.length || !items.length) {
      rootEl.innerHTML = `<div>חסרים נתונים: ודא שיש classify_drawers ו־level1_items (או classify_items) עבור הפרשה.</div>`;
      return { reset: () => {} };
    }

    return render(rootEl, { title, type, drawers, items });
  }

  // ---------- UI ----------
  function render(rootEl, model) {
    rootEl.innerHTML = `
      <div class="mg-wrap">
        <div class="mg-cardbox">

          <div class="mg-topbar">
            <div class="mg-actions">
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
            <div class="mg-currentLabel">הפתק הנוכחי</div>

            <div class="mg-note mg-currentNote" role="button" tabindex="0" aria-label="פתק לגרירה">
              <span class="mg-currentWord"></span>
            </div>

            <div class="mg-currentHint">גרור אל המגירה המתאימה</div>
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

    const elCurrentNote = rootEl.querySelector(".mg-currentNote");
    const elCurrentWord = rootEl.querySelector(".mg-currentWord");

    elTitle.textContent = model.title || "מגירון";
    elSubtitle.textContent = model.type ? `מה המגירות מייצגות: ${model.type}` : "";

    // state
    let state = {
      correct: 0,
      wrong: 0,
      remaining: 0,
      deck: [],
      current: null,
      // per drawer
      drawerCounts: new Array(model.drawers.length).fill(0),
      drawerNotesEls: new Array(model.drawers.length).fill(null),
      drawerRootEls: new Array(model.drawers.length).fill(null),
      // drag
      dragging: false,
      ghostEl: null,
      ghostOffsetX: 0,
      ghostOffsetY: 0,
      locked: false
    };

    // build drawers
    for (let i = 0; i < model.drawers.length; i++) {
      const d = model.drawers[i];
      const accent = accentForIndex_(i + 1);

      const dw = document.createElement("section");
      dw.className = "mg-dw";
      dw.style.setProperty("--accent", accent);
      dw.setAttribute("data-drawer-idx", String(i + 1));

      dw.innerHTML = `
        <div class="mg-dwHead">
          <div class="mg-dwCount" aria-label="מונה פתקים">
            <span class="mg-picon" aria-hidden="true"></span>
            <span class="mg-dwCountNum">0</span>
          </div>

          <div class="mg-dwTitle">
            <span class="mg-dwTitleText"></span>
            ${d.emoji ? `<span class="mg-dwEmoji" aria-hidden="true">${escapeHtml_(d.emoji)}</span>` : ""}
            <span class="mg-dwNum" aria-label="מספר מגירה">${i + 1}</span>
          </div>
        </div>

        <div class="mg-dwBody">
          <div class="mg-slot" role="button" tabindex="0" aria-label="אזור יעד לגרירה">
            <div class="mg-empty">ריק</div>
          </div>
          <div class="mg-front" aria-hidden="true">
            <div class="mg-handle"></div>
          </div>
        </div>
      `.trim();

      dw.querySelector(".mg-dwTitleText").textContent = d.title;

      const slot = dw.querySelector(".mg-slot");
      const countNum = dw.querySelector(".mg-dwCountNum");
      const empty = dw.querySelector(".mg-empty");

      state.drawerNotesEls[i] = slot;
      state.drawerRootEls[i] = dw;

      // store for fast updates
      slot._mgCountNum = countNum;
      slot._mgEmpty = empty;

      // keyboard drop support: if focused and press Enter => attempt drop
      slot.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          attemptDropOnDrawer_(i + 1);
        }
      });

      // hover highlight (pointer)
      slot.addEventListener("pointerenter", () => {
        if (state.dragging) dw.classList.add("is-over");
      });
      slot.addEventListener("pointerleave", () => {
        dw.classList.remove("is-over");
      });

      elGrid.appendChild(dw);
    }

    function updateStatus_() {
      elStatus.textContent = `✅ ${state.correct} | ❌ ${state.wrong} | 📌 ${state.remaining}`;
    }

    function hideBanner_() {
      banner.hidden = true;
      banner.classList.remove("is-on");
      bannerText.textContent = "";
    }

    function showBanner_(text, durationMs = 900) {
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
        }, durationMs);
      });
    }

    function buildDeck_() {
      const deck = model.items.map(x => ({
        word: x.word,
        target: x.target
      }));
      shuffleArrayInPlace_(deck);
      return deck;
    }

    function setCurrent_(item) {
      state.current = item || null;
      if (!state.current) {
        elCurrentWord.textContent = "";
        elCurrentNote.classList.add("is-disabled");
        elCurrentNote.setAttribute("aria-disabled", "true");
        return;
      }
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
        showBanner_("כל הכבוד! 🎉 סיימת את כל הפתקים.", 2200);
      }
    }

    function resetAll_() {
      state.correct = 0;
      state.wrong = 0;
      state.drawerCounts.fill(0);
      state.deck = buildDeck_();
      state.remaining = state.deck.length;

      // clear drawer stacks
      for (let i = 0; i < state.drawerNotesEls.length; i++) {
        const slot = state.drawerNotesEls[i];
        // remove existing notes
        const notes = slot.querySelectorAll(".mg-note.mg-mini");
        notes.forEach(n => n.remove());
        slot._mgCountNum.textContent = "0";
        slot._mgEmpty.style.display = "flex";
        state.drawerRootEls[i].classList.remove("is-over");
      }

      setCurrent_(null);
      next_();
    }

    btnReset.addEventListener("click", () => resetAll_());

    // ---------- drag engine (pointer-based; works on mobile + desktop) ----------
    function startDrag_(e) {
      if (state.locked) return;
      if (!state.current) return;
      if (state.dragging) return;

      state.dragging = true;

      // create ghost
      const rect = elCurrentNote.getBoundingClientRect();
      const gx = e.clientX;
      const gy = e.clientY;

      state.ghostOffsetX = gx - rect.left;
      state.ghostOffsetY = gy - rect.top;

      const ghost = elCurrentNote.cloneNode(true);
      ghost.classList.add("is-ghost");
      ghost.style.width = rect.width + "px";
      ghost.style.height = rect.height + "px";
      ghost.style.left = (gx - state.ghostOffsetX) + "px";
      ghost.style.top  = (gy - state.ghostOffsetY) + "px";
      ghost.style.transform = "rotate(-0.35deg)";
      ghost.style.opacity = "0.98";
      document.body.appendChild(ghost);

      state.ghostEl = ghost;

      // highlight drawers while dragging
      for (const dw of state.drawerRootEls) dw.classList.add("is-dragging");

      // capture pointer
      try { elCurrentNote.setPointerCapture(e.pointerId); } catch (_) {}
    }

    function moveDrag_(e) {
      if (!state.dragging || !state.ghostEl) return;

      const gx = e.clientX;
      const gy = e.clientY;

      state.ghostEl.style.left = (gx - state.ghostOffsetX) + "px";
      state.ghostEl.style.top  = (gy - state.ghostOffsetY) + "px";

      // determine hovered drawer
      const el = document.elementFromPoint(gx, gy);
      const dw = el ? el.closest(".mg-dw") : null;

      for (let i = 0; i < state.drawerRootEls.length; i++) {
        const isOver = (dw === state.drawerRootEls[i]);
        state.drawerRootEls[i].classList.toggle("is-over", isOver);
      }
    }

    async function endDrag_(e) {
      if (!state.dragging) return;

      state.dragging = false;

      const gx = e.clientX;
      const gy = e.clientY;

      // find drop drawer
      const el = document.elementFromPoint(gx, gy);
      const dw = el ? el.closest(".mg-dw") : null;

      let dropped = false;
      if (dw && dw.getAttribute("data-drawer-idx")) {
        const idx = Number(dw.getAttribute("data-drawer-idx"));
        dropped = await attemptDropOnDrawer_(idx, { pointX: gx, pointY: gy });
      }

      // cleanup highlights
      for (const dwr of state.drawerRootEls) dwr.classList.remove("is-over");

      // remove ghost
      if (state.ghostEl) {
        state.ghostEl.remove();
        state.ghostEl = null;
      }

      // if not dropped, do a small reject on original note
      if (!dropped && state.current) {
        elCurrentNote.classList.add("is-reject");
        setTimeout(() => elCurrentNote.classList.remove("is-reject"), 520);
      }
    }

    elCurrentNote.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return; // only primary
      startDrag_(e);
    });

    elCurrentNote.addEventListener("pointermove", (e) => moveDrag_(e));
    elCurrentNote.addEventListener("pointerup", (e) => endDrag_(e));
    elCurrentNote.addEventListener("pointercancel", (e) => endDrag_(e));

    // keyboard pick + "drop": when pressing Enter on the note, cycle hint
    elCurrentNote.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await showBanner_("בחר מגירה ולחץ Enter כדי להכניס 🙂", 1200);
      }
    });

    // ---------- drop logic ----------
    async function attemptDropOnDrawer_(drawerIdx, opts = null) {
      if (state.locked) return false;
      if (!state.current) return false;

      const idx = clampInt(drawerIdx, 1, model.drawers.length);
      const isCorrect = (idx === Number(state.current.target));

      state.locked = true;

      if (!isCorrect) {
        state.wrong += 1;
        updateStatus_();
        await showBanner_("לא כאן 🙂 נסה מגירה אחרת", 850);

        // reject animation on the TOP note (option ב)
        elCurrentNote.classList.add("is-reject");
        setTimeout(() => elCurrentNote.classList.remove("is-reject"), 520);

        state.locked = false;
        return true; // it was a drop attempt (handled)
      }

      // correct
      state.correct += 1;
      updateStatus_();

      // add mini note into drawer slot
      const slot = state.drawerNotesEls[idx - 1];
      const countBefore = state.drawerCounts[idx - 1];
      const countAfter = countBefore + 1;
      state.drawerCounts[idx - 1] = countAfter;

      const mini = document.createElement("div");
      mini.className = "mg-note mg-mini";
      mini.style.setProperty("--i", String(Math.min(5, countBefore))); // stack tilt limited
      mini.textContent = state.current.word;

      // place in slot
      slot.appendChild(mini);

      // update counter (aligned in header)
      slot._mgCountNum.textContent = String(countAfter);

      // empty label off
      slot._mgEmpty.style.display = "none";

      // quick "accept" feel
      await showBanner_("יפה! ✅", 550);

      // next item
      next_();

      state.locked = false;
      return true;
    }

    // init
    resetAll_();

    return { reset: () => resetAll_() };
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
