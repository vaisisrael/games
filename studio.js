```js
/* קובץ מלא: studio.js – Parasha "סטודיו" (studio / Studio)
   מקור הנתונים:
     - גיליון 1: controlRow.studio = yes/no או true/false (הדלקה בלבד)
     - גיליון "studio" דרך Apps Script: mode=studio → row.studio_slugs (רשימת slugs)

   קבצי SVG ב-GitHub (תיקיית סטודיו בתוך /games):
     BASE_URL הוא .../games/
     ולכן הנתיב כאן הוא: /studio/<slug>_l1.svg  (וגם l2)
*/

(() => {
  "use strict";

  const GAME_ID = "studio";

  // ---------- helpers ----------
  function parseCsvList(s) {
    return String(s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function safeText_(s) {
    return String(s == null ? "" : s).trim();
  }

  function escapeHtml_(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parsestudioCell_(raw) {
    const s = safeText_(raw);
    if (!s) return { parashaName: "", slugs: [] };

    // allow "שם פרשה | a,b" OR "a,b"
    const parts = s.split("|");
    if (parts.length >= 2) {
      const parashaName = safeText_(parts[0]);
      const slugs = parseCsvList(parts.slice(1).join("|"));
      return { parashaName, slugs };
    }
    return { parashaName: "", slugs: parseCsvList(s) };
  }

  function withVersion_(url, buildVersion) {
    try {
      const u = new URL(url, window.location.href);
      if (buildVersion) u.searchParams.set("v", String(buildVersion));
      return u.toString();
    } catch (_) {
      return url;
    }
  }

  async function fetchSvgText_(baseUrl, buildVersion, slug, level) {
    const file = `studio/${slug}_l${level}.svg`;
    const url = withVersion_(String(baseUrl || "") + file, buildVersion);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load SVG: " + url);
    return await res.text();
  }

  function extractInlineSvg_(svgText) {
    const tmp = document.createElement("div");
    tmp.innerHTML = svgText;
    const svg = tmp.querySelector("svg");
    if (!svg) return null;

    // remove scripts if any
    const scripts = svg.querySelectorAll("script");
    scripts.forEach(s => s.remove());

    // default transparent fill for tappable regions
    svg.querySelectorAll("[data-id]").forEach(el => {
      const f = el.getAttribute("fill");
      if (!f || f === "none") el.setAttribute("fill", "transparent");
    });

    return svg;
  }

  function isTouchLike_() {
    try {
      return navigator.maxTouchPoints > 0;
    } catch (_) {
      return false;
    }
  }

  function getFill_(el) {
    const f = el.getAttribute("fill");
    return (f == null ? "transparent" : String(f));
  }

  function setFill_(el, fill) {
    el.setAttribute("fill", fill == null ? "transparent" : String(fill));
  }

  // ---------- init ----------
  async function init(rootEl, ctx) {
    const parashaLabel = ctx?.parashaLabel || "";
    const baseUrl = ctx?.BASE_URL || "";
    const buildVersion = ctx?.BUILD_VERSION || "";
    const CONTROL_API = ctx?.CONTROL_API || "";

    // DATA נמשך מה-Apps Script דרך CONTROL_API
    let cell = { parashaName: "", slugs: [] };
    try {
      const apiUrl = withVersion_(
        `${CONTROL_API}?mode=studio&parasha=${encodeURIComponent(parashaLabel)}`,
        buildVersion
      );
      const res = await fetch(apiUrl, { cache: "no-store" });
      const data = await res.json();
      const raw = data?.row?.studio_slugs || "";
      cell = parsestudioCell_(raw);
    } catch (_) {
      rootEl.innerHTML = `<div>שגיאה בקבלת נתוני סטודיו.</div>`;
      return { reset: () => {} };
    }

    const slugs = (cell.slugs || []).filter(Boolean);
    if (!slugs.length) {
      rootEl.innerHTML = `<div>לא נמצאו ציורים ל"סטודיו" בפרשה זו.</div>`;
      return { reset: () => {} };
    }

    return render(rootEl, {
      parashaLabel,
      parashaName: cell.parashaName,
      slugs,
      baseUrl,
      buildVersion
    });
  }

  // ---------- UI ----------
  function render(rootEl, model) {
    rootEl.innerHTML = `
      <div class="st-wrap">
        <div class="st-cardbox">

          <div class="st-topbar">
            <div class="st-actions">
              <button type="button" class="st-btn st-level is-on" data-level="1" aria-pressed="true">מתחיל</button>
              <button type="button" class="st-btn st-level" data-level="2" aria-pressed="false">מקצוען</button>
              <button type="button" class="st-btn st-reset">איפוס</button>
              <button type="button" class="st-btn st-print">הדפסה</button>
            </div>

            <div class="st-status" aria-live="polite"></div>
          </div>

          <div class="st-layout">
            <div class="st-main">
              <div class="st-canvas" aria-label="ציור לצביעה"></div>
            </div>

            <aside class="st-side" aria-label="בחירת ציור וצבעים">
              <div class="st-thumbBox">
                <div class="st-thumb" aria-label="תמונה ממוזערת"></div>
              </div>

              <div class="st-dots" role="tablist" aria-label="מעבר בין ציורים"></div>

              <div class="st-palette">
                <div class="st-selected">חלק נבחר: <b class="st-selName">לא נבחר</b></div>

                <div class="st-colors" aria-label="פלטת צבעים"></div>

                <div class="st-paletteActions">
                  <button type="button" class="st-btn st-undo" disabled aria-disabled="true" title="בטל פעולה אחרונה" aria-label="בטל פעולה אחרונה">
                    ↶ <span class="st-undoText">בטל</span>
                  </button>
                </div>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `.trim();

    const elStatus = rootEl.querySelector(".st-status");

    const elCanvas = rootEl.querySelector(".st-canvas");
    const elThumb = rootEl.querySelector(".st-thumb");
    const elDots = rootEl.querySelector(".st-dots");

    const btnLevel1 = rootEl.querySelector('.st-level[data-level="1"]');
    const btnLevel2 = rootEl.querySelector('.st-level[data-level="2"]');
    const btnReset = rootEl.querySelector(".st-reset");
    const btnPrint = rootEl.querySelector(".st-print");
    const btnUndo = rootEl.querySelector(".st-undo");

    const elColors = rootEl.querySelector(".st-colors");
    const elSelName = rootEl.querySelector(".st-selName");

    // Ordered palette: neutrals → warm → pink/purple → blues → greens → browns
    const palette = [
      // neutrals
      "#ffffff", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#111827",
      // warm
      "#fde047", "#facc15", "#f59e0b", "#fb923c", "#ef4444",
      // pink / purple
      "#fb7185", "#ec4899", "#f472b6", "#a78bfa", "#8b5cf6", "#7c3aed",
      // blues / cyan
      "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#0ea5e9", "#06b6d4",
      // greens
      "#86efac", "#22c55e", "#16a34a", "#14b8a6", "#84cc16",
      // browns
      "#a16207", "#7c2d12"
    ];

    // state
    const state = {
      level: 1,
      index: 0,
      currentSlug: model.slugs[0],
      currentSvg: null,

      // color
      currentColor: palette[0],

      // selection
      selectedRegion: null,   // locked selection (click/tap)
      hoverRegion: null,      // optional hover highlight

      // undo
      undoStack: []           // { id, prevFill, nextFill }
    };

    let statusTimer = null;
    function setStatus_(text) {
      elStatus.textContent = text || "";
    }
    function clearStatus_() {
      if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
      }
      setStatus_("");
    }
    function setStatusAutoClear_(text, ms) {
      clearStatus_();
      setStatus_(text);
      statusTimer = setTimeout(() => {
        setStatus_("");
        statusTimer = null;
      }, Math.max(250, Number(ms || 1600)));
    }

    function setUndoEnabled_(on) {
      const enabled = !!on;
      btnUndo.disabled = !enabled;
      btnUndo.setAttribute("aria-disabled", enabled ? "false" : "true");
    }

    function clearUndo_() {
      state.undoStack = [];
      setUndoEnabled_(false);
    }

    function clearHover_() {
      if (state.hoverRegion && state.hoverRegion !== state.selectedRegion) {
        state.hoverRegion.classList.remove("is-hover");
      }
      state.hoverRegion = null;
    }

    function setSelected_(regionEl) {
      if (state.selectedRegion && state.selectedRegion !== regionEl) {
        state.selectedRegion.classList.remove("is-selected");
      }
      state.selectedRegion = regionEl || null;
      if (state.selectedRegion) state.selectedRegion.classList.add("is-selected");
      renderSelectedName_();
    }

    function clearSelected_() {
      if (state.selectedRegion) state.selectedRegion.classList.remove("is-selected");
      state.selectedRegion = null;
      renderSelectedName_();
    }

    function renderSelectedName_() {
      const el = state.selectedRegion;
      if (!el) {
        elSelName.textContent = "לא נבחר";
        return;
      }
      elSelName.textContent =
        el.getAttribute("data-name") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("data-id") ||
        "חלק";
    }

    function paintSelected_(color) {
      const el = state.selectedRegion;
      if (!state.currentSvg || !el) return;

      const prev = getFill_(el);
      const next = String(color);
      if (prev === next) return;

      setFill_(el, next);

      const id = el.getAttribute("data-id") || "";
      state.undoStack.push({ id, prevFill: prev, nextFill: next });
      setUndoEnabled_(state.undoStack.length > 0);

      clearStatus_();
    }

    function undoLast_() {
      if (!state.currentSvg) return;
      const rec = state.undoStack.pop();
      if (!rec) {
        setUndoEnabled_(false);
        return;
      }

      const el = state.currentSvg.querySelector(`[data-id="${CSS.escape(rec.id)}"]`);
      if (el) setFill_(el, rec.prevFill);

      setUndoEnabled_(state.undoStack.length > 0);
      clearStatus_();
    }

    // palette UI
    const colorButtons = [];
    function buildPalette_() {
      elColors.innerHTML = "";
      colorButtons.length = 0;

      palette.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "st-color";
        b.style.background = c;
        b.setAttribute("aria-label", "בחר צבע");
        b.addEventListener("click", () => {
          state.currentColor = c;
          updatePaletteOn_();

          // ✅ כמו בדמו: צובעים רק בלחיצה על צבע (ואז רק אם יש חלק נבחר)
          if (state.selectedRegion) paintSelected_(c);
        });
        elColors.appendChild(b);
        colorButtons.push(b);
      });

      updatePaletteOn_();
    }

    function updatePaletteOn_() {
      colorButtons.forEach((b) => b.classList.remove("is-on"));
      const idx = palette.indexOf(state.currentColor);
      if (idx >= 0 && colorButtons[idx]) colorButtons[idx].classList.add("is-on");
    }

    // dots UI
    function buildDots_() {
      if ((model.slugs || []).length <= 1) {
        elDots.innerHTML = "";
        elDots.style.display = "none";
        return;
      }

      elDots.style.display = "";
      elDots.innerHTML = "";
      model.slugs.forEach((slug, i) => {
        const d = document.createElement("button");
        d.type = "button";
        d.className = "st-dot" + (i === state.index ? " is-on" : "");
        d.setAttribute("aria-label", "בחירת ציור");
        d.setAttribute("role", "tab");
        d.setAttribute("aria-selected", i === state.index ? "true" : "false");
        d.addEventListener("click", () => {
          if (i === state.index) return;
          clearStatus_();
          clearHover_();
          clearSelected_();
          clearUndo_();
          state.index = i;
          state.currentSlug = model.slugs[i];
          refreshDots_();
          loadAndShow_().catch(() => {});
        });
        elDots.appendChild(d);
      });
    }

    function refreshDots_() {
      const dots = Array.from(elDots.querySelectorAll(".st-dot"));
      dots.forEach((d, i) => {
        const on = (i === state.index);
        d.classList.toggle("is-on", on);
        d.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function hardResetUiState_({ resetColor } = {}) {
      clearStatus_();
      clearHover_();
      clearSelected_();
      clearUndo_();
      if (resetColor) {
        state.currentColor = palette[0];
        updatePaletteOn_();
      }
    }

    function setLevel_(lvl) {
      lvl = (lvl === 2) ? 2 : 1;
      if (state.level === lvl) return;

      state.level = lvl;

      // ✅ במעבר רמה: איפוס מלא
      hardResetUiState_({ resetColor: true });

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

      loadAndShow_().catch(() => {});
    }

    btnLevel1.addEventListener("click", () => setLevel_(1));
    btnLevel2.addEventListener("click", () => setLevel_(2));

    btnUndo.addEventListener("click", () => {
      if (btnUndo.disabled) return;
      undoLast_();
    });

    btnReset.addEventListener("click", () => {
      if (!state.currentSvg) return;
      state.currentSvg.querySelectorAll("[data-id]").forEach(el => setFill_(el, "transparent"));
      // איפוס לא משנה צבע נבחר (רק ציור)
      clearStatus_();
      clearHover_();
      clearSelected_();
      clearUndo_();
      setStatusAutoClear_("אופס… איפסנו את הציור הנוכחי 🙂", 1500);
    });

    btnPrint.addEventListener("click", () => {
      if (!state.currentSvg) return;
      try {
        const w = window.open("", "_blank");
        if (!w) return;

        const svgOuter = state.currentSvg.outerHTML;

        w.document.open();
        w.document.write(`
<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>סטודיו – הדפסה</title>
<style>
  body{ margin: 0; padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", Arial; }
  .wrap{ max-width: 980px; margin: 0 auto; }
  .cap{ font-weight: 900; margin: 0 0 12px; color:#111827; }
  svg{ width: 100%; height: auto; display:block; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="cap">סטודיו לצביעה – ${escapeHtml_(model.parashaLabel)} – ${escapeHtml_(state.currentSlug)} – רמה ${state.level}</p>
    ${svgOuter}
  </div>
</body>
</html>
        `.trim());
        w.document.close();
        w.focus();
        w.print();
      } catch (_) {}
    });

    let globalBound = false;
    function bindGlobalOnce_() {
      if (globalBound) return;
      globalBound = true;

      // click outside: deselect + clear status
      rootEl.addEventListener("pointerdown", (e) => {
        const inSvg = e.target && e.target.closest && e.target.closest(".st-canvas svg");
        const inPanel = e.target && e.target.closest && e.target.closest(".st-side");
        if (!inSvg && !inPanel) {
          clearStatus_();
          clearHover_();
          clearSelected_();
        }
      }, { passive: true });
    }

    function attachRegionHandlers_(svgEl) {
      // hover is only highlight/hint (not target)
      svgEl.addEventListener("pointermove", (e) => {
        if (isTouchLike_()) return;
        const t = e.target;
        if (!t || !(t instanceof Element)) return;
        const region = t.closest("[data-id]");
        if (!region) {
          clearHover_();
          return;
        }

        if (state.hoverRegion && state.hoverRegion !== region) {
          if (state.hoverRegion !== state.selectedRegion) state.hoverRegion.classList.remove("is-hover");
        }
        state.hoverRegion = region;
        if (state.hoverRegion !== state.selectedRegion) region.classList.add("is-hover");
      });

      svgEl.addEventListener("pointerleave", () => {
        clearHover_();
      });

      // ✅ כמו בדמו: לחיצה על חלק = בחירה בלבד (ללא צביעה מידית)
      svgEl.addEventListener("pointerdown", (e) => {
        const t = e.target;
        if (!t || !(t instanceof Element)) return;
        const region = t.closest("[data-id]");
        if (!region) return;

        clearStatus_();
        clearHover_();

        setSelected_(region);
        // אין paint כאן. הצביעה מתבצעת רק בלחיצה על צבע בפלטה.
      }, { passive: true });
    }

    async function loadAndShow_() {
      elCanvas.innerHTML = "טוען ציור...";
      elThumb.innerHTML = "";

      clearStatus_();
      clearHover_();
      clearSelected_();
      clearUndo_();

      const slug = state.currentSlug;
      const lvl = state.level;

      const svgText = await fetchSvgText_(model.baseUrl, model.buildVersion, slug, lvl);
      const svg = extractInlineSvg_(svgText);
      if (!svg) {
        elCanvas.innerHTML = "שגיאה: SVG לא תקין.";
        return;
      }

      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      elCanvas.innerHTML = "";
      elCanvas.appendChild(svg);

      // ✅ thumb תמיד נקי/לא צבוע
      const thumbSvg = svg.cloneNode(true);
      thumbSvg.querySelectorAll("[data-id]").forEach(el => {
        setFill_(el, "transparent");
        el.classList.remove("is-selected");
        el.classList.remove("is-hover");
      });
      elThumb.innerHTML = "";
      elThumb.appendChild(thumbSvg);

      state.currentSvg = svg;

      bindGlobalOnce_();
      attachRegionHandlers_(svg);
    }

    buildPalette_();
    buildDots_();
    setUndoEnabled_(false);

    loadAndShow_().catch(() => {
      elCanvas.innerHTML = "שגיאה בטעינת הציור.";
    });

    return {
      reset: () => {
        clearStatus_();
        clearHover_();
        clearSelected_();
      }
    };
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
```
