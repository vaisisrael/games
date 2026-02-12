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
  const STORAGE_PREFIX = "pg_studio_v1";

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

  function storageKey_(parashaLabel, slug, level) {
    return `${STORAGE_PREFIX}::${safeText_(parashaLabel)}::${safeText_(slug)}::L${level}`;
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
    // BASE_URL כבר מסתיים ב-/games/ ולכן כאן רק studio/...
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

    // ensure fill="none" default
    svg.querySelectorAll("[data-id]").forEach(el => {
      if (!el.getAttribute("fill")) el.setAttribute("fill", "none");
    });

    return svg;
  }

  function readStateFromSvg_(svgEl) {
    const out = {};
    svgEl.querySelectorAll("[data-id]").forEach(el => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      const fill = el.getAttribute("fill");
      out[id] = (fill && fill !== "none") ? String(fill) : null;
    });
    return out;
  }

  function applyStateToSvg_(svgEl, stateObj) {
    const state = stateObj || {};
    svgEl.querySelectorAll("[data-id]").forEach(el => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      const val = state[id];
      if (val) el.setAttribute("fill", String(val));
      else el.setAttribute("fill", "none");
    });
  }

  function loadSavedState_(parashaLabel, slug, level) {
    try {
      const key = storageKey_(parashaLabel, slug, level);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function saveState_(parashaLabel, slug, level, stateObj) {
    try {
      const key = storageKey_(parashaLabel, slug, level);
      localStorage.setItem(key, JSON.stringify(stateObj || {}));
    } catch (_) {}
  }

  function clearState_(parashaLabel, slug, level) {
    try {
      const key = storageKey_(parashaLabel, slug, level);
      localStorage.removeItem(key);
    } catch (_) {}
  }

  // ---------- init ----------
  async function init(rootEl, ctx) {
    const parashaLabel = ctx?.parashaLabel || "";
    const controlRow = ctx?.controlRow || {};
    const baseUrl = ctx?.BASE_URL || "";
    const buildVersion = ctx?.BUILD_VERSION || "";
    const CONTROL_API = ctx?.CONTROL_API || "";

    // ✅ תיקון 2: DATA נמשך מה-Apps Script דרך CONTROL_API (ולא דרך BASE_URL)
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
    } catch (e) {
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

              <button type="button" class="st-btn st-erase" aria-pressed="false">מחק צבע לחלק</button>
              <button type="button" class="st-btn st-reset">איפוס הכל</button>
              <button type="button" class="st-btn st-print">הדפסה</button>
            </div>

            <div class="st-status" aria-live="polite"></div>
          </div>

          <div class="st-layout">
            <div class="st-main">
              <div class="st-header">
                <p class="st-title"></p>
                <p class="st-sub"></p>
              </div>

              <div class="st-canvas" aria-label="ציור לצביעה"></div>
            </div>

            <aside class="st-side" aria-label="בחירת ציור וצבעים">
              <div class="st-thumbBox">
                <div class="st-thumb" aria-label="תמונה ממוזערת"></div>
              </div>

              <div class="st-dots" role="tablist" aria-label="מעבר בין ציורים"></div>

              <div class="st-palette">
                <p class="st-paletteTitle">בחר צבע</p>
                <div class="st-colors" aria-label="פלטת צבעים"></div>
                <div class="st-hint">לחץ על אזור כדי לצבוע. במצב מחיקה — לחץ כדי להחזיר לשקוף.</div>
              </div>
            </aside>
          </div>

        </div>
      </div>
    `.trim();

    const elTitle = rootEl.querySelector(".st-title");
    const elSub = rootEl.querySelector(".st-sub");
    const elStatus = rootEl.querySelector(".st-status");

    const elCanvas = rootEl.querySelector(".st-canvas");
    const elThumb = rootEl.querySelector(".st-thumb");
    const elDots = rootEl.querySelector(".st-dots");

    const btnLevel1 = rootEl.querySelector('.st-level[data-level="1"]');
    const btnLevel2 = rootEl.querySelector('.st-level[data-level="2"]');
    const btnErase = rootEl.querySelector(".st-erase");
    const btnReset = rootEl.querySelector(".st-reset");
    const btnPrint = rootEl.querySelector(".st-print");

    const elColors = rootEl.querySelector(".st-colors");

    // state
    const state = {
      level: 1,
      index: 0,
      currentSlug: model.slugs[0],
      currentSvg: null,
      eraseMode: false,
      currentColor: "#60a5fa",
      ready: false
    };

    const palette = [
      "#111827",
      "#94a3b8",
      "#ef4444",
      "#f97316",
      "#facc15",
      "#22c55e",
      "#14b8a6",
      "#60a5fa",
      "#a78bfa",
      "#f472b6"
    ];

    function updateHeader_() {
      const pName = model.parashaName ? `(${model.parashaName})` : "";
      elTitle.textContent = `🎨 סטודיו לצביעה ${pName}`.trim();

      const human = `ציור ${state.index + 1} מתוך ${model.slugs.length}`;
      const lvl = state.level === 2 ? "מקצוען" : "מתחיל";
      elSub.textContent = `${human} | רמה: ${lvl}`;
    }

    function setStatus_(text) {
      elStatus.textContent = text || "";
    }

    // palette UI
    const colorButtons = [];
    function buildPalette_() {
      elColors.innerHTML = "";
      palette.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "st-color";
        b.style.background = c;
        b.setAttribute("aria-label", "צבע");
        b.addEventListener("click", () => {
          state.currentColor = c;
          state.eraseMode = false;
          btnErase.classList.remove("is-on");
          btnErase.setAttribute("aria-pressed", "false");
          updatePaletteOn_();
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

    // painting
    function attachPaintHandlers_(svgEl) {
      svgEl.addEventListener("click", (e) => {
        const target = e.target;
        if (!target || !(target instanceof Element)) return;
        const region = target.closest("[data-id]");
        if (!region) return;

        const id = region.getAttribute("data-id");
        if (!id) return;

        if (state.eraseMode) {
          region.setAttribute("fill", "none");
        } else {
          region.setAttribute("fill", state.currentColor);
        }

        const obj = readStateFromSvg_(svgEl);
        saveState_(model.parashaLabel, state.currentSlug, state.level, obj);
      });
    }

    function setLevel_(lvl) {
      lvl = (lvl === 2) ? 2 : 1;
      if (state.level === lvl) return;
      state.level = lvl;

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

    btnErase.addEventListener("click", () => {
      state.eraseMode = !state.eraseMode;
      btnErase.classList.toggle("is-on", state.eraseMode);
      btnErase.setAttribute("aria-pressed", state.eraseMode ? "true" : "false");
      if (state.eraseMode) setStatus_("מצב מחיקה: לחץ על אזור כדי להחזיר לשקוף");
      else setStatus_("");
    });

    btnReset.addEventListener("click", () => {
      if (!state.currentSvg) return;
      state.currentSvg.querySelectorAll("[data-id]").forEach(el => el.setAttribute("fill", "none"));
      clearState_(model.parashaLabel, state.currentSlug, state.level);
      setStatus_("אופס… איפסנו את הציור הנוכחי 🙂");
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

    async function loadAndShow_() {
      state.ready = false;
      elCanvas.innerHTML = "טוען ציור...";
      elThumb.innerHTML = "";

      updateHeader_();
      setStatus_("");

      const slug = state.currentSlug;
      const lvl = state.level;

      const svgText = await fetchSvgText_(model.baseUrl, model.buildVersion, slug, lvl);
      const svg = extractInlineSvg_(svgText);
      if (!svg) {
        elCanvas.innerHTML = "שגיאה: SVG לא תקין.";
        return;
      }

      const saved = loadSavedState_(model.parashaLabel, slug, lvl);
      if (saved) applyStateToSvg_(svg, saved);

      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      elCanvas.innerHTML = "";
      elCanvas.appendChild(svg);

      const thumbSvg = svg.cloneNode(true);
      thumbSvg.querySelectorAll("[data-id]").forEach(el => {
        const f = el.getAttribute("fill");
        if (f && f !== "none") el.setAttribute("fill-opacity", "0.55");
      });
      elThumb.innerHTML = "";
      elThumb.appendChild(thumbSvg);

      state.currentSvg = svg;
      attachPaintHandlers_(svg);

      state.ready = true;
    }

    buildPalette_();
    buildDots_();
    updateHeader_();

    loadAndShow_().catch(() => {
      elCanvas.innerHTML = "שגיאה בטעינת הציור.";
    });

    return {
      reset: () => {
        state.eraseMode = false;
        btnErase.classList.remove("is-on");
        btnErase.setAttribute("aria-pressed", "false");
        setStatus_("");
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
