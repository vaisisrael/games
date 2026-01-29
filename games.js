(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  // 🔥 עדכן בכל שינוי כדי לשבור קאש
  const BUILD_VERSION = "2026-01-29-core-02";

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 משחק זיכרון", js: "memory.js", css: "memory.css" },
    { id: "puzzle", title: "🧩 פאזל", js: "puzzle.js", css: "puzzle.css" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji", title: "😄 חידת אימוג'ים" }
  ];

  // ====== CSS (accordion only) injected last ======
  function injectAccordionCssOnce() {
    const id = "pg-accordion-only-style";
    const old = document.getElementById(id);
    if (old) old.remove(); // ensure latest always wins

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
/* ===== Parasha Games – Accordion (unified in games.js) ===== */
[data-parasha-games]{
  --pg-bg: #f6f7fb;
  --pg-border: rgba(0,0,0,.10);
  --pg-text: #1f2937;
  --pg-shadow: 0 10px 25px rgba(0,0,0,.08);

  font-family: system-ui, -apple-system, "Segoe UI", "Rubik", Arial, "Noto Sans Hebrew", "Heebo", sans-serif !important;
  color: var(--pg-text) !important;
  display:block;
}

/* Accordion item */
[data-parasha-games][data-parasha-games] .game{
  border: 1px solid var(--pg-border) !important;
  border-radius: 16px !important;
  margin: 10px 0 !important;
  overflow: hidden !important;
  background: linear-gradient(180deg, var(--pg-bg), #fff) !important;
  box-shadow: var(--pg-shadow) !important;
}

/* Title button – hard reset then rebuild */
[data-parasha-games][data-parasha-games] .game-toggle{
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

[data-parasha-games][data-parasha-games] .game-toggle:hover{
  background: rgba(0,0,0,.03) !important;
}

[data-parasha-games][data-parasha-games] .game-toggle:focus-visible{
  outline: 3px solid rgba(37,99,235,.22) !important;
  outline-offset: 2px !important;
}

/* Body */
[data-parasha-games][data-parasha-games] .game-body{
  padding: 12px !important;
  background: rgba(255,255,255,.78) !important;
  border-top: 1px solid rgba(0,0,0,.06) !important;
}
    `.trim();

    // append LAST so it wins cascade
    document.head.appendChild(style);
  }

  // ====== PARASHA LABEL ======
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map(a => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find(t => re.test(t)) || null;
  }

  // ====== ASSET LOADER ======
  function baseUrlForThisScript() {
    const s = document.currentScript && document.currentScript.src;
    if (!s) return "https://vaisisrael.github.io/games/";
    return s.substring(0, s.lastIndexOf("/") + 1);
  }
  const BASE_URL = baseUrlForThisScript();
  const loaded = new Set();

  function withVersion(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", BUILD_VERSION);
    return u.toString();
  }

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

  // ====== REGISTRY ======
  function getRegistry() {
    window.ParashaGames = window.ParashaGames || {};
    window.ParashaGames.registry = window.ParashaGames.registry || new Map();
    return window.ParashaGames.registry;
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";

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

  // ====== INIT ======
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    // Inject accordion CSS last (wins over theme)
    injectAccordionCssOnce();

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    // Control fetch
    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION
      .map(g => g.id)
      .filter(id => data.row[id] === true);

    if (activeIds.length === 0) return;

    buildGames(root, activeIds);

    const controllers = new Map();
    const registry = getRegistry();

    async function onOpenChange(bodyEl, isOpen) {
      const gameId = bodyEl.closest(".game")?.dataset?.game || "";
      if (!gameId) return;

      // closing
      if (!isOpen) {
        const ctrl = controllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      // already initialized
      if (controllers.has(gameId)) return;

      const def = GAMES_DEFINITION.find(g => g.id === gameId);

      // module-backed games
      if (def && def.js && def.css) {
        bodyEl.innerHTML = "טוען...";
        await loadCssOnce(def.css);
        await loadScriptOnce(def.js);

        const factory = registry.get(gameId);
        if (!factory) {
          bodyEl.innerHTML = "שגיאה בטעינת המשחק (registry חסר).";
          controllers.set(gameId, { reset: () => {} });
          return;
        }

        const ctrl = await factory({ CONTROL_API, parashaLabel }).init(bodyEl);
        controllers.set(gameId, ctrl || { reset: () => {} });
        return;
      }

      // other placeholders
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
