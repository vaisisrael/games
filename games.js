(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  // version for cache busting (also used when loading game modules)
  const BUILD_VERSION = "2026-01-29-fix-02";

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

  window.ParashaGamesRegister = function (id, factory) {
    window.ParashaGames.registry.set(id, factory);
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

  // ====== ACCORDION CSS (Injected + enforced for ~2s to beat Blogger desktop theme) ======
  function applyAccordionCss() {
    const id = "pg-accordion-style";
    const old = document.getElementById(id);
    if (old) old.remove();

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
/* ===== Parasha Games – Accordion (CSS enforced) ===== */

/* We scope everything to [data-parasha-games][data-pg-acc="1"] to win specificity */
[data-parasha-games][data-pg-acc="1"]{
  --pg-bg: #f6f7fb;
  --pg-border: rgba(0,0,0,.10);
  --pg-text: #1f2937;
  --pg-shadow: 0 10px 25px rgba(0,0,0,.08);

  font-family: system-ui, -apple-system, "Segoe UI", "Rubik", Arial, "Noto Sans Hebrew", "Heebo", sans-serif !important;
  color: var(--pg-text) !important;
  display:block !important;
}

/* Accordion item */
[data-parasha-games][data-pg-acc="1"] .game{
  border: 1px solid var(--pg-border) !important;
  border-radius: 16px !important;
  margin: 10px 0 !important;
  overflow: hidden !important;
  background: linear-gradient(180deg, var(--pg-bg), #fff) !important;
  box-shadow: var(--pg-shadow) !important;
}

/* Title button – hard reset then rebuild */
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

/* Body */
[data-parasha-games][data-pg-acc="1"] .game-body{
  padding: 12px !important;
  background: rgba(255,255,255,.78) !important;
  border-top: 1px solid rgba(0,0,0,.06) !important;
}
    `.trim();

    document.head.appendChild(style);
  }

  function enforceAccordionCssForAWhile() {
    // enforce for ~2 seconds (Blogger desktop often injects styles late)
    applyAccordionCss();

    const start = Date.now();
    const interval = setInterval(() => {
      applyAccordionCss();
      if (Date.now() - start > 2200) clearInterval(interval);
    }, 180);

    // also after full load
    window.addEventListener("load", () => applyAccordionCss(), { once: true });

    // and if new <style>/<link> are appended later (rare, but happens on some themes)
    try {
      const obs = new MutationObserver(() => applyAccordionCss());
      obs.observe(document.head, { childList: true });
      setTimeout(() => obs.disconnect(), 2500);
    } catch (_) {}
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";
    root.setAttribute("data-pg-acc", "1"); // scope for CSS specificity

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

    // re-apply after we built DOM (helps in some themes)
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

      if (def && def.js && def.css) {
        bodyEl.innerHTML = "טוען...";

        await loadCssOnce(def.css);
        await loadScriptOnce(def.js);

        const reg = window.ParashaGames?.registry;
        const factory = reg && reg.get(gameId);

        if (!factory) {
          bodyEl.innerHTML = "שגיאה בטעינת המשחק (registry חסר).";
          controllers.set(gameId, { reset: () => {} });
          return;
        }

        const ctrl = await factory({ CONTROL_API, parashaLabel }).init(bodyEl);
        controllers.set(gameId, ctrl || { reset: () => {} });
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
