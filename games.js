(() => {
  "use strict";

  // ====== CONFIG ======
  const CONTROL_API =
    "https://script.google.com/macros/s/AKfycbzoUoopq8rv8PdN2qe1DZXF73G5Mo8hBgdUqTef-v6z9ukSRua8HswwoyhHCm4fWktHdg/exec";

  // ⬅️ כל שינוי בקבצי CSS/JS: הגדל מספר
  const BUILD_VERSION = "2026-01-29-1100";

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

  // ====== CRITICAL: Inject accordion style LAST to beat Blogger theme ======
  function injectAccordionStyleLast() {
    const id = "pg-accordion-style";
    const existing = document.getElementById(id);
    if (existing) existing.remove(); // always replace with latest

    const style = document.createElement("style");
    style.id = id;

    // ✅ "האקורדיון הנהדר" – אבל עם !important + ספציפיות גבוהה + נטען אחרון
    // note: we anchor under [data-parasha-games] to avoid harming the blog.
    style.textContent = `
/* injected by games.js – beats Blogger theme (loaded last) */
[data-parasha-games][data-parasha-games]{
  --pg-bg:#f6f7fb;
  --pg-border:rgba(0,0,0,.10);
  --pg-text:#1f2937;
  --pg-shadow:0 10px 25px rgba(0,0,0,.08);
  font-family:system-ui,-apple-system,"Segoe UI","Rubik",Arial,"Noto Sans Hebrew","Heebo",sans-serif !important;
  color:var(--pg-text) !important;
  display:block !important;
}

[data-parasha-games][data-parasha-games] .game{
  border:1px solid var(--pg-border) !important;
  border-radius:16px !important;
  margin:10px 0 !important;
  overflow:hidden !important;
  background:linear-gradient(180deg,var(--pg-bg),#fff) !important;
  box-shadow:var(--pg-shadow) !important;
}

[data-parasha-games][data-parasha-games] .game-toggle{
  /* hard reset of theme button rules */
  all:unset !important;

  /* rebuild */
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:8px !important;

  width:100% !important;
  padding:12px 14px !important;

  font-family:inherit !important;
  font-weight:900 !important;
  font-size:16px !important;
  line-height:1.25 !important;
  color:var(--pg-text) !important;

  cursor:pointer !important;
  background:transparent !important;
  user-select:none !important;
}

[data-parasha-games][data-parasha-games] .game-toggle:hover{
  background:rgba(0,0,0,.03) !important;
}

[data-parasha-games][data-parasha-games] .game-toggle:focus-visible{
  outline:3px solid rgba(37,99,235,.22) !important;
  outline-offset:2px !important;
}

[data-parasha-games][data-parasha-games] .game-body{
  padding:12px !important;
  background:rgba(255,255,255,.78) !important;
  border-top:1px solid rgba(0,0,0,.06) !important;
  display:block !important;
}
    `.trim();

    // append LAST in head = wins in cascade
    document.head.appendChild(style);
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

        if (open) await onOpenChange(body, false);
        else await onOpenChange(body, true);
      });
    });
  }

  // ====== INIT ======
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    // 1) load base css
    await loadCssOnce("games.css");

    // 2) NOW inject the final accordion style last (beats theme)
    injectAccordionStyleLast();

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
