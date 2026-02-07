/* קובץ מלא: games.js */
(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbxM-6ewqaHZ_UrUrXuQyPA9ETGR2_U_wgqIY9gTsIdXmvJN8QImhVHxDmc35wyg2kVcaQ/exec";

  // version for cache busting (also used when loading game modules)
  const BUILD_VERSION = (() => {
    // 1) prefer loader-provided version
    if (window.PARASHA_GAMES_BUILD_VERSION) return String(window.PARASHA_GAMES_BUILD_VERSION);

    // 2) fallback: try to read ?v= from this script url
    const s = document.currentScript && document.currentScript.src;
    if (s) {
      try {
        const u = new URL(s, window.location.href);
        const v = u.searchParams.get("v");
        if (v) return v;
      } catch (_) {}
    }

    // 3) last resort: stable string
    return "no-version";
  })();

  const GAMES_DEFINITION = [
    { id: "memory", title: "🧠 זיכרון", js: "memory.js", css: "memory.css" },
    { id: "puzzle", title: "🧩 פאזל", js: "puzzle.js", css: "puzzle.css" },
    { id: "wordstack", title: "🔤 בְּלִילוֹן", js: "wordstack.js", css: "wordstack.css" },
    { id: "classify", title: "🗄️ מגירון", js: "classify.js", css: "classify.css" }
  ];

  // ====== LOAD RUBIK FONT (no Blogger theme changes) ======
  function ensureRubikFontLoaded() {
    const id = "pg-rubik-font";
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;900&display=swap&subset=hebrew";

    document.head.appendChild(link);
  }

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

  // ====== TABS CSS (Injected + enforced briefly) ======
  function ensureTabsStyleExists() {
    const id = "pg-tabs-style";
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }

    style.textContent = `
/* ===== Parasha Games – Tabs (stable inject) ===== */
[data-parasha-games][data-pg-tabs="1"]{
  --pg-bg: #f6f7fb;
  --pg-border: rgba(0,0,0,.10);
  --pg-text: #1f2937;
  --pg-shadow: 0 10px 25px rgba(0,0,0,.08);

  font-family: system-ui, -apple-system, "Segoe UI", "Rubik", Arial, "Noto Sans Hebrew", "Heebo", sans-serif !important;
  color: var(--pg-text) !important;
  display:block !important;
  direction: rtl !important;

  /* ✅ MAKE ALL GAMES BEHAVE LIKE בלילון:
     Break below the floated post image and use full available width */
  clear: both !important;
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* also clear on the panel itself (some themes float siblings) */
[data-parasha-games][data-pg-tabs="1"] .pg-tabbar,
[data-parasha-games][data-pg-tabs="1"] .game{
  clear: both !important;
}

[data-parasha-games][data-pg-tabs="1"] .pg-panels,
[data-parasha-games][data-pg-tabs="1"] .game,
[data-parasha-games][data-pg-tabs="1"] .game-body{
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

[data-parasha-games][data-pg-tabs="1"] .pg-tabbar{
  position: sticky !important;
  top: 0 !important;
  z-index: 20 !important;
  background: #fff !important;
  border: 1px solid var(--pg-border) !important;
  border-radius: 16px !important;
  box-shadow: var(--pg-shadow) !important;
  padding: 6px !important;
  margin: 10px 0 !important;

  display: flex !important;
  gap: 6px !important;
  align-items: center !important;
  justify-content: flex-start !important; /* RTL: start = right */
}

[data-parasha-games][data-pg-tabs="1"] .pg-tab{
  all: unset !important;

  flex: 0 0 auto !important;
  width: auto !important;

  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;

  padding: 7px 10px !important;
  border-radius: 12px !important;

  font-weight: 900 !important;
  font-size: 14px !important;
  line-height: 1.2 !important;

  cursor: pointer !important;
  user-select: none !important;
  border: 1px solid rgba(0,0,0,.08) !important;
  background: transparent !important;
}

[data-parasha-games][data-pg-tabs="1"] .pg-tab:hover{
  background: rgba(0,0,0,.03) !important;
}

[data-parasha-games][data-pg-tabs="1"] .pg-tab[aria-selected="true"]{
  background: rgba(0,0,0,.06) !important;
  border: 2px solid rgba(0,0,0,.22) !important;
  box-shadow: 0 6px 16px rgba(0,0,0,.10) !important;
}

[data-parasha-games][data-pg-tabs="1"] .pg-tab:focus-visible{
  outline: 3px solid rgba(37,99,235,.22) !important;
  outline-offset: 2px !important;
}

[data-parasha-games][data-pg-tabs="1"] .game{
  border: 1px solid var(--pg-border) !important;
  border-radius: 16px !important;
  overflow: hidden !important;
  background: rgba(255,255,255,.78) !important;
  box-shadow: var(--pg-shadow) !important;
  margin: 10px 0 !important;
}

[data-parasha-games][data-pg-tabs="1"] .game-body{
  padding: 12px !important;
}
    `.trim();
  }

  function enforceTabsCssForAWhile() {
    ensureTabsStyleExists();

    const start = Date.now();
    const interval = setInterval(() => {
      ensureTabsStyleExists();
      if (Date.now() - start > 1800) clearInterval(interval);
    }, 150);

    window.addEventListener("load", () => ensureTabsStyleExists(), { once: true });
  }

  // ====== DOM BUILD ======
  function buildGames(root, activeIds) {
    root.innerHTML = "";
    root.setAttribute("data-pg-tabs", "1");

    const tabbar = document.createElement("div");
    tabbar.className = "pg-tabbar";
    tabbar.setAttribute("role", "tablist");

    const panelsWrap = document.createElement("div");
    panelsWrap.className = "pg-panels";

    GAMES_DEFINITION
      .filter(g => activeIds.includes(g.id))
      .forEach(game => {
        const tab = document.createElement("button");
        tab.className = "pg-tab";
        tab.type = "button";
        tab.dataset.game = game.id;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", "false");
        tab.textContent = game.title;

        const panel = document.createElement("div");
        panel.className = "game";
        panel.dataset.game = game.id;

        const body = document.createElement("div");
        body.className = "game-body";
        body.style.display = "none";

        panel.appendChild(body);

        tabbar.appendChild(tab);
        panelsWrap.appendChild(panel);
      });

    root.appendChild(tabbar);
    root.appendChild(panelsWrap);
  }

  // ====== TABS (single active) ======
  function initTabs(root, onOpenChange) {
    const tabs = Array.from(root.querySelectorAll(".pg-tab"));
    const bodies = Array.from(root.querySelectorAll(".game .game-body"));

    let activeBody = null;
    let activeTab = null;

    function findBodyByGameId(gameId) {
      const gameEl = root.querySelector(\`.game[data-game="\${CSS.escape(gameId)}"]\`);
      return gameEl ? gameEl.querySelector(".game-body") : null;
    }

    async function activateTab(tabEl) {
      const gameId = tabEl?.dataset?.game || "";
      if (!gameId) return;

      const body = findBodyByGameId(gameId);
      if (!body) return;

      if (activeBody && activeBody !== body) {
        activeBody.style.display = "none";
        await onOpenChange(activeBody, false);
      }

      tabs.forEach(t => t.setAttribute("aria-selected", "false"));
      tabEl.setAttribute("aria-selected", "true");

      bodies.forEach(b => (b.style.display = "none"));
      body.style.display = "block";

      activeBody = body;
      activeTab = tabEl;

      await onOpenChange(body, true);
    }

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        if (activeTab === tab) return;
        activateTab(tab);
      });
    });

    // No auto-selection on first entry (user chooses)
  }

  // ====== Resolve module from registry ======
  function resolveModule(regValue, ctx) {
    if (typeof regValue === "function") return regValue(ctx);
    return regValue;
  }

  // ====== INIT ======
  async function init() {
    ensureRubikFontLoaded();
    enforceTabsCssForAWhile();

    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    // ✅ Inline safety: some themes apply floats/width via inline or higher specificity
    root.style.clear = "both";
    root.style.width = "100%";
    root.style.maxWidth = "none";
    root.style.boxSizing = "border-box";

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
    enforceTabsCssForAWhile();

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

    initTabs(root, onOpenChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
