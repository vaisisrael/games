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

  // NEW: fetch inspire JSON (per slug+level)
  async function fetchInspireJson_(baseUrl, buildVersion, slug, level) {
    const file = `studio/${slug}_inspire_l${level}.json`;
    const url = withVersion_(String(baseUrl || "") + file, buildVersion);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load INSPIRE JSON: " + url);
    return await res.json();
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

  // NEW: apply inspire (zoom + fills) to an svg
  function applyInspire_(svg, inspire) {
    if (!svg || !inspire) return;

    // zoom
    const z = inspire.zoom;
    if (z && Number.isFinite(z.w) && Number.isFinite(z.h) && z.w > 0 && z.h > 0) {
      svg.setAttribute("viewBox", `${z.x} ${z.y} ${z.w} ${z.h}`);
    }

    // fills
    const pal = Array.isArray(inspire.palette) ? inspire.palette : [];
    const fills = inspire.fills && typeof inspire.fills === "object" ? inspire.fills : {};

    Object.keys(fills).forEach((id) => {
      const idx = fills[id];
      const color = pal[idx];
      if (!color) return;

      const el = svg.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.setAttribute("fill", String(color));
    });
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

      // ✅ Zoom/Pan (A): שני אצבעות בלבד לזום/הזזה, אצבע אחת תמיד בוחרת חלק
      zoom: {
        scale: 1,
        tx: 0,
        ty: 0,
        pointers: new Map(), // pointerId -> {x,y}
        gesturing: false,
        startScale: 1,
        startTx: 0,
        startTy: 0,
        startCx: 0,
        startCy: 0,
        startDist: 0
      }
    };

    // NEW: inspire button + modal refs
    const inspire = {
      btn: null,
      overlay: null,
      keyHandler: null
    };

    let statusTimer = null;
    function setStatus_(text) { elStatus.textContent = text || ""; }
    function clearStatus_() {
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
      setStatus_("");
    }
    function clearStatus_() { elStatus.textContent = ""; } // (left as-is in original behavior)
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

    // ---------- Zoom/Pan helpers (A) ----------
    function clamp_(v, min, max) {
      v = Number(v);
      if (!Number.isFinite(v)) return min;
      return Math.max(min, Math.min(max, v));
    }

    function applyZoomTransform_() {
      const svg = state.currentSvg;
      if (!svg) return;

      const z = state.zoom;
      const s = clamp_(z.scale, 1, 4);
      const tx = Number(z.tx) || 0;
      const ty = Number(z.ty) || 0;

      // apply
      svg.style.transformOrigin = "0 0";
      svg.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    }

    function resetZoom_() {
      state.zoom.scale = 1;
      state.zoom.tx = 0;
      state.zoom.ty = 0;
      state.zoom.pointers.clear();
      state.zoom.gesturing = false;
      applyZoomTransform_();
    }

    function dist2_(a, b) {
      const dx = (a.x - b.x);
      const dy = (a.y - b.y);
      return Math.sqrt(dx * dx + dy * dy);
    }

    let zoomBound = false;
    function bindZoomOnce_() {
      if (zoomBound) return;
      zoomBound = true;

      try { elCanvas.style.touchAction = "none"; } catch (_) {}

      const z = state.zoom;

      function getLocalPoint_(e) {
        const r = elCanvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }

      function center2_(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }

      function startGestureIfReady_() {
        if (z.pointers.size !== 2) return;

        const pts = Array.from(z.pointers.values());
        const a = pts[0], b = pts[1];
        const c = center2_(a, b);
        const d = dist2_(a, b);

        z.gesturing = true;
        z.startScale = z.scale;
        z.startTx = z.tx;
        z.startTy = z.ty;
        z.startCx = c.x;
        z.startCy = c.y;
        z.startDist = d || 1;
      }

      function updateGesture_() {
        if (!z.gesturing) return;
        if (z.pointers.size !== 2) return;

        const pts = Array.from(z.pointers.values());
        const a = pts[0], b = pts[1];
        const c = center2_(a, b);
        const d = dist2_(a, b) || 1;

        const newScale = clamp_(z.startScale * (d / z.startDist), 1, 4);

        const x0 = (z.startCx - z.startTx) / (z.startScale || 1);
        const y0 = (z.startCy - z.startTy) / (z.startScale || 1);

        z.scale = newScale;
        z.tx = c.x - newScale * x0;
        z.ty = c.y - newScale * y0;

        applyZoomTransform_();
      }

      function endGestureMaybe_() {
        if (z.pointers.size < 2) {
          z.gesturing = false;
        }
      }

      elCanvas.addEventListener("pointerdown", (e) => {
        if (!isTouchLike_(e)) return;
        try { elCanvas.setPointerCapture(e.pointerId); } catch (_) {}

        z.pointers.set(e.pointerId, getLocalPoint_(e));
        if (z.pointers.size === 2) startGestureIfReady_();
      }, { passive: true });

      elCanvas.addEventListener("pointermove", (e) => {
        if (!isTouchLike_(e)) return;
        if (!z.pointers.has(e.pointerId)) return;

        z.pointers.set(e.pointerId, getLocalPoint_(e));
        if (z.pointers.size === 2) updateGesture_();
      }, { passive: true });

      elCanvas.addEventListener("pointerup", (e) => {
        if (!isTouchLike_(e)) return;
        z.pointers.delete(e.pointerId);
        endGestureMaybe_();
      }, { passive: true });

      elCanvas.addEventListener("pointercancel", (e) => {
        if (!isTouchLike_(e)) return;
        z.pointers.delete(e.pointerId);
        endGestureMaybe_();
      }, { passive: true });
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

      state.userPickedColor = false;
      if (resetColor) state.currentColor = palette[0];
      updatePaletteOn_();
    }

    // ---------- Inspire (NEW) ----------
    function ensureInspireBtnPosition_() {
      if (!inspire.btn) return;
      const active = (state.level === 1) ? btnLevel1 : btnLevel2;
      try { inspire.btn.remove(); } catch (_) {}
      if (active && active.parentNode) {
        active.parentNode.insertBefore(inspire.btn, active.nextSibling); // RTL => left of active
      }
    }

    function closeInspireModal_() {
      if (inspire.keyHandler) {
        try { document.removeEventListener("keydown", inspire.keyHandler, true); } catch (_) {}
        inspire.keyHandler = null;
      }
      if (inspire.overlay) {
        try { inspire.overlay.remove(); } catch (_) {}
        inspire.overlay = null;
      }
      if (inspire.btn) inspire.btn.classList.remove("is-on");
    }

    async function openInspireModal_() {
      if (inspire.overlay) return;

      const slug = state.currentSlug;
      const lvl = state.level;

      const overlay = document.createElement("div");
      overlay.className = "st-modalOverlay";
      overlay.innerHTML = `
        <div class="st-modal" role="dialog" aria-modal="true" aria-label="השראה לצביעה">
          <div class="st-modalTop">
            <button type="button" class="st-btn st-modalClose" aria-label="סגור השראה">סגור</button>
            <div class="st-modalTitle">השראה לצביעה</div>
          </div>
          <div class="st-modalBody">
            <div class="st-modalStage">טוען השראה...</div>
          </div>
        </div>
      `.trim();

      const btnClose = overlay.querySelector(".st-modalClose");
      const stage = overlay.querySelector(".st-modalStage");

      btnClose.addEventListener("click", (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        closeInspireModal_();
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeInspireModal_();
      });

      inspire.keyHandler = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeInspireModal_();
        }
      };
      document.addEventListener("keydown", inspire.keyHandler, true);

      inspire.overlay = overlay;
      document.body.appendChild(overlay);

      if (inspire.btn) inspire.btn.classList.add("is-on");

      try {
        const [inspireData, svgText] = await Promise.all([
          fetchInspireJson_(model.baseUrl, model.buildVersion, slug, lvl),
          fetchSvgText_(model.baseUrl, model.buildVersion, slug, lvl)
        ]);

        const svg = extractInlineSvg_(svgText);
        if (!svg) throw new Error("SVG לא תקין.");

        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        applyInspire_(svg, inspireData);

        stage.innerHTML = "";
        stage.appendChild(svg);
      } catch (_) {
        stage.innerHTML = `שגיאה בטעינת השראה.`;
      }
    }

    function buildInspireBtn_() {
      if (inspire.btn) return;

      const b = document.createElement("button");
      b.type = "button";
      b.className = "st-btn st-inspireBtn";
      b.setAttribute("aria-label", "הצג השראה");
      b.setAttribute("title", "הצג השראה");
      b.textContent = "🖌️";

      b.addEventListener("click", (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        openInspireModal_().catch(() => {});
      });

      inspire.btn = b;
      ensureInspireBtnPosition_();
    }

    // ---------- Level ----------
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

      ensureInspireBtnPosition_();
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

        if (isTouchLike_(e) && state.zoom && state.zoom.pointers && state.zoom.pointers.size >= 2) return;

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

      try { maybeTightenViewBox_(svg); } catch (_) {}

      state.currentSvg = svg;

      bindZoomOnce_();
      resetZoom_();

      bindGlobalOnce_();
      attachRegionHandlers_(svg);
    }

    // ---------- boot ----------
    buildPalette_();
    buildDots_();
    setUndoEnabled_(false);

    buildInspireBtn_();

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
