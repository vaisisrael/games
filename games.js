(() => {
  "use strict";

  // ========= הגדרות =========
  const CONTROL_API = "PASTE_WEB_APP_URL_HERE";

  const GAMES_DEFINITION = [
    { id: "memory",    title: "🧠 משחק זיכרון" },
    { id: "puzzle",    title: "🧩 פאזל" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji",     title: "😄 חידת אימוג'ים" }
  ];

  // ========= זיהוי תווית פרשה =========
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map(a => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find(t => re.test(t)) || null;
  }

  // ========= בניית המשחקים =========
  function buildGames(root, activeIds) {
    root.innerHTML = "";

    GAMES_DEFINITION
      .filter(g => activeIds.includes(g.id))
      .forEach(game => {
        const el = document.createElement("div");
        el.className = "game";
        el.dataset.game = game.id;

        el.innerHTML = `
          <button class="game-toggle">${game.title}</button>
          <div class="game-body" style="display:none">
            <div class="game-placeholder">
              (כאן ייבנה המשחק: ${game.id})
            </div>
          </div>
        `;

        root.appendChild(el);
      });
  }

  // ========= אקורדיון =========
  function initAccordion(root) {
    let openBody = null;

    root.querySelectorAll(".game").forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      btn.addEventListener("click", () => {
        if (openBody && openBody !== body) {
          openBody.style.display = "none";
        }
        const open = body.style.display === "block";
        body.style.display = open ? "none" : "block";
        openBody = body.style.display === "block" ? body : null;
      });
    });
  }

  // ========= init =========
  async function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) return;

    const res = await fetch(
      `${CONTROL_API}?parasha=${encodeURIComponent(parashaLabel)}`
    );
    const data = await res.json();
    if (!data.row) return;

    const activeIds = GAMES_DEFINITION
      .map(g => g.id)
      .filter(id => data.row[id] === true);

    if (activeIds.length === 0) return;

    buildGames(root, activeIds);
    initAccordion(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
