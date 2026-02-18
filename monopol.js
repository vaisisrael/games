/* קובץ מלא: monopol.js – Parasha "חכמון" (monopol / Monopol)
   מקור הנתונים:
     - גיליון 1: controlRow.monopol = yes/no או true/false (הדלקה בלבד)
     - גיליון "monopol_board" דרך Apps Script: mode=monopol_board → row.cells (24 מזהים)
     - גיליון "monopol_data" דרך Apps Script: mode=monopol_data → rows (מפת id→תוכן)

   הערות:
     - לוח 24 משבצות קבוע: 3×8 זיגזג
     - התחלה: משמאל למעלה (index 0)
     - סיום: ימינה למטה (index 23)
*/

(() => {
  "use strict";

  const GAME_ID = "monopol";

  // Movement timing (slower as requested)
  const MOVE_STEP_MS = 320;
  const MOVE_FINAL_MS = 450;

  // After landing: wait 1s before showing the card
  const AFTER_LAND_PAUSE_MS = 1000;

  function withVersion_(url, buildVersion) {
    try {
      const u = new URL(url, window.location.href);
      if (buildVersion) u.searchParams.set("v", String(buildVersion));
      return u.toString();
    } catch (_) {
      return url;
    }
  }

  function safeText_(s) {
    return String(s == null ? "" : s).trim();
  }

  function clamp0_(n) {
    n = Number(n || 0);
    return n < 0 ? 0 : n;
  }

  function parseCellsCsv_(s) {
    return safeText_(s)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function sleep_(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function randInt_(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function chance_(p) {
    return Math.random() < p;
  }

  function normalizeType_(t) {
    t = safeText_(t).toLowerCase();
    if (t === "start") return "start";
    if (t === "end") return "end";
    if (t === "station") return "station";
    if (t === "bonus") return "bonus";
    if (t === "trap") return "trap";
    if (t === "quiz") return "quiz";
    return "station";
  }

  function typeIcon_(type) {
    switch (type) {
      case "start": return "🏁";
      case "end": return "🏆";
      case "quiz": return "❓";
      case "station": return "📘";
      case "bonus": return "⭐";
      case "trap": return "⚠️";
      default: return "📘";
    }
  }

  function rewardText_(reward) {
    const n = Number(reward || 0);
    if (!n) return "";
    return (n > 0 ? `+${n}⭐` : `${n}⭐`);
  }

  function gridPosForIndex_(i) {
    // 3×8 snake: row 0 L->R, row 1 R->L, row 2 L->R
    const row = Math.floor(i / 8);
    const colInRow = i % 8;
    const col = (row % 2 === 0) ? colInRow : (7 - colInRow);
    return { row, col };
  }

  function buildBoardGrid_(cells24) {
    const grid = Array.from({ length: 24 }, (_, i) => ({ i, id: cells24[i] }));
    // convert to display order by rows/cols
    const display = Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => null));
    grid.forEach(({ i, id }) => {
      const { row, col } = gridPosForIndex_(i);
      display[row][col] = { idx: i, id };
    });
    return display;
  }

  function buildIdMap_(rows) {
    const m = new Map();
    (rows || []).forEach(r => {
      const id = safeText_(r.id);
      if (id) m.set(id, r);
    });
    return m;
  }

  async function fetchBoard_(CONTROL_API, parashaLabel, buildVersion) {
    const url = withVersion_(
      `${CONTROL_API}?mode=monopol_board&parasha=${encodeURIComponent(parashaLabel)}`,
      buildVersion
    );
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch monopol_board");
    const data = await res.json();
    const row = data && data.row ? data.row : null;
    const cells = row ? parseCellsCsv_(row.cells) : [];
    return cells;
  }

  async function fetchData_(CONTROL_API, parashaLabel, buildVersion) {
    const url = withVersion_(
      `${CONTROL_API}?mode=monopol_data&parasha=${encodeURIComponent(parashaLabel)}`,
      buildVersion
    );
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch monopol_data");
    const data = await res.json();
    const rows = data && data.rows ? data.rows : [];
    return rows;
  }

  function render(rootEl, model) {
    rootEl.innerHTML = `
      <div class="mono-wrap">
        <div class="mono-cardbox">

          <div class="mono-topbar">
            <div class="mono-actions">
              <button type="button" class="mono-btn mono-roll">🎲 זרוק קובייה</button>
              <div class="mono-die" aria-label="קובייה" role="status">
                <span class="mono-dieNum">0</span>
              </div>
              <div class="mono-dieText" aria-live="polite">תורך</div>
            </div>

            <div class="mono-score" aria-live="polite">
              <span class="mono-scoreH">👦 0⭐</span>
              <span class="mono-scoreSep">|</span>
              <span class="mono-scoreB">🤖 0⭐</span>
            </div>
          </div>

          <div class="mono-boardWrap">
            <div class="mono-board" aria-label="לוח המשחק" role="grid"></div>
          </div>

        </div>
      </div>
    `.trim();

    const elBoard = rootEl.querySelector(".mono-board");
    const btnRoll = rootEl.querySelector(".mono-roll");
    const elDieNum = rootEl.querySelector(".mono-dieNum");
    const elDieText = rootEl.querySelector(".mono-dieText");
    const elScoreH = rootEl.querySelector(".mono-scoreH");
    const elScoreB = rootEl.querySelector(".mono-scoreB");

    const state = {
      turn: "human", // "human" | "bot"
      rolling: false,
      humanPos: 0,
      botPos: 0,
      humanScore: 0,
      botScore: 0,
      activeCellIdx: 0,
      ended: false
    };

    function setDieText_(t) {
      elDieText.textContent = safeText_(t) || "";
    }

    function setRollEnabled_(on) {
      btnRoll.disabled = !on;
      btnRoll.setAttribute("aria-disabled", on ? "false" : "true");
    }

    function updateScores_() {
      elScoreH.textContent = `👦 ${state.humanScore}⭐`;
      elScoreB.textContent = `🤖 ${state.botScore}⭐`;
    }

    function cellTypeById_(id) {
      const row = model.idMap.get(id);
      const type = normalizeType_(row ? row.type : "");
      return type;
    }

    function cellTypeByIndex_(idx) {
      const id = model.cells[idx];
      return cellTypeById_(id);
    }

    function buildBoardDom_() {
      elBoard.innerHTML = "";
      const display = model.displayGrid;

      for (let r = 0; r < display.length; r++) {
        for (let c = 0; c < display[r].length; c++) {
          const cell = display[r][c];
          const idx = cell.idx;
          const id = cell.id;
          const type = cellTypeById_(id);
          const icon = typeIcon_(type);
          const num = idx + 1;

          const cellEl = document.createElement("div");
          cellEl.className = `mono-cell mono-${type}`;
          cellEl.dataset.idx = String(idx);
          cellEl.dataset.id = id;
          cellEl.setAttribute("role", "gridcell");

          cellEl.innerHTML = `
            <div class="mono-num">${num}</div>
            <div class="mono-icon" aria-hidden="true">${icon}</div>
            <div class="mono-tokens" aria-hidden="true">
              <span class="mono-token mono-token--human" style="display:none">👦</span>
              <span class="mono-token mono-token--bot" style="display:none">🤖</span>
            </div>
          `.trim();

          elBoard.appendChild(cellEl);
        }
      }
    }

    function updateTokensAndActive_() {
      const cells = Array.from(elBoard.querySelectorAll(".mono-cell"));
      cells.forEach(cell => {
        const idx = Number(cell.dataset.idx || 0);
        const th = cell.querySelector(".mono-token--human");
        const tb = cell.querySelector(".mono-token--bot");
        if (th) th.style.display = (idx === state.humanPos) ? "inline-flex" : "none";
        if (tb) tb.style.display = (idx === state.botPos) ? "inline-flex" : "none";
        cell.classList.toggle("is-active", idx === state.activeCellIdx);
      });
    }

    function chooseDieValue_(who) {
      // If player has 0 points: don't allow a roll that lands on a trap cell (if possible)
      const score = (who === "bot") ? state.botScore : state.humanScore;
      const pos = (who === "bot") ? state.botPos : state.humanPos;

      if (score !== 0) return randInt_(1, 6);

      const safe = [];
      for (let v = 1; v <= 6; v++) {
        const landed = Math.min(pos + v, 23);
        const t = cellTypeByIndex_(landed);
        if (t !== "trap") safe.push(v);
      }

      if (safe.length) return safe[randInt_(0, safe.length - 1)];
      return randInt_(1, 6);
    }

    async function animateDieRoll_(finalValue, who) {
      state.rolling = true;
      setRollEnabled_(false);

      if (who === "bot") setDieText_("🤖 זורק קובייה…");
      else setDieText_("מגריל…");

      const start = Date.now();
      const duration = 900;
      let last = 1;

      while (Date.now() - start < duration) {
        last = randInt_(1, 6);
        elDieNum.textContent = String(last);
        await sleep_(90);
      }

      elDieNum.textContent = String(finalValue);
      setDieText_(`יצא: ${finalValue}`);

      await sleep_(1000);

      state.rolling = false;
    }

    async function moveTokenStepByStep_(who, steps) {
      const lastIdx = 23;
      const from = (who === "bot") ? state.botPos : state.humanPos;
      const to = Math.min(from + steps, lastIdx);

      for (let p = from + 1; p <= to; p++) {
        if (who === "bot") state.botPos = p;
        else state.humanPos = p;

        state.activeCellIdx = p;
        updateTokensAndActive_();
        await sleep_(MOVE_STEP_MS);
      }

      await sleep_(MOVE_FINAL_MS);

      return to;
    }

    function openModal_(title, bodyHtml, options) {
      const opts = options || {};
      const overlay = document.createElement("div");
      overlay.className = "mono-modalOverlay";
      overlay.innerHTML = `
        <div class="mono-modal" role="dialog" aria-modal="true">
          <div class="mono-modalTop">
            <div class="mono-modalTitle">${safeText_(title)}</div>
            <button type="button" class="mono-modalClose">סגור</button>
          </div>
          <div class="mono-modalBody">
            ${bodyHtml || ""}
          </div>
        </div>
      `.trim();

      const closeBtn = overlay.querySelector(".mono-modalClose");
      if (opts.hideClose) closeBtn.style.display = "none";

      let _resolve = null;
      const closedPromise = new Promise(res => { _resolve = res; });

      function close(reason) {
        overlay.remove();
        if (typeof opts.onClose === "function") opts.onClose(reason);
        if (_resolve) _resolve(reason);
      }

      if (!opts.disableBackdropClose) {
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) close("backdrop");
        });
      }

      closeBtn.addEventListener("click", () => close("close"));

      document.body.appendChild(overlay);

      return { close, overlay, closed: closedPromise };
    }

    function applyScore_(who, delta) {
      if (!delta) return;
      if (who === "bot") state.botScore = clamp0_(state.botScore + delta);
      else state.humanScore = clamp0_(state.humanScore + delta);
      updateScores_();
    }

    function switchTurn_() {
      state.turn = (state.turn === "human") ? "bot" : "human";
      setDieText_(state.turn === "human" ? "תורך" : "תור המחשב");
      setRollEnabled_(state.turn === "human" && !state.ended);
    }

    async function handleStationBonusTrap_(who, row) {
      const type = normalizeType_(row.type);
      const title = safeText_(row.title) || (type === "station" ? "תחנה" : type === "bonus" ? "בונוס" : "מלכודת");
      const text = safeText_(row.text);

      const reward = Number(row.reward || 0) || 0;
      const rtxt = rewardText_(reward);

      const body = `
        <div class="mono-cardText">${text}</div>
        ${rtxt ? `<div class="mono-cardReward">${rtxt}</div>` : ""}
        <div class="mono-cardActions">
          <button type="button" class="mono-btn mono-continue">המשך</button>
        </div>
      `.trim();

      // Apply the score immediately upon showing (as before),
      // but keep the flow blocked until the user clicks "המשך".
      const modal = openModal_(typeIcon_(type) + " " + title, body, {
        hideClose: true,
        disableBackdropClose: true
      });

      applyScore_(who, reward);

      const btn = modal.overlay.querySelector(".mono-continue");
      btn.addEventListener("click", () => modal.close("continue"));

      if (who === "bot") {
        await sleep_(2000);
        modal.close("auto");
      }

      await modal.closed;
    }

    async function handleQuiz_(who, row) {
      const qTitle = safeText_(row.title) || "שאלה";
      const qText = safeText_(row.text);
      const answers = [row.a1, row.a2, row.a3, row.a4].map(safeText_);
      const correct = safeText_(row.correct);
      const reward = Number(row.reward || 0) || 0;

      const buttonsHtml = answers.map((a) => {
        const disabledAttr = (!a ? "disabled" : "");
        return `<button type="button" class="mono-ans" data-ans="${encodeURIComponent(a)}" ${disabledAttr}>${a || "—"}</button>`;
      }).join("");

      const body = `
        <div class="mono-cardText">${qText}</div>
        <div class="mono-answers">${buttonsHtml}</div>
        <div class="mono-botLine" style="display:none">🤖 חושב…</div>
        <div class="mono-cardActions" style="display:none">
          <button type="button" class="mono-btn mono-continue">המשך</button>
        </div>
      `.trim();

      let locked = false;

      const modal = openModal_("❓ " + qTitle, body, {
        hideClose: true,
        disableBackdropClose: true
      });

      const ansBtns = Array.from(modal.overlay.querySelectorAll(".mono-ans"));
      const botLine = modal.overlay.querySelector(".mono-botLine");
      const actions = modal.overlay.querySelector(".mono-cardActions");
      const btnContinue = modal.overlay.querySelector(".mono-continue");

      function lockAnswers_() {
        locked = true;
        ansBtns.forEach(b => b.disabled = true);
      }

      function markAnswer_(btn, cls) {
        if (!btn) return;
        btn.classList.add(cls);
      }

      function findBtnByAnswer_(a) {
        const enc = encodeURIComponent(a || "");
        return ansBtns.find(b => (b.dataset.ans || "") === enc) || null;
      }

      function reveal_(picked) {
        lockAnswers_();

        const isCorrect = safeText_(picked) && safeText_(picked) === correct;

        const pickedBtn = findBtnByAnswer_(picked);
        if (pickedBtn) pickedBtn.classList.add("is-picked");

        if (isCorrect) {
          markAnswer_(pickedBtn, "is-correct");
          applyScore_(who, reward);
        } else {
          if (pickedBtn) markAnswer_(pickedBtn, "is-wrong");
          const correctBtn = findBtnByAnswer_(correct);
          markAnswer_(correctBtn, "is-correct");
        }

        actions.style.display = "flex";
      }

      // Human interaction (must block flow until "המשך")
      if (who === "human") {
        ansBtns.forEach(btn => {
          btn.addEventListener("click", () => {
            if (locked) return;
            const a = decodeURIComponent(btn.dataset.ans || "");
            reveal_(a);
          });
        });

        btnContinue.addEventListener("click", () => modal.close("continue"));
        await modal.closed;
        return;
      }

      // Bot flow
      await sleep_(2000);
      botLine.style.display = "block";
      await sleep_(2500);

      const willBeCorrect = chance_(0.6);
      let pick = correct;

      if (!willBeCorrect) {
        const wrongs = answers.filter(a => a && a !== correct);
        pick = wrongs.length ? wrongs[randInt_(0, wrongs.length - 1)] : correct;
      }

      const pickBtn = findBtnByAnswer_(pick);
      if (pickBtn) pickBtn.classList.add("is-botSelect");

      await sleep_(600);

      reveal_(pick);

      await sleep_(1200);

      modal.close("auto");
      await modal.closed;
    }

    async function handleLanding_(who, idx) {
      const id = model.cells[idx];
      const row = model.idMap.get(id) || { id, type: "station", title: "", text: "", reward: 0 };

      const type = normalizeType_(row.type);

      // Pause after landing (as requested)
      await sleep_(AFTER_LAND_PAUSE_MS);

      if (type === "end") {
        state.ended = true;
        setRollEnabled_(false);

        const h = state.humanScore;
        const b = state.botScore;

        let winnerText = "תיקו!";
        if (h > b) winnerText = "נצחת! 🎉";
        else if (b > h) winnerText = "המחשב ניצח 🤖";

        const body = `
          <div class="mono-cardText">הגעתם לסיום. המשחק נגמר.</div>
          <div class="mono-endScores">👦 ${h}⭐ <span class="mono-scoreSep">|</span> 🤖 ${b}⭐</div>
          <div class="mono-endWinner">${winnerText}</div>
          <div class="mono-cardActions">
            <button type="button" class="mono-btn mono-restart">משחק חדש</button>
          </div>
        `.trim();

        const modal = openModal_("🏆 סיום", body, {
          hideClose: true,
          disableBackdropClose: true
        });

        modal.overlay.querySelector(".mono-restart").addEventListener("click", () => {
          modal.close("restart");
          restart_();
        });

        await modal.closed;
        return;
      }

      if (type === "quiz") {
        await handleQuiz_(who, row);
      } else {
        await handleStationBonusTrap_(who, row);
      }
    }

    async function doTurn_(who) {
      if (state.ended) return;

      setRollEnabled_(false);

      const steps = chooseDieValue_(who);
      await animateDieRoll_(steps, who);

      const landedIdx = await moveTokenStepByStep_(who, steps);

      await handleLanding_(who, landedIdx);

      if (state.ended) return;

      switchTurn_();

      if (state.turn === "bot") {
        await sleep_(300);
        await doTurn_("bot");
      }
    }

    function restart_() {
      state.turn = "human";
      state.rolling = false;
      state.humanPos = 0;
      state.botPos = 0;
      state.humanScore = 0;
      state.botScore = 0;
      state.activeCellIdx = 0;
      state.ended = false;

      elDieNum.textContent = "0";
      setDieText_("תורך");
      updateScores_();
      updateTokensAndActive_();
      setRollEnabled_(true);
    }

    // init board
    buildBoardDom_();
    updateScores_();
    updateTokensAndActive_();
    elDieNum.textContent = "0";
    setDieText_("תורך");
    setRollEnabled_(true);

    btnRoll.addEventListener("click", () => {
      if (state.turn !== "human") return;
      if (state.rolling || state.ended) return;
      doTurn_("human");
    });

    return { reset: () => {} };
  }

  async function init(rootEl, ctx) {
    const parashaLabel = ctx?.parashaLabel || "";
    const CONTROL_API = ctx?.CONTROL_API || "";
    const buildVersion = ctx?.BUILD_VERSION || "";

    if (!parashaLabel || !CONTROL_API) {
      rootEl.innerHTML = `<div>שגיאה: חסר ctx.</div>`;
      return { reset: () => {} };
    }

    rootEl.innerHTML = "טוען...";

    try {
      const cells = await fetchBoard_(CONTROL_API, parashaLabel, buildVersion);

      if (cells.length !== 24) {
        rootEl.innerHTML = `<div>שגיאה: לוח חייב להכיל 24 משבצות (נמצאו ${cells.length}).</div>`;
        return { reset: () => {} };
      }

      const rows = await fetchData_(CONTROL_API, parashaLabel, buildVersion);
      const idMap = buildIdMap_(rows);

      const fixedCells = cells.map(id => safeText_(id));
      const displayGrid = buildBoardGrid_(fixedCells);

      return render(rootEl, {
        parashaLabel,
        cells: fixedCells,
        idMap,
        displayGrid
      });
    } catch (_) {
      rootEl.innerHTML = `<div>שגיאה בטעינת נתוני חכמון.</div>`;
      return { reset: () => {} };
    }
  }

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
