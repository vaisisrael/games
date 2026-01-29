(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  // bump when you change files
  const BUILD_VERSION = "2026-01-29-900";

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 משחק זיכרון" },
    { id: "puzzle", title: "🧩 פאזל" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji", title: "😄 חידת אימוג'ים" }
  ];

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
  const loaded = new Set();

  function withVersion(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", BUILD_VERSION);
    return u.toString();
  }

  function loadCssOnce(fileName) {
    return new Promise((resolve, reject) => {
      const url = withVersion(baseUrlForThisScript() + fileName);
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
      const url = withVersion(baseUrlForThisScript() + fileName);
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

  // ===== registry (for game modules) =====
  function getRegistry() {
    window.ParashaGames = window.ParashaGames || {};
    window.ParashaGames._registry = window.ParashaGames._registry || new Map();
    return window.ParashaGames._registry;
  }

  // ====== DOM BUILD (accordion) ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";
    root.classList.add("pg-accordion"); // ✅ anchor class for styling

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
        // close previous
        if (openBody && openBody !== body) {
          openBody.style.display = "none";
          await onOpenChange(openBody, false);
        }

        const open = body.style.display === "block";
        body.style.display = open ? "none" : "block";
        openBody = body.style.display === "block" ? body : null;

        if (open) await onOpenChange(body, false);
        else await onOpenChange(body, true);
      });
    });
  }

  // ====== INIT ======
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    // make sure accordion css is present (cache-busted)
    await loadCssOnce("games.css");

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

    const controllers = new Map();
    const registry = getRegistry();

    async function onOpenChange(bodyEl, isOpen) {
      const gameId = bodyEl.closest(".game")?.dataset?.game || "";
      if (!gameId) return;

      if (!isOpen) {
        const ctrl = controllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      // already initialized
      if (controllers.has(gameId)) return;

      if (gameId === "memory") {
        bodyEl.innerHTML = "טוען משחק זיכרון...";
        await loadCssOnce("memory.css");
        await loadScriptOnce("memory.js");
        const factory = registry.get("memory");
        if (!factory) {
          bodyEl.innerHTML = "שגיאה בטעינת משחק הזיכרון.";
          controllers.set(gameId, { reset: () => {} });
          return;
        }
        const ctrl = await factory({ CONTROL_API, parashaLabel }).init(bodyEl);
        controllers.set(gameId, ctrl || { reset: () => {} });
        return;
      }

      if (gameId === "puzzle") {
        bodyEl.innerHTML = "טוען פאזל...";
        await loadCssOnce("puzzle.css");
        await loadScriptOnce("puzzle.js");
        const factory = registry.get("puzzle");
        if (!factory) {
          bodyEl.innerHTML = "שגיאה בטעינת הפאזל.";
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
