(() => {
  "use strict";

  window.ParashaGames = window.ParashaGames || {};
  window.ParashaGames._registry = window.ParashaGames._registry || new Map();

  function factory({ parashaLabel }) {
    async function init(container) {
      container.innerHTML = `
        <div class="puz-wrap">
          <div class="puz-topbar">
            <button type="button" class="puz-help">עזרה</button>
            <button type="button" class="puz-reset">איפוס</button>
            <div class="puz-stats" aria-live="polite">
              <span>מהלכים: 0</span> • <span>זמן: 00:00</span>
            </div>
          </div>

          <div class="puz-note">
            הפאזל (גרירה) בבנייה.<br>
            הפרשה: <b>${parashaLabel}</b>
          </div>
        </div>
      `;

      // כרגע אין לוגיקת פאזל — רק שלד שלא נשבר
      return { reset: () => {} };
    }

    return { init };
  }

  window.ParashaGames._registry.set("puzzle", factory);
})();
