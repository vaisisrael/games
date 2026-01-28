(() => {
  "use strict";

  function extractParashaLabel() {
    const links = Array.from(
      document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]')
    );
    const texts = links.map(a => (a.textContent || "").trim());
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;
    return texts.find(t => re.test(t)) || null;
  }

  function initAccordion(root) {
    const games = Array.from(root.querySelectorAll(".game"));
    let openGame = null;

    games.forEach(game => {
      const btn = game.querySelector(".game-toggle");
      const body = game.querySelector(".game-body");

      body.style.display = "none";

      btn.addEventListener("click", () => {
        if (openGame && openGame !== body) {
          openGame.style.display = "none";
        }
        const isOpen = body.style.display === "block";
        body.style.display = isOpen ? "none" : "block";
        openGame = body.style.display === "block" ? body : null;
      });
    });
  }

  function init() {
    const root = document.querySelector("[data-parasha-games]");
    if (!root) return;

    const parashaLabel = extractParashaLabel();
    console.log("Parasha games init for:", parashaLabel);

    initAccordion(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
