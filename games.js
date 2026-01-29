(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbxrOWGzfee9nKtBJqZEHLEADrNeD-2b8sARUuSFiaJDBNVn_T7iVueuA8uPr1bbdpkJYw/exec";

  // version for cache busting (also used when loading game modules)
  const BUILD_VERSION = "2026-01-30-mem-layout-01";

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 משחק זיכרון", js: "memory.js", css: "memory.css" },
    { id: "puzzle", title: "🧩 פאזל", js: "puzzle.js", css: "puzzle.css" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji", title: "😄 חידת אימוג'ים" }
  ];

  // ====== GLOBAL REGISTRY (always exists) ======
  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames.registry = window.ParashaGames.registry || new Map();

  // Accept either:
  // 1) object: { init(rootEl, ctx) {...} }
  // 2) function: (ctx) => ({ init(rootEl, ctx){...} })
  window.ParashaGamesRegister = function (id, factoryOrModule) {
    window.ParashaGames.registry.set(id, factoryOrModule);
  };

  // ====== PARASHA LABEL ======
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map(a => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find(t => re.test(t)) || null;
  }

  // ====== BASE URL ======
  function baseUrlForThisScript() {
    const s = document.currentScript && document.currentScript.src;
    if (!s) return "https://vaisisrael.github.io/games/";
    return s.substring(0, s.lastIndexOf("/") + 1);
  }
  const BASE_URL = baseUrlForThisScript();

  function withVersion(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", BUILD_VERSION);
    return u.toString();
  }

  const loaded = new Set();

  function loadCssOnce(fileName) {
    return new Promise((resolve, reject) => {
      const url = withVersion(BASE_URL + fileName);
      if (loaded.has(url)) return resolve();
      loaded.add(url);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("Failed to load CSS: " + url));
      document.head.appendChild(link);
    });
  }

  function loadScriptOnce(fileName) {
    return new Promise((resolve, reject) => {
      const url = withVersion(BASE_URL + fileName);
      if (loaded.has(url)) return resolve();
      loaded.add(url);

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load JS: " + url));
      document.head.appendChild(script);
    });
  }

  // ====== ACCORDION CSS (Injected + enforced briefly) ======
  function ensureAccordionStyleExists() {
    const id = "pg-accordion-style";
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }

    style.textContent = `
/* ===== Parasha Games – Accordion (stable inject) ===== */
[data-parasha-games][data-pg-acc="1"]{
  --pg-bg: #f6f7fb;
  --pg-border: rgba(0,0,0,.10);
  --pg-text: #1f2937;
  --pg-shadow: 0 10px 25px rgba(0,0,0,.08);

  font-family: system-ui, -apple-system, "Segoe UI", "Rubik", Arial, "Noto Sans Hebrew", "Heebo", sans-serif !important;
  color: var(--pg-text) !important;
  display:block !important;
}

[data-parasha-games][data-pg-acc="1"] .game{
  border: 1px solid var(--pg-border) !important;
  border-radius: 16px !important;
  margin: 10px 0 !important;
  overflow: hidden !important;
  background: linear-gradient(180deg, var(--pg-bg), #fff) !important;
  box-shadow: var(--pg-shadow) !important;
}

[data-parasha-games][data-pg-acc="1"] .game-toggle{
  all: unset !important;

  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:8px !important;

  width:100% !important;
  padding: 12px 14px !important;

  font-weight: 900 !important;
  font-size: 16px !important;
  line-height: 1.25 !important;
  color: var(--pg-text) !important;

  cursor:pointer !important;
  background: transparent !important;
  user-select:none !important;
}

[data-parasha-games][data-pg-acc="1"] .game-toggle:hover{
  background: rgba(0,0,0,.03) !important;
}

[data-parasha-games][data-pg-acc="1"] .game-toggle:focus-visible{
  outline: 3px solid rgba(37,99,235,.22) !important;
  outline-offset: 2px !important;
}

[data-parasha-games][data-pg-acc="1"] .game-body{
  padding: 12px !important;
  background: rgba(255,255,255,.78) !important;
  border-top: 1px solid rgba(0,0,0,.06) !important;
}
    `.trim();
  }

  function enforceAccordionCssForAWhile() {
    ensureAccordionStyleExists();

    const start = Date.now();
    const interval = setInterval(() => {
      ensureAccordionStyleExists();
      if (Date.now() - start > 1800) clearInterval(interval);
    }, 150);

    window.addEventListener("load", () => ensureAccordionStyleExists(), { once: true });
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";
    root.setAttribute("data-pg-acc", "1");

    GAMES_DEFINITION
      .filter(g => activeIds.includes(g.id))
      .forEach(game => {
        const el = document.createElement("div");
        el.className = "game";
        el.dataset.game = game.id;

        el.innerHTML = `
          <button class="game-toggle" type="button">${game.title}</button>
          <div class="game-body" style="display:none"></div>
        `;

        root.appendChild(el);
      });
  }

  // ====== ACCORDION (single open) ======
  function initAccordion(root, onOpenChange) {
    let openBody = null;

    root.querySelectorAll(".game").forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      btn.addEventListener("click", async () => {
        if (openBody && openBody !== body) {
          openBody.style.display = "none";
          await onOpenChange(openBody, false);
        }

        const open = body.style.display === "block";
        body.style.display = open ? "none" : "block";
        openBody = body.style.display === "block" ? body : null;

        await onOpenChange(body, !open);
      });
    });
  }

  // ====== Resolve module from registry ======
  function resolveModule(regValue, ctx) {
    // if function: call with ctx
    if (typeof regValue === "function") {
      return regValue(ctx);
    }
    // if object: use as-is
    return regValue;
  }

  // ====== INIT ======
  async function init() {
    enforceAccordionCssForAWhile();

    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION
      .map(g => g.id)
      .filter(id => data.row[id] === true);

    if (activeIds.length === 0) return;

    buildGames(root, activeIds);
    enforceAccordionCssForAWhile();

    const controllers = new Map();

    async function onOpenChange(bodyEl, isOpen) {
      const gameId = bodyEl.closest(".game")?.dataset?.game || "";
      if (!gameId) return;

      if (!isOpen) {
        const ctrl = controllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      if (controllers.has(gameId)) return;

      const def = GAMES_DEFINITION.find(g => g.id === gameId);
      const ctx = { CONTROL_API, parashaLabel };

      if (def && def.js && def.css) {
        bodyEl.innerHTML = "טוען...";

        try {
          await loadCssOnce(def.css);
          await loadScriptOnce(def.js);

          const reg = window.ParashaGames?.registry;
          const regValue = reg && reg.get(gameId);

          if (!regValue) {
            bodyEl.innerHTML = "שגיאה בטעינת המשחק (registry חסר).";
            controllers.set(gameId, { reset: () => {} });
            return;
          }

          const module = resolveModule(regValue, ctx);

          if (!module || typeof module.init !== "function") {
            bodyEl.innerHTML = "שגיאה בטעינת המשחק (module.init חסר).";
            controllers.set(gameId, { reset: () => {} });
            return;
          }

          const ctrl = await module.init(bodyEl, ctx);
          controllers.set(gameId, ctrl || { reset: () => {} });
        } catch (err) {
          bodyEl.innerHTML = "שגיאה בטעינת המשחק.";
          controllers.set(gameId, { reset: () => {} });
        }
        return;
      }

      bodyEl.innerHTML = `<div>(כאן ייבנה המשחק: ${gameId})</div>`;
      controllers.set(gameId, { reset: () => {} });
    }

    initAccordion(root, onOpenChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
