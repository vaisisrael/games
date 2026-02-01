(() => {
  "use strict";

  const BASE = "https://vaisisrael.github.io/games/";
  const VERSION_URL = BASE + "version.txt";

  async function getVersion() {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch version.txt");
    const v = (await res.text()).trim();
    if (!v) throw new Error("version.txt is empty");
    return v;
  }

  async function load() {
    const version = await getVersion();

    // מאפשר ל-games.js ולמודולים לדעת מה הגרסה שנבחרה
    window.PARASHA_GAMES_BUILD_VERSION = version;

    const s = document.createElement("script");
    s.src = BASE + "games.js?v=" + encodeURIComponent(version);
    s.defer = true;
    s.onerror = () => console.error("Failed to load games.js");
    document.head.appendChild(s);
  }

  load().catch(err => console.error("Parasha Games loader failed:", err));
})();
