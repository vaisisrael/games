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

  function parseCsvList(s) {
    return String(s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }

  function safeText_(s) {
    return String(s == null ? "" : s).trim();
  }

  function parsestudioCell_(raw) {
    const s = safeText_(raw);
    if (!s) return { parashaName: "", slugs: [] };

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

    const scripts = svg.querySelectorAll("script");
    scripts.forEach(s => s.remove());

    svg.querySelectorAll("[data-id]").forEach(el => {
      const f = el.getAttribute("fill");
      if (!f || f === "none") el.setAttribute("fill", "transparent");
    });

    return svg;
  }

  async function init(rootEl, ctx) {
    const parashaLabel = ctx?.parashaLabel || "";
    const baseUrl = ctx?.BASE_URL || "";
    const buildVersion = ctx?.BUILD_VERSION || "";
    const CONTROL_API = ctx?.CONTROL_API || "";

    let cell = { parashaName: "", slugs: [] };
    let names = [];

    try {
      const apiUrl = withVersion_(
        `${CONTROL_API}?mode=studio&parasha=${encodeURIComponent(parashaLabel)}`,
        buildVersion
      );
      const res = await fetch(apiUrl, { cache: "no-store" });
      const data = await res.json();

      const raw = data?.row?.studio_slugs || "";
      const rawNames = data?.row?.studio_names || "";

      cell = parsestudioCell_(raw);
      names = parseCsvList(rawNames);

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
      names,
      baseUrl,
      buildVersion
    });
  }

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

              <!-- ✅ שם הציור -->
              <div class="st-btn st-figureTitle" style="cursor:default;display:block;text-align:center;margin:4px 0 6px"></div>

              <div class="st-canvas" aria-label="ציור לצביעה"></div>
              <div class="st-dots" role="tablist" aria-label="מעבר בין ציורים"></div>
            </div>

            <div class="st-palette" aria-label="פלטת צבעים">
              <div class="st-selected">חלק נבחר: <b class="st-selName">לא נבחר</b></div>
              <div class="st-colors"></div>
              <div class="st-paletteActions">
                <button type="button" class="st-btn st-undo" disabled>↶</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `.trim();

    const elCanvas = rootEl.querySelector(".st-canvas");
    const elDots = rootEl.querySelector(".st-dots");
    const elTitle = rootEl.querySelector(".st-figureTitle");

    const btnLevel1 = rootEl.querySelector('[data-level="1"]');
    const btnLevel2 = rootEl.querySelector('[data-level="2"]');

    const state = {
      level: 1,
      index: 0,
      currentSlug: model.slugs[0],
      currentSvg: null
    };

    function updateTitle_(){
      elTitle.textContent =
        model.names[state.index] ||
        model.slugs[state.index] ||
        "";
    }

    function buildDots_() {
      elDots.innerHTML = "";
      model.slugs.forEach((slug, i) => {
        const d = document.createElement("button");
        d.className = "st-dot" + (i===0?" is-on":"");
        d.addEventListener("click",()=>{
          if(i===state.index) return;
          state.index=i;
          state.currentSlug=model.slugs[i];
          updateTitle_();
          loadAndShow_();
          refreshDots_();
        });
        elDots.appendChild(d);
      });
    }

    function refreshDots_(){
      const dots=elDots.querySelectorAll(".st-dot");
      dots.forEach((d,i)=>d.classList.toggle("is-on",i===state.index));
    }

    async function loadAndShow_(){
      elCanvas.innerHTML="טוען ציור...";
      const svgText=await fetchSvgText_(model.baseUrl,model.buildVersion,state.currentSlug,state.level);
      const svg=extractInlineSvg_(svgText);
      elCanvas.innerHTML="";
      elCanvas.appendChild(svg);
      state.currentSvg=svg;
    }

    btnLevel1.onclick=()=>{state.level=1;loadAndShow_();}
    btnLevel2.onclick=()=>{state.level=2;loadAndShow_();}

    buildDots_();
    updateTitle_();
    loadAndShow_();

    return { reset(){} };
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
