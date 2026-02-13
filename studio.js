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

  function isTouchLike_(e) {
    try {
      return (e && e.pointerType === "touch") || (navigator.maxTouchPoints > 0);
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

  function parseViewBox_(svg) {
    const vb = (svg.getAttribute("viewBox") || "").trim();
    if (!vb) return null;
    const parts = vb.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
    if (parts.length !== 4) return null;
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }

  function unionBBox_(a, b) {
    if (!a) return b;
    if (!b) return a;
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function computeContentBBox_(svg) {
    const nodes = Array.from(svg.querySelectorAll("[data-id]"));
    const list = nodes.length ? nodes : Array.from(svg.children).filter(el => el.tagName && el.tagName.toLowerCase() !== "defs");
    let box = null;

    for (const el of list) {
      try {
        const b = el.getBBox();
        if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) continue;
        if (b.width <= 0 || b.height <= 0) continue;
        box = unionBBox_(box, { x: b.x, y: b.y, w: b.width, h: b.height });
      } catch (_) {
        // ignore
      }
    }

    if (!box) {
      try {
        const b = svg.getBBox();
        if (b && b.width > 0 && b.height > 0) {
          box = { x: b.x, y: b.y, w: b.width, h: b.height };
        }
      } catch (_) {}
    }

    return box;
  }

  function maybeTightenViewBox_(svg) {
    // must be in DOM for getBBox to be reliable
    const content = computeContentBBox_(svg);
    if (!content || content.w <= 0 || content.h <= 0) return;

    const vb = parseViewBox_(svg);

    // dynamic padding: 3% of min side, clamped
    const pad = Math.max(12, Math.min(32, Math.round(Math.min(content.w, content.h) * 0.03)));

    // Decide whether to apply:
    // If there is an existing viewBox and content occupies "most" of it, don't touch.
    if (vb) {
      const occW = content.w / vb.w;
      const occH = content.h / vb.h;
      const occ = Math.min(occW, occH);

      // only tighten when content is clearly smaller than viewBox
      if (occ >= 0.88) return;
    }

    const nx = content.x - pad;
    const ny = content.y - pad;
    const nw = content.w + pad * 2;
    const nh = content.h + pad * 2;

    if (!(nw > 0 && nh > 0)) return;
    svg.setAttribute("viewBox", `${nx} ${ny} ${nw} ${nh}`);
  }

  // ---------- init ----------
  async function init(rootEl, ctx) {
    const parashaLabel = ctx?.parashaLabel || "";
    const baseUrl = ctx?.BASE_URL || "";
    const buildVersion = ctx?.BUILD_VERSION || "";
    const CONTROL_API = ctx?.CONTROL_API || "";

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
              <div class="st-dots" role="tablist" aria-label="מעבר בין ציורים"></div>
            </div>

            <div class="st-palette" aria-label="פלטת צבעים">
              <div class="st-selected">חלק נבחר: <b class="st-selName">לא נבחר</b></div>

              <div class="st-colors" aria-label="פלטת צבעים"></div>

              <div class="st-paletteActions">
                <button type="button" class="st-btn st-undo" disabled aria-disabled="true" title="בטל פעולה אחרונה" aria-label="בטל פעולה אחרונה">↶</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `.trim();

    const elStatus = rootEl.querySelector(".st-status");
    const elCanvas = rootEl.querySelector(".st-canvas");
    const elDots = rootEl.querySelector(".st-dots");

    const btnLevel1 = rootEl.querySelector('.st-level[data-level="1"]');
    const btnLevel2 = rootEl.querySelector('.st-level[data-level="2"]');
    const btnReset = rootEl.querySelector(".st-reset");
    const btnPrint = rootEl.querySelector(".st-print");
    const btnUndo = rootEl.querySelector(".st-undo");

    const elColors = rootEl.querySelector(".st-colors");
    const elSelName = rootEl.querySelector(".st-selName");

    const palette = [
      "#facc15", "#f59e0b", "#fb923c", "#ef4444", "#fb7185",
      "#ec4899", "#f472b6", "#a78bfa", "#8b5cf6", "#7c3aed",
      "#60a5fa", "#3b82f6", "#2563eb", "#0ea5e9", "#06b6d4",
      "#14b8a6", "#22c55e", "#16a34a", "#84cc16", "#a16207",
      "#7c2d12", "#e2e8f0", "#94a3b8", "#64748b", "#334155", "#111827"
    ];

    const state = {
      level: 1,
      index: 0,
      currentSlug: model.slugs[0],
      currentSvg: null,

      currentColor: palette[0],
      userPickedColor: false, // ✅ בתחילה אין ✓

      hoverRegion: null,    // desktop hint only
      selectedRegion: null, // locked selection

      undoStack: [],

      // ✅ touch zoom/pan (mobile): internal zoom on the canvas only
      zoom: { enabled: false, scale: 1, tx: 0, ty: 0 },
      zoomEl: null
    };

    let statusTimer = null;
    function setStatus_(text) { elStatus.textContent = text || ""; }
    function clearStatus_() {
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
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

    function paintSelectedWithColor_(color) {
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
      if (!rec) { setUndoEnabled_(false); return; }

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
          state.userPickedColor = true;
          updatePaletteOn_();

          if (state.selectedRegion) paintSelectedWithColor_(c);
        });
        elColors.appendChild(b);
        colorButtons.push(b);
      });

      updatePaletteOn_();
    }

    function updatePaletteOn_() {
      colorButtons.forEach((b) => {
        b.classList.remove("is-on");
        b.classList.remove("is-picked");
      });

      if (!state.userPickedColor) return;

      const idx = palette.indexOf(state.currentColor);
      if (idx >= 0 && colorButtons[idx]) {
        colorButtons[idx].classList.add("is-on");
        colorButtons[idx].classList.add("is-picked");
      }
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
          resetZoom_();
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
      resetZoom_();

      state.userPickedColor = false;
      if (resetColor) state.currentColor = palette[0];
      updatePaletteOn_();
    }

    function setLevel_(lvl) {
      lvl = (lvl === 2) ? 2 : 1;
      if (state.level === lvl) return;

      state.level = lvl;
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
      clearStatus_();
      clearHover_();
      clearSelected_();
      clearUndo_();
      resetZoom_();
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

    // ---- zoom/pan (touch) ----
    function clamp_(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function applyZoomTransform_() {
      if (!state.zoomEl) return;
      const z = state.zoom;
      state.zoomEl.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale})`;
    }

    function resetZoom_() {
      state.zoom.scale = 1;
      state.zoom.tx = 0;
      state.zoom.ty = 0;
      applyZoomTransform_();
    }

    function enableTouchZoom_IfNeeded_() {
      const enable = (navigator.maxTouchPoints > 0);
      state.zoom.enabled = !!enable;
      if (state.zoom.enabled) {
        // prevent page pinch-zoom / scroll while interacting inside canvas
        elCanvas.style.touchAction = "none";
      } else {
        elCanvas.style.touchAction = "";
      }
    }

    function bindTouchZoomPan_(canvasEl) {
      // bind once
      let bound = false;
      return function ensureBound_() {
        if (bound) return;
        bound = true;

        const pointers = new Map(); // id -> {x,y}
        let pinchStart = null;      // {dist, midX, midY, scale0, tx0, ty0}
        let panStart = null;        // {x,y, tx0, ty0, moved}
        const TAP_MOVE_PX = 6;

        function dist_(a, b) {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          return Math.hypot(dx, dy);
        }
        function mid_(a, b) {
          return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }

        function onDown(e) {
          if (!state.zoom.enabled) return;
          if (!isTouchLike_(e)) return;

          try { canvasEl.setPointerCapture(e.pointerId); } catch (_) {}

          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

          if (pointers.size === 2) {
            const arr = Array.from(pointers.values());
            const m = mid_(arr[0], arr[1]);
            pinchStart = {
              dist: Math.max(1, dist_(arr[0], arr[1])),
              midX: m.x,
              midY: m.y,
              scale0: state.zoom.scale,
              tx0: state.zoom.tx,
              ty0: state.zoom.ty
            };
            panStart = null;
          } else if (pointers.size === 1) {
            panStart = {
              x: e.clientX,
              y: e.clientY,
              tx0: state.zoom.tx,
              ty0: state.zoom.ty,
              moved: false
            };
          }
        }

        function onMove(e) {
          if (!state.zoom.enabled) return;
          if (!isTouchLike_(e)) return;
          if (!pointers.has(e.pointerId)) return;

          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

          // pinch
          if (pointers.size === 2 && pinchStart) {
            const arr = Array.from(pointers.values());
            const d = Math.max(1, dist_(arr[0], arr[1]));
            const m = mid_(arr[0], arr[1]);

            const factor = d / pinchStart.dist;
            const newScale = clamp_(pinchStart.scale0 * factor, 1, 4);

            // keep midpoint stable in screen coords
            const s0 = pinchStart.scale0;
            const s1 = newScale;
            const tx0 = pinchStart.tx0;
            const ty0 = pinchStart.ty0;

            const mx0 = pinchStart.midX;
            const my0 = pinchStart.midY;

            const mx1 = m.x;
            const my1 = m.y;

            // translate so that content under midpoint stays under finger (approx)
            const nx = mx1 - (mx0 - tx0) * (s1 / s0);
            const ny = my1 - (my0 - ty0) * (s1 / s0);

            state.zoom.scale = newScale;
            state.zoom.tx = nx;
            state.zoom.ty = ny;

            applyZoomTransform_();
            return;
          }

          // pan (only when zoomed in)
          if (pointers.size === 1 && panStart) {
            if (state.zoom.scale <= 1) return;

            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;

            if (Math.abs(dx) > TAP_MOVE_PX || Math.abs(dy) > TAP_MOVE_PX) {
              panStart.moved = true;
            }

            state.zoom.tx = panStart.tx0 + dx;
            state.zoom.ty = panStart.ty0 + dy;
            applyZoomTransform_();
          }
        }

        function onUp(e) {
          if (!state.zoom.enabled) return;
          if (!isTouchLike_(e)) return;

          pointers.delete(e.pointerId);

          if (pointers.size < 2) {
            pinchStart = null;
          }
          if (pointers.size === 0) {
            panStart = null;
          }
        }

        canvasEl.addEventListener("pointerdown", onDown, { passive: true });
        canvasEl.addEventListener("pointermove", onMove, { passive: true });
        canvasEl.addEventListener("pointerup", onUp, { passive: true });
        canvasEl.addEventListener("pointercancel", onUp, { passive: true });
      };
    }

    const ensureTouchZoomPanBound_ = bindTouchZoomPan_(elCanvas);

    // ---- global wiring ----
    let globalBound = false;
    function bindGlobalOnce_() {
      if (globalBound) return;
      globalBound = true;

      rootEl.addEventListener("pointerdown", (e) => {
        const inSvg = e.target && e.target.closest && e.target.closest(".st-canvas svg");
        const inPalette = e.target && e.target.closest && e.target.closest(".st-palette");
        if (!inSvg && !inPalette) {
          clearStatus_();
          clearHover_();
          clearSelected_();
        }
      }, { passive: true });
    }

    function attachRegionHandlers_(svgEl) {
      // Desktop: hover hint only
      svgEl.addEventListener("pointermove", (e) => {
        if (isTouchLike_(e)) return;
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

      svgEl.addEventListener("pointerleave", (e) => {
        if (isTouchLike_(e)) return;
        clearHover_();
      });

      // Click/tap selects ONLY (no immediate paint)
      svgEl.addEventListener("pointerdown", (e) => {
        const t = e.target;
        if (!t || !(t instanceof Element)) return;

        // Touch: when zoomed-in, allow pan without breaking selection:
        // treat as tap selection only if no movement occurred (handled by pointerup below)
        if (isTouchLike_(e) && state.zoom.enabled && state.zoom.scale > 1) {
          // mark candidate for tap
          const region0 = t.closest("[data-id]");
          if (!region0) return;

          const x0 = e.clientX, y0 = e.clientY;
          const id0 = e.pointerId;
          let moved = false;

          function onMoveOnce(ev) {
            if (ev.pointerId !== id0) return;
            const dx = ev.clientX - x0;
            const dy = ev.clientY - y0;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
          }

          function onUpOnce(ev) {
            if (ev.pointerId !== id0) return;
            svgEl.removeEventListener("pointermove", onMoveOnce);
            svgEl.removeEventListener("pointerup", onUpOnce);
            svgEl.removeEventListener("pointercancel", onUpOnce);

            if (moved) return; // it was a pan
            clearStatus_();
            clearHover_();
            setSelected_(region0);
          }

          svgEl.addEventListener("pointermove", onMoveOnce, { passive: true });
          svgEl.addEventListener("pointerup", onUpOnce, { passive: true });
          svgEl.addEventListener("pointercancel", onUpOnce, { passive: true });
          return;
        }

        const region = t.closest("[data-id]");
        if (!region) return;

        clearStatus_();
        clearHover_();
        setSelected_(region);
      }, { passive: true });
    }

    async function loadAndShow_() {
      elCanvas.innerHTML = "טוען ציור...";

      clearStatus_();
      clearHover_();
      clearSelected_();
      clearUndo_();
      resetZoom_();

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

      // ✅ internal zoom wrapper (canvas only) — keeps palette in place while zooming on mobile
      const zoomBox = document.createElement("div");
      zoomBox.className = "st-zoom";
      zoomBox.style.width = "100%";
      zoomBox.style.height = "100%";
      zoomBox.style.transformOrigin = "0 0";
      zoomBox.style.willChange = "transform";
      zoomBox.style.display = "flex";
      zoomBox.style.alignItems = "center";
      zoomBox.style.justifyContent = "center";

      zoomBox.appendChild(svg);
      elCanvas.appendChild(zoomBox);

      state.zoomEl = zoomBox;

      // ✅ תיקון אוטומטי לשוליים גדולים ב־SVG
      // חייב להיות אחרי append (כדי ש־getBBox יעבוד בצורה אמינה)
      try { maybeTightenViewBox_(svg); } catch (_) {}

      state.currentSvg = svg;

      // enable + bind touch zoom/pan (mobile) once
      enableTouchZoom_IfNeeded_();
      ensureTouchZoomPanBound_();

      bindGlobalOnce_();
      attachRegionHandlers_(svg);
      applyZoomTransform_();
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
