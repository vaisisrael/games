(() => {
  "use strict";

  /****************************************************************
   * הגדרת המשחקים – זה המקום היחיד שמשנים בעתיד
   ****************************************************************/
  const GAMES_DEFINITION = [
    { id: "memory",    title: "🧠 משחק זיכרון" },
    { id: "puzzle",    title: "🧩 פאזל" },
    { id: "truefalse", title: "✅ נכון / ❌ לא נכון" },
    { id: "dragmatch", title: "🔗 גרור והתאם" },
    { id: "emoji",     title: "😄 חידת אימוג'ים" }
  ];

  /****************************************************************
   * זיהוי תווית פרשה בפורמט: X-YY פרשת ...
   ****************************************************************/
  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map(a => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find(t => re.test(t)) || null;
  }

  /****************************************************************
   * בניית שלד המשחקים לתוך המיכל
   ****************************************************************/
  function buildGames(root) {
    root.innerHTML = "";

    GAMES_DEFINITION.forEach(game => {
      const gameEl = document.createElement("div");
      gameEl.className = "game";
      gameEl.dataset.game = game.id;

      gameEl.innerHTML = `
        <button class="game-toggle">${game.title}</button>
        <div class="game-body">
          <div class="game-placeholder">
            (כאן ייבנה המשחק: ${game.id})
          </div>
        </div>
      `;

      root.appendChild(gameEl);
    });
  }

  /****************************************************************
   * אקורדיון – רק משחק אחד פתוח
   ****************************************************************/
  function initAccordion(root) {
    const games = Array.from(root.querySelectorAll(".game"));
    let openBody = null;

    games.forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      body.style.display = "none";

      btn.addEventListener("click", () => {
        if (openBody && openBody !== body) {
          openBody.style.display = "none";
        }

        const isOpen = body.style.display === "block";
        body.style.display = isOpen ? "none" : "block";
        openBody = body.style.display === "block" ? body : null;
      });
    });
  }

  /****************************************************************
   * Init ראשי
   ****************************************************************/
  function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) {
      console.warn("Parasha games: no parasha label found (X-YY פרשת ...).");
      return;
    }

    console.log("Parasha games init for:", parashaLabel);

    buildGames(root);
    initAccordion(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
