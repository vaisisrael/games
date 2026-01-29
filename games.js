(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  const BUILD_VERSION = "2026-01-29-200";

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

  // ====== registry ======
  function getRegistry() {
    window.ParashaGames = window.ParashaGames || {};
    window.ParashaGames._registry = window.ParashaGames._registry || new Map();
    return window.ParashaGames._registry;
  }

  // ====== asset loading (with cache-bust) ======
  function baseUrlForThisScript() {
    const s = document.currentScript && document.currentScript.src;
    if (!s) return "https://vaisisrael.github.io/games/";
    return s.substring(0, s.lastIndexOf("/") + 1);
  }

  const loadedAssets = new Set();

  function withVersion(url) {
    const u = new URL(url, window.location.href);
    u.searchParams.set("v", BUILD_VERSION);
    return u.toString();
  }

  function loadCssOnce(fileName) {
    return new Promise((resolve, reject) => {
      const url = withVersion(baseUrlForThisScript() + fileName);
      if (loadedAssets.has(url)) return resolve();
      loadedAssets.add(url);

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
      if (loadedAssets.has(url)) return resolve();
      loadedAssets.add(url);

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load JS: " + url));
      document.head.appendChild(script);
    });
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

  // ====== HARDENED ACCORDION STYLES (inline) ======
  function applyAccordionInlineStyles(root) {
    // These inline styles override aggressive Blogger theme CSS.
    const container = root; // [data-parasha-games]

    // set safe typography on container (inline)
    container.style.fontFamily =
      'system-ui, -apple-system, "Segoe UI", "Rubik", Arial, "Noto Sans Hebrew", "Heebo", sans-serif';
    container.style.color = "#1f2937";
    container.style.display = "block";

    root.querySelectorAll(".game").forEach(game => {
      game.style.border = "1px solid rgba(0,0,0,.10)";
      game.style.borderRadius = "16px";
      game.style.margin = "10px 0";
      game.style.overflow = "hidden";
      game.style.background = "linear-gradient(180deg, #f6f7fb, #fff)";
      game.style.boxShadow = "0 10px 25px rgba(0,0,0,.08)";

      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      if (btn) {
        btn.style.width = "100%";
        btn.style.padding = "12px 14px";
        btn.style.fontWeight = "900";
        btn.style.fontSize = "16px";
        btn.style.lineHeight = "1.25";
        btn.style.border = "0";
        btn.style.outline = "none";
        btn.style.background = "transparent";
        btn.style.color = "#1f2937";
        btn.style.cursor = "pointer";

        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.gap = "8px";
      }

      if (body) {
        body.style.padding = "12px";
        body.style.background = "rgba(255,255,255,.78)";
        body.style.borderTop = "1px solid rgba(0,0,0,.06)";
      }
    });

    // lightweight hover (no transform) – via events (since theme may override :hover)
    root.querySelectorAll(".game-toggle").forEach(btn => {
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(0,0,0,.03)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
      });
    });
  }

  // ====== ACCORDION ======
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

        if (openBody) await onOpenChange(openBody, true);
      });
    });
  }

  // ====== INIT ======
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    // Control row
    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION
      .map(g => g.id)
      .filter(id => data.row[id] === true);

    if (activeIds.length === 0) return;

    buildGames(root, activeIds);

    // ✅ force accordion premium look regardless of theme
    applyAccordionInlineStyles(root);

    const controllers = new Map(); // id -> controller
    const registry = getRegistry();

    async function openGame(gameId, bodyEl) {
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

    async function onOpenChange(bodyEl, isOpen) {
      const gameEl = bodyEl.closest(".game");
      const gameId = gameEl?.dataset?.game || "";
      if (!gameId) return;

      if (!isOpen) {
        const ctrl = controllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      await openGame(gameId, bodyEl);
    }

    initAccordion(root, onOpenChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
