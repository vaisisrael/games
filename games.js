(() => {
  "use strict";

  // 1) רץ רק אם שלד המשחקים קיים בעמוד
  function hasGamesSkeleton() {
    return !!document.querySelector("[data-parasha-games]");
  }

  // 2) חילוץ "תווית פרשה" מתוך labels שמופיעים בעמוד (ניסיון בכמה מקומות אפשריים)
  function extractParashaLabel() {
    // א) חיפוש בקישורי תוויות (בדרך כלל זה הכי יציב)
    const labelLinks = Array.from(document.querySelectorAll('a[rel="tag"], a[href*="/search/label/"]'));
    const texts = labelLinks.map(a => (a.textContent || "").trim()).filter(Boolean);

    // תבנית: "X-YY פרשת משהו"
    const re = /^\d+\-\d+\s+פרשת\s+.+$/;

    return texts.find(t => re.test(t)) || null;
  }

  // 3) נקודת כניסה
  function init() {
    if (!hasGamesSkeleton()) return;

    const parashaLabel = extractParashaLabel();
    if (!parashaLabel) {
      console.warn("Parasha games: no parasha label found (X-YY פרשת ...).");
      return;
    }

    console.log("Parasha games init for:", parashaLabel);

    // TODO: כאן נכניס בשלב הבא את ה-Accordion ואת השליפות מ-Sheets
  }

  // 4) להריץ בבטחה
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
