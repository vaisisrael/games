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

  // Movement timing
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
      case "station": return "📄"; // ✅ שינוי: סמל תחנה
      case "bonus": return "⭐";
      case "trap": return "⚠️";
      default: return "📄"; // ✅ שינוי: ברירת מחדל לתחנה
    }
  }

  function gridPosForIndex_(i) {
    const row = Math.floor(i / 8);
    const colInRow = i % 8;
    const col = (row % 2 === 0) ? colInRow : (7 - colInRow);
    return { row, col };
  }

  function buildBoardGrid_(cells24) {
    const grid = Array.from({ length: 24 }, (_, i) => ({ i, id: cells24[i] }));
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
              <div class="mono-dieText" aria-live="polite">תורך</div>
              <button type="button" class="mono-btn mono-roll">🎲 זרוק קובייה</button>
              <div class="mono-die" aria-label="קובייה" role="status">
                <span class="mono-dieNum">0</span>
              </div>
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
      turn: "human",
      rolling: false,
      humanPos: 0,
      botPos: 0,
      humanScore: 0,
      botScore: 0,
      activeCellIdx: 0,
      ended: false,
      justRestarted: false,
      lastHumanRoll: null
    };

    let activeModalOverlay = null;
    let activeModalScoreEl = null;

    function scoreLineHtml_() {
      return `👦 ${state.humanScore}⭐ <span class="mono-scoreSep">|</span> 🤖 ${state.botScore}⭐`;
    }

    function setDieText_(t) {
      elDieText.textContent = safeText_(t) || "";
    }

    function setDieNum0_() {
      elDieNum.textContent = "0";
    }

    function setRollEnabled_(on) {
      btnRoll.disabled = !on;
      btnRoll.setAttribute("aria-disabled", on ? "false" : "true");
    }

    function updateScores_() {
      elScoreH.textContent = `👦 ${state.humanScore}⭐`;
      elScoreB.textContent = `🤖 ${state.botScore}⭐`;
    }

    function updateModalScore_() {
      if (activeModalScoreEl) activeModalScoreEl.innerHTML = scoreLineHtml_();
    }

    function cellTypeById_(id) {
      const row = model.idMap.get(id);
      return normalizeType_(row ? row.type : "");
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
              <span class="mono-token mono-token--both" style="display:none">👥</span>
            </div>
          `.trim();

          elBoard.appendChild(cellEl);
        }
      }
    }

    function isMobile_() {
      try { return window.matchMedia && window.matchMedia("(max-width: 640px)").matches; }
      catch (_) { return false; }
    }

    function updateTokensAndActive_() {
      const mobile = isMobile_();
      const cells = Array.from(elBoard.querySelectorAll(".mono-cell"));

      cells.forEach(cell => {
        const idx = Number(cell.dataset.idx || 0);

        const th = cell.querySelector(".mono-token--human");
        const tb = cell.querySelector(".mono-token--bot");
        const tBoth = cell.querySelector(".mono-token--both");

        const hasHuman = (idx === state.humanPos);
        const hasBot = (idx === state.botPos);
        const sameCell = hasHuman && hasBot;

        if (mobile && sameCell) {
          if (th) th.style.display = "none";
          if (tb) tb.style.display = "none";
          if (tBoth) tBoth.style.display = "inline-flex";
        } else {
          if (tBoth) tBoth.style.display = "none";
          if (th) th.style.display = hasHuman ? "inline-flex" : "none";
          if (tb) tb.style.display = hasBot ? "inline-flex" : "none";
        }

        cell.classList.toggle("is-active", idx === state.activeCellIdx);
      });
    }

    function chooseDieValue_(who) {
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

    function chooseBotDieValueAvoiding_(avoidValue) {
      const score = state.botScore;
      const pos = state.botPos;

      if (score !== 0) {
        const options = [1, 2, 3, 4, 5, 6].filter(v => v !== avoidValue);
        if (!options.length) return randInt_(1, 6);
        return options[randInt_(0, options.length - 1)];
      }

      const safe = [];
      for (let v = 1; v <= 6; v++) {
        if (v === avoidValue) continue;
        const landed = Math.min(pos + v, 23);
        const t = cellTypeByIndex_(landed);
        if (t !== "trap") safe.push(v);
      }
      if (safe.length) return safe[randInt_(0, safe.length - 1)];

      const any = [1, 2, 3, 4, 5, 6].filter(v => v !== avoidValue);
      if (any.length) return any[randInt_(0, any.length - 1)];
      return randInt_(1, 6);
    }

    async function animateDieRoll_(finalValue, who) {
      state.rolling = true;
      setRollEnabled_(false);

      setDieText_(who === "bot" ? "תור המחשב — מגריל…" : "מגריל…");

      const start = Date.now();
      const duration = 900;
      let last = 1;

      while (Date.now() - start < duration) {
        last = randInt_(1, 6);
        elDieNum.textContent = String(last);
        await sleep_(90);
      }

      elDieNum.textContent = String(finalValue);

      // לא מציגים "יצא X" – שדה התור נשאר/חוזר
      setDieText_(who === "bot" ? "תור המחשב" : "תורך");

      await sleep_(900);

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

    function clamp_(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function clampModalToViewport_(modalEl) {
      if (!modalEl) return;
      const rect = modalEl.getBoundingClientRect();

      modalEl.style.transform = "none";
      modalEl.style.left = rect.left + "px";
      modalEl.style.top = rect.top + "px";

      const mw = modalEl.offsetWidth;
      const mh = modalEl.offsetHeight;

      const maxLeft = window.innerWidth - mw - 8;
      const maxTop = window.innerHeight - mh - 8;

      const nextLeft = clamp_(rect.left, 8, Math.max(8, maxLeft));
      const nextTop = clamp_(rect.top, 8, Math.max(8, maxTop));

      modalEl.style.left = nextLeft + "px";
      modalEl.style.top = nextTop + "px";
    }

    function makeDraggable_(overlay) {
      const modal = overlay.querySelector(".mono-modal");
      const top = overlay.querySelector(".mono-modalTop");
      if (!modal || !top) return;

      let dragging = false;
      let startX = 0, startY = 0;
      let startLeft = 0, startTop = 0;

      function begin_(clientX, clientY) {
        clampModalToViewport_(modal);
        const rect = modal.getBoundingClientRect();

        dragging = true;
        startX = clientX;
        startY = clientY;
        startLeft = rect.left;
        startTop = rect.top;
      }

      function move_(clientX, clientY) {
        if (!dragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;

        const mw = modal.offsetWidth;
        const mh = modal.offsetHeight;

        const maxLeft = window.innerWidth - mw - 8;
        const maxTop = window.innerHeight - mh - 8;

        const nextLeft = clamp_(startLeft + dx, 8, Math.max(8, maxLeft));
        const nextTop = clamp_(startTop + dy, 8, Math.max(8, maxTop));

        modal.style.left = nextLeft + "px";
        modal.style.top = nextTop + "px";
      }

      function end_() { dragging = false; }

      top.addEventListener("mousedown", (e) => {
        e.preventDefault();
        begin_(e.clientX, e.clientY);
        window.addEventListener("mousemove", onMouseMove_, { passive: false });
        window.addEventListener("mouseup", onMouseUp_, { passive: true, once: true });
      });

      function onMouseMove_(e) {
        e.preventDefault();
        move_(e.clientX, e.clientY);
      }

      function onMouseUp_() {
        window.removeEventListener("mousemove", onMouseMove_);
        end_();
      }

      top.addEventListener("touchstart", (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        e.preventDefault();
        begin_(t.clientX, t.clientY);
        window.addEventListener("touchmove", onTouchMove_, { passive: false });
        window.addEventListener("touchend", onTouchEnd_, { passive: true, once: true });
      }, { passive: false });

      function onTouchMove_(e) {
        const t = e.touches && e.touches[0];
        if (!t) return;
        e.preventDefault();
        move_(t.clientX, t.clientY);
      }

      function onTouchEnd_() {
        window.removeEventListener("touchmove", onTouchMove_);
        end_();
      }
    }

    function openModal_(title, bodyHtml) {
      const overlay = document.createElement("div");
      overlay.className = "mono-modalOverlay";
      overlay.innerHTML = `
        <div class="mono-modal" role="dialog" aria-modal="true">
          <div class="mono-modalTop">
            <div class="mono-modalTitle">${safeText_(title)}</div>
          </div>
          <div class="mono-modalBody">
            <div class="mono-modalScore">${scoreLineHtml_()}</div>
            ${bodyHtml || ""}
          </div>
        </div>
      `.trim();

      let _resolve = null;
      const closedPromise = new Promise(res => { _resolve = res; });

      function close(reason) {
        overlay.remove();
        if (_resolve) _resolve(reason);
        if (activeModalOverlay === overlay) {
          activeModalOverlay = null;
          activeModalScoreEl = null;
        }
      }

      document.body.appendChild(overlay);
      makeDraggable_(overlay);

      activeModalOverlay = overlay;
      activeModalScoreEl = overlay.querySelector(".mono-modalScore");

      const modalEl = overlay.querySelector(".mono-modal");
      requestAnimationFrame(() => clampModalToViewport_(modalEl));

      return { close, overlay, closed: closedPromise };
    }

    function applyScore_(who, delta) {
      if (!delta) return;
      if (who === "bot") state.botScore = clamp0_(state.botScore + delta);
      else state.humanScore = clamp0_(state.humanScore + delta);

      updateScores_();
      updateModalScore_();
    }

    function setTurnUi_() {
      if (state.ended) {
        setDieText_("");
        setRollEnabled_(false);
        return;
      }
      setDieNum0_();
      if (state.turn === "human") setDieText_("תורך");
      else setDieText_("תור המחשב");
      setRollEnabled_(true);
    }

    function rewardLine_(who, reward, type) {
      const n = Number(reward || 0) || 0;
      if (!n) return "";
      if (n > 0) return (who === "bot") ? `המחשב קיבל +${n}⭐` : `קיבלת +${n}⭐`;
      if (type === "trap") return (who === "bot") ? `המחשב הפסיד ${Math.abs(n)}⭐` : `הפסדת ${Math.abs(n)}⭐`;
      return "";
    }

    async function handleStationBonusTrap_(who, row) {
      const type = normalizeType_(row.type);

      const rawTitle = safeText_(row.title);
      const rawText = safeText_(row.text);

      const reward = Number(row.reward || 0) || 0;
      const rline = rewardLine_(who, reward, type);

      let title = "תחנה";
      let bodyTextMain = rawText;

      if (type === "station") {
        title = rawTitle || "תחנה";
        bodyTextMain = rawText;
      } else if (type === "bonus") {
        title = rawTitle || "בונוס";
        bodyTextMain = rawText;
      } else { // trap
        title = rawTitle || "מלכודת";
        bodyTextMain = rawText;
      }

      const body = `
        <div class="mono-cardText">${bodyTextMain}</div>
        ${rline ? `<div class="mono-cardReward">${rline}</div>` : ""}
        <div class="mono-cardActions">
          <button type="button" class="mono-btn mono-continue">המשך</button>
        </div>
      `.trim();

      const modal = openModal_(typeIcon_(type) + " " + title, body);

      applyScore_(who, reward);

      modal.overlay.querySelector(".mono-continue").addEventListener("click", () => modal.close("continue"));
      await modal.closed;
    }

    async function handleQuiz_(who, row) {
      const qTitle = safeText_(row.title) || "שאלה";
      const qText = safeText_(row.text);
      const answers = [row.a1, row.a2, row.a3, row.a4].map(safeText_);
      const correct = safeText_(row.correct);

      // Wrong answers never subtract points in quiz
      const rewardRaw = Number(row.reward || 0) || 0;
      const reward = Math.max(0, rewardRaw);

      const buttonsHtml = answers.map((a) => {
        const disabledAttr = (!a ? "disabled" : "");
        return `<button type="button" class="mono-ans" data-ans="${encodeURIComponent(a)}" ${disabledAttr}>${a || "—"}</button>`;
      }).join("");

      const body = `
        <div class="mono-cardText">${qText}</div>
        <div class="mono-answers">${buttonsHtml}</div>
        <div class="mono-botLine" style="display:none">🤖 המחשב חושב…</div>
        <div class="mono-quizFeedback" style="display:none"></div>
        <div class="mono-cardActions" style="display:none">
          <button type="button" class="mono-btn mono-continue">המשך</button>
        </div>
      `.trim();

      let locked = false;

      const modal = openModal_("❓ " + qTitle, body);
      const ansBtns = Array.from(modal.overlay.querySelectorAll(".mono-ans"));
      const botLine = modal.overlay.querySelector(".mono-botLine");
      const feedback = modal.overlay.querySelector(".mono-quizFeedback");
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

      function showFeedback_(isCorrect) {
        if (!feedback) return;
        feedback.style.display = "block";

        if (who === "human") {
          if (isCorrect) feedback.textContent = `כל הכבוד! תשובה נכונה ✅ קיבלת +${reward}⭐`;
          else feedback.textContent = `לא הפעם ❌ התשובה הנכונה היא: ${correct} (לא ירדה נקודה)`;
          return;
        }

        if (isCorrect) feedback.textContent = `המחשב צדק ✅ קיבל +${reward}⭐`;
        else feedback.textContent = `המחשב טעה ❌ התשובה הנכונה היא: ${correct} (לא ירדה נקודה)`;
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

        if (botLine) botLine.style.display = "none";
        showFeedback_(isCorrect);
        actions.style.display = "flex";
      }

      if (who === "bot") {
        lockAnswers_();
        await sleep_(2000);
        if (botLine) botLine.style.display = "block";
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

        btnContinue.addEventListener("click", () => modal.close("continue"));
        await modal.closed;
        return;
      }

      ansBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          if (locked) return;
          if (btn.disabled) return;
          const a = decodeURIComponent(btn.dataset.ans || "");
          reveal_(a);
        });
      });

      btnContinue.addEventListener("click", () => modal.close("continue"));
      await modal.closed;
    }

    async function handleLanding_(who, idx) {
      const id = model.cells[idx];
      const row = model.idMap.get(id) || { id, type: "station", title: "", text: "", reward: 0 };

      const type = normalizeType_(row.type);

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
          <div class="mono-endWinner">${winnerText}</div>
          <div class="mono-cardActions">
            <button type="button" class="mono-btn mono-restart">משחק חדש</button>
          </div>
        `.trim();

        let didRestart = false;
        const modal = openModal_("🏆 סיום", body);
        modal.overlay.querySelector(".mono-restart").addEventListener("click", () => {
          didRestart = true;
          modal.close("restart");
        });

        await modal.closed;

        if (didRestart) restart_();
        return;
      }

      if (type === "quiz") await handleQuiz_(who, row);
      else await handleStationBonusTrap_(who, row);
    }

    async function doTurn_(who) {
      if (state.ended) return;

      setRollEnabled_(false);

      let steps = chooseDieValue_(who);

      // פתרון B: אם המחשב מגריל בדיוק כמו השחקן בסיבוב הקודם — reroll פעם אחת
      if (who === "bot" && state.lastHumanRoll != null && steps === state.lastHumanRoll) {
        steps = chooseBotDieValueAvoiding_(state.lastHumanRoll);
      }

      await animateDieRoll_(steps, who);

      if (who === "human") state.lastHumanRoll = steps;

      const landedIdx = await moveTokenStepByStep_(who, steps);
      await handleLanding_(who, landedIdx);

      if (state.justRestarted) {
        state.justRestarted = false;
        return;
      }

      if (state.ended) return;

      state.turn = (state.turn === "human") ? "bot" : "human";
      setTurnUi_();
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
      state.justRestarted = true;
      state.lastHumanRoll = null;

      setDieNum0_();
      updateScores_();
      updateTokensAndActive_();
      setTurnUi_();
    }

    // init
    buildBoardDom_();
    updateScores_();
    updateTokensAndActive_();
    setDieNum0_();
    setTurnUi_();

    btnRoll.addEventListener("click", () => {
      if (state.rolling || state.ended) return;
      doTurn_(state.turn);
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
