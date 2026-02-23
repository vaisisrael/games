/* קובץ מלא: detective.js – "חקי הבלש" (Detective / Blash)
   Expects Apps Script:
   ?mode=detective&parasha=...
   returns:
   { ok:true, row:{
       parasha, title, story, task,
       evidence_type, evidence_text, evidence_url, evidence_alt,
       hint, solution
     } }
*/

(() => {
  "use strict";

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normType(t) {
    return String(t || "").trim().toLowerCase();
  }

  function isTruthyText(s) {
    return String(s || "").trim().length > 0;
  }

  async function initDetective(rootEl, ctx) {
    const { CONTROL_API, parashaLabel } = ctx;

    const url = `${CONTROL_API}?mode=detective&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.row) {
      rootEl.innerHTML = `<div>לא נמצאו נתוני בלש לפרשה זו.</div>`;
      return { reset: () => {} };
    }

    const row = data.row;

    const model = {
      parasha: row.parasha || parashaLabel,
      title: String(row.title || "").trim(),
      story: String(row.story || "").trim(),
      task: String(row.task || "").trim(),
      evidence_type: normType(row.evidence_type),
      evidence_text: String(row.evidence_text || "").trim(),
      evidence_url: String(row.evidence_url || "").trim(),
      evidence_alt: String(row.evidence_alt || "").trim(),
      hint: String(row.hint || "").trim(),
      solution: String(row.solution || "").trim()
    };

    return render(rootEl, model);
  }

  function render(rootEl, model) {
    // step ids (must match the "process we built")
    const STEPS = [
      { id: "story", label: "סיפור" },
      { id: "task", label: "משימה" },
      { id: "evidence", label: "ראיה" },
      { id: "hint", label: "רמז" },
      { id: "solution", label: "פתרון" }
    ];

    const hasHint = isTruthyText(model.hint);
    const hasSolution = isTruthyText(model.solution);

    // If hint empty -> keep button but disabled? We'll hide to avoid confusion.
    // We'll keep the process but hide the panel button if truly empty.
    // (No other behavior changes.)
    const visibleSteps = STEPS.filter(s => {
      if (s.id === "hint") return hasHint;
      if (s.id === "solution") return hasSolution;
      return true;
    });

    const titleLine = model.title ? `<div class="det-title">${escHtml(model.title)}</div>` : ``;

    rootEl.innerHTML = `
      <div class="det-wrap">
        <div class="det-cardbox">
          ${titleLine}

          <div class="det-topbar">
            <div class="det-steps" role="tablist" aria-label="שלבי החקירה">
              ${visibleSteps
                .map((s, i) => {
                  const selected = i === 0 ? "true" : "false";
                  return `<button type="button" class="det-btn det-step" data-step="${escHtml(
                    s.id
                  )}" role="tab" aria-selected="${selected}">${escHtml(s.label)}</button>`;
                })
                .join("")}
            </div>

            <div class="det-actions">
              <button type="button" class="det-btn det-reset">איפוס</button>
            </div>
          </div>

          <div class="det-panels">
            <section class="det-panel" data-panel="story" role="tabpanel">
              <div class="det-card det-story">${formatParagraphs_(model.story)}</div>
            </section>

            <section class="det-panel" data-panel="task" role="tabpanel" hidden>
              <div class="det-card det-task">${formatParagraphs_(model.task)}</div>
            </section>

            <section class="det-panel" data-panel="evidence" role="tabpanel" hidden>
              ${renderEvidence_(model)}
            </section>

            ${
              hasHint
                ? `<section class="det-panel" data-panel="hint" role="tabpanel" hidden>
                     <div class="det-card det-hint">${formatParagraphs_(model.hint)}</div>
                   </section>`
                : ``
            }

            ${
              hasSolution
                ? `<section class="det-panel" data-panel="solution" role="tabpanel" hidden>
                     <div class="det-card det-solution">${formatParagraphs_(model.solution)}</div>
                   </section>`
                : ``
            }
          </div>
        </div>
      </div>
    `.trim();

    const btnReset = rootEl.querySelector(".det-reset");
    const stepButtons = Array.from(rootEl.querySelectorAll(".det-step"));
    const panels = new Map(
      Array.from(rootEl.querySelectorAll(".det-panel")).map(p => [p.dataset.panel, p])
    );

    // Progress gating (enforce structure): story -> task -> evidence -> (hint) -> solution
    const order = visibleSteps.map(s => s.id);
    let unlockedIndex = 1; // story unlocked, task unlocked; evidence locked until task visited
    // We will unlock evidence only after task was opened once.
    // Hint unlocks after evidence opened once; Solution unlocks after evidence opened once too.

    function setEnabledByProgress() {
      stepButtons.forEach(btn => {
        const stepId = btn.dataset.step;
        const idx = order.indexOf(stepId);
        // Always allow story & task.
        // Evidence allowed only when unlockedIndex >= idx+1
        const allowed = idx <= unlockedIndex;
        btn.disabled = !allowed;
        btn.setAttribute("aria-disabled", allowed ? "false" : "true");
        btn.classList.toggle("is-disabled", !allowed);
      });
    }

    function selectStep(stepId) {
      // update selected
      stepButtons.forEach(b => b.setAttribute("aria-selected", b.dataset.step === stepId ? "true" : "false"));

      // show/hide panels
      panels.forEach((panel, id) => {
        panel.hidden = id !== stepId;
      });

      // unlock next steps depending on what was opened
      const idx = order.indexOf(stepId);
      if (idx === -1) return;

      // If task opened -> unlock evidence
      if (stepId === "task") {
        unlockedIndex = Math.max(unlockedIndex, order.indexOf("evidence"));
      }
      // If evidence opened -> unlock hint/solution (if exist)
      if (stepId === "evidence") {
        if (order.includes("hint")) unlockedIndex = Math.max(unlockedIndex, order.indexOf("hint"));
        if (order.includes("solution")) unlockedIndex = Math.max(unlockedIndex, order.indexOf("solution"));
      }

      setEnabledByProgress();
    }

    stepButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        selectStep(btn.dataset.step);
      });
    });

    function reset() {
      unlockedIndex = 1; // allow story+task
      setEnabledByProgress();
      selectStep("story");
    }

    btnReset.addEventListener("click", reset);

    // init
    reset();

    return { reset };
  }

  function formatParagraphs_(text) {
    const t = String(text || "").trim();
    if (!t) return `<div class="det-empty">—</div>`;

    // Keep user's line breaks as paragraphs
    const parts = t
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    // If only one "long" paragraph, keep it as is
    return parts.map(p => `<p>${escHtml(p)}</p>`).join("");
  }

  function renderEvidence_(model) {
    const type = normType(model.evidence_type);

    // old_text: render parchment
    if (type === "old_text") {
      const text = model.evidence_text || model.evidence_url || ""; // allow fallback if user used evidence_url field
      return `
        <div class="det-evidence">
          <div class="det-paper" aria-label="ראיה: כתב עתיק">
            <div class="det-ink">${formatParagraphs_(text)}</div>
          </div>
        </div>
      `.trim();
    }

    // image: show image
    if (type === "image") {
      const url = model.evidence_url;
      if (!url) return `<div class="det-card det-evidence-missing">לא הוגדרה כתובת ראיה.</div>`;
      const alt = model.evidence_alt ? model.evidence_alt : "ראיה";
      return `
        <div class="det-evidence">
          <img class="det-img" src="${escHtml(url)}" alt="${escHtml(alt)}" loading="lazy" />
        </div>
      `.trim();
    }

    // document: show link (simple, safe)
    if (type === "document") {
      const url = model.evidence_url;
      if (!url) return `<div class="det-card det-evidence-missing">לא הוגדרה כתובת ראיה.</div>`;
      const label = model.evidence_alt ? model.evidence_alt : "פתח מסמך ראיה";
      return `
        <div class="det-evidence">
          <a class="det-docLink" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(label)}</a>
        </div>
      `.trim();
    }

    // fallback: if evidence_url exists treat as image
    if (model.evidence_url) {
      const alt = model.evidence_alt ? model.evidence_alt : "ראיה";
      return `
        <div class="det-evidence">
          <img class="det-img" src="${escHtml(model.evidence_url)}" alt="${escHtml(alt)}" loading="lazy" />
        </div>
      `.trim();
    }

    return `<div class="det-card det-evidence-missing">לא הוגדרה ראיה.</div>`;
  }

  // register
  window.ParashaGamesRegister("detective", {
    init: async (rootEl, ctx) => initDetective(rootEl, ctx)
  });
})();
