(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 משחק זיכרון", script: "memory.js", style: "memory.css" },
    { id: "puzzle", title: "🧩 פאזל", script: "", style: "" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון", script: "", style: "" },
    { id: "dragmatch", title: "🔗 גרור והתאם", script: "", style: "" },
    { id: "emoji", title: "😄 חידת אימוג'ים", script: "", style: "" },
  ];

  // ====== PARASHA LABEL ======
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map((a) => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find((t) => re.test(t)) || null;
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";

    GAMES_DEFINITION.filter((g) => activeIds.includes(g.id)).forEach((game) => {
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

  // ====== BASE URL ======
  function baseUrlForThisScript() {
    const s = document.currentScript && document.currentScript.src;
    if (!s) return "https://vaisisrael.github.io/games/";
    return s.substring(0, s.lastIndexOf("/") + 1);
  }

  // ====== LOADERS (once) ======
  const loadedScripts = new Set();
  const loadedStyles = new Set();

  function loadScriptOnce(fileName) {
    return new Promise((resolve, reject) => {
      if (!fileName) return resolve();
      const url = baseUrlForThisScript() + fileName;

      if (loadedScripts.has(url)) return resolve();
      loadedScripts.add(url);

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load: " + url));
      document.head.appendChild(script);
    });
  }

  function loadCssOnce(fileName) {
    return new Promise((resolve, reject) => {
      if (!fileName) return resolve();
      const url = baseUrlForThisScript() + fileName;

      if (loadedStyles.has(url)) return resolve();
      loadedStyles.add(url);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("Failed to load: " + url));
      document.head.appendChild(link);
    });
  }

  // ====== ACCORDION (simple, no confirm) ======
  function initAccordion(root, onOpenChange) {
    let openBody = null;

    root.querySelectorAll(".game").forEach((game) => {
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
        else await onOpenChange(body, false);
      });
    });
  }

  // ====== INIT ======
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    // Control
    const res = await fetch(`${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`);
    const data = await res.json();
    if (!data || !data.row) return;

    const activeIds = GAMES_DEFINITION.map((g) => g.id).filter((id) => data.row[id] === true);
    if (activeIds.length === 0) return;

    buildGames(root, activeIds);

    const controllers = new Map(); // gameId -> controller

    async function onOpenChange(bodyEl, isOpen) {
      const gameEl = bodyEl.closest(".game");
      const gameId = gameEl?.dataset?.game || "";
      if (!gameId) return;

      // close: reset (if exists)
      if (!isOpen) {
        const ctrl = controllers.get(gameId);
        if (ctrl && typeof ctrl.reset === "function") ctrl.reset();
        return;
      }

      // open: already initialized
      if (controllers.has(gameId)) return;

      const def = GAMES_DEFINITION.find((g) => g.id === gameId);

      if (gameId === "memory") {
        bodyEl.innerHTML = "טוען משחק זיכרון...";

        // load CSS + JS for this game
        await loadCssOnce(def.style);
        await loadScriptOnce(def.script);

        const reg = window.ParashaGames && window.ParashaGames._registry;
        const factoryFn = reg && reg.get("memory");
        if (!factoryFn) {
          bodyEl.innerHTML = "שגיאה בטעינת משחק הזיכרון.";
          controllers.set(gameId, { reset: () => {} });
          return;
        }

        const gameApi = factoryFn({ CONTROL_API, parashaLabel });
        const ctrl = await gameApi.init(bodyEl);
        controllers.set(gameId, ctrl || { reset: () => {} });
        return;
      }

      // other games: placeholder
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
