/* קובץ מלא: differences.js */
(() => {
  "use strict";

  window.ParashaGamesRegister("differences", {
    init: async (rootEl, ctx) => {
      const { CONTROL_API, parashaLabel, BASE_URL } = ctx;

      const url =
        `${CONTROL_API}?mode=differences&parasha=` +
        encodeURIComponent(parashaLabel);

      const res = await fetch(url);
      const data = await res.json();

      if (!data || !data.ok || !data.row) {
        rootEl.innerHTML = `<div>לא נמצאו נתוני “מה השתנה?” לפרשה זו.</div>`;
        return { reset: () => {} };
      }

      const row = data.row;

      const imageBase = String(row.image || "").trim();
      const changesRaw = String(row.changes || "").trim();
      const desc = String(row.desc || "").trim();
      const startMessage = desc || "התחילו לחפש את ההבדלים.";

      if (!imageBase) {
        rootEl.innerHTML = `<div>חסר שם בסיס לתמונות.</div>`;
        return { reset: () => {} };
      }

      if (!changesRaw) {
        rootEl.innerHTML = `<div>חסרה רשימת שינויים.</div>`;
        return { reset: () => {} };
      }

      const COORD_W = 400;
      const COORD_H = 500;

      function escapeHtml(str) {
        return String(str || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function normalizeImageBase(base) {
        return String(base || "").trim().replace(/\.webp$/i, "");
      }

      function imageUrl(n) {
        const clean = normalizeImageBase(imageBase);

        if (/^https?:\/\//i.test(clean)) {
          return `${clean}${n}.webp`;
        }

        return `${BASE_URL}${clean}${n}.webp`;
      }

      function parseChanges(raw) {
        return String(raw || "")
          .split(";")
          .map(s => s.trim())
          .filter(Boolean)
          .map((part, index) => {
            const bits = part.split("|").map(x => String(x || "").trim());

            return {
              id: index,
              text: bits[0] || "",
              target: bits[1] || "",
              x: Number(bits[2]),
              y: Number(bits[3]),
              r: Number(bits[4]),
              found: false
            };
          })
          .filter(item => {
            const targetOk =
              item.target === "image1" ||
              item.target === "image2" ||
              item.target === "both";

            return (
              item.text &&
              targetOk &&
              Number.isFinite(item.x) &&
              Number.isFinite(item.y) &&
              Number.isFinite(item.r) &&
              item.r > 0
            );
          });
      }

      const changes = parseChanges(changesRaw);

      if (!changes.length) {
        rootEl.innerHTML = `<div>רשימת השינויים אינה תקינה.</div>`;
        return { reset: () => {} };
      }

      rootEl.innerHTML = `
        <div class="diff-wrap">
          <div class="diff-card">

            <div class="diff-topbar">
              <div class="diff-actions">
                <button class="diff-btn diff-reset" type="button">איפוס</button>
              </div>

              <div class="diff-stats">
                <span class="diff-counter">נמצאו 0 מתוך ${changes.length}</span>
              </div>
            </div>

            <div class="diff-message" aria-live="polite">
              ${escapeHtml(startMessage)}
            </div>

            <div class="diff-scroll">
              <div class="diff-images">

                <div class="diff-imgbox" data-img="image1">
                  <div class="diff-label">תמונה 1</div>
                  <img class="diff-img" src="${escapeHtml(imageUrl(1))}" alt="תמונה ראשונה למשחק מצא את ההבדלים" draggable="false">
                  <svg class="diff-marks" viewBox="0 0 ${COORD_W} ${COORD_H}" preserveAspectRatio="none" aria-hidden="true"></svg>
                </div>

                <div class="diff-imgbox" data-img="image2">
                  <div class="diff-label">תמונה 2</div>
                  <img class="diff-img" src="${escapeHtml(imageUrl(2))}" alt="תמונה שנייה למשחק מצא את ההבדלים" draggable="false">
                  <svg class="diff-marks" viewBox="0 0 ${COORD_W} ${COORD_H}" preserveAspectRatio="none" aria-hidden="true"></svg>
                </div>

              </div>
            </div>

            <div class="diff-found-title">רשימת הגילויים</div>
            <ol class="diff-list"></ol>

            <div class="diff-banner" hidden>
              🎉 כל הכבוד! מצאתם את כל ההבדלים.
            </div>

          </div>
        </div>
      `;

      const counterEl = rootEl.querySelector(".diff-counter");
      const messageEl = rootEl.querySelector(".diff-message");
      const listEl = rootEl.querySelector(".diff-list");
      const bannerEl = rootEl.querySelector(".diff-banner");
      const resetBtn = rootEl.querySelector(".diff-reset");
      const imgBoxes = Array.from(rootEl.querySelectorAll(".diff-imgbox"));

      let foundCount = 0;
      let pointerState = null;

      function renderList() {
        listEl.innerHTML = changes
          .map((ch, i) => {
            if (ch.found) {
              return `<li class="is-found">✅ ${i + 1}. ${escapeHtml(ch.text)}</li>`;
            }
            return `<li>⬜ ${i + 1}. מוסתר עדיין</li>`;
          })
          .join("");
      }

      function updateCounter() {
        counterEl.textContent = `נמצאו ${foundCount} מתוך ${changes.length}`;
      }

      function setMessage(text, kind) {
        messageEl.textContent = text;
        messageEl.dataset.kind = kind || "";
      }

      function clearMarks() {
        rootEl.querySelectorAll(".diff-marks").forEach(svg => {
          svg.innerHTML = "";
        });
      }

      function addCircle(imgName, ch) {
        const box = rootEl.querySelector(`.diff-imgbox[data-img="${imgName}"]`);
        if (!box) return;

        const svg = box.querySelector(".diff-marks");
        if (!svg) return;

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(ch.x));
        circle.setAttribute("cy", String(ch.y));
        circle.setAttribute("r", String(ch.r));
        circle.setAttribute("class", "diff-circle");
        svg.appendChild(circle);
      }

      function renderMarks() {
        clearMarks();

        changes.forEach(ch => {
          if (!ch.found) return;

          if (ch.target === "image1") {
            addCircle("image1", ch);
          } else if (ch.target === "image2") {
            addCircle("image2", ch);
          } else if (ch.target === "both") {
            addCircle("image1", ch);
            addCircle("image2", ch);
          }
        });
      }

      function resetGame() {
        changes.forEach(ch => {
          ch.found = false;
        });

        foundCount = 0;
        bannerEl.hidden = true;

        updateCounter();
        renderList();
        renderMarks();

        setMessage(startMessage, "");
      }

      function getClickPointInBaseCoords(box, clientX, clientY) {
        const img = box.querySelector(".diff-img");
        const rect = img.getBoundingClientRect();

        if (!rect.width || !rect.height) return null;

        const x = ((clientX - rect.left) / rect.width) * COORD_W;
        const y = ((clientY - rect.top) / rect.height) * COORD_H;

        if (x < 0 || y < 0 || x > COORD_W || y > COORD_H) return null;

        return { x, y };
      }

      function isHit(ch, imgName, point) {
        if (ch.found) return false;

        const targetMatches =
          ch.target === "both" ||
          ch.target === imgName;

        if (!targetMatches) return false;

        const dx = point.x - ch.x;
        const dy = point.y - ch.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist <= ch.r;
      }

      function handleTap(box, clientX, clientY) {
        const imgName = box.dataset.img;
        const point = getClickPointInBaseCoords(box, clientX, clientY);
        if (!point) return;

        const hit = changes.find(ch => isHit(ch, imgName, point));

        if (!hit) {
          setMessage("לא כאן... נסה שוב 🔍", "miss");
          return;
        }

        hit.found = true;
        foundCount++;

        updateCounter();
        renderList();
        renderMarks();

        setMessage(`יפה מאוד! מצאתם: ${hit.text}`, "hit");

        if (foundCount >= changes.length) {
          bannerEl.hidden = false;
          setMessage("מצוין! כל ההבדלים נמצאו 🎉", "hit");
        }
      }

      function onPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;

        // שתי אצבעות / עט / עכבר נוסף — לא נחשב ניסיון תשובה
        if (!e.isPrimary) return;

        pointerState = {
          pointerId: e.pointerId,
          box: e.currentTarget,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          moved: false
        };
      }

      function onPointerMove(e) {
        if (!pointerState || pointerState.pointerId !== e.pointerId) return;

        pointerState.lastX = e.clientX;
        pointerState.lastY = e.clientY;

        const dx = Math.abs(e.clientX - pointerState.startX);
        const dy = Math.abs(e.clientY - pointerState.startY);

        if (dx > 8 || dy > 8) {
          pointerState.moved = true;
        }
      }

      function onPointerUp(e) {
        if (!pointerState || pointerState.pointerId !== e.pointerId) return;

        const state = pointerState;
        pointerState = null;

        if (state.moved) return;

        handleTap(state.box, e.clientX, e.clientY);
      }

      function onPointerCancel(e) {
        if (!pointerState || pointerState.pointerId !== e.pointerId) return;
        pointerState = null;
      }

      imgBoxes.forEach(box => {
        box.addEventListener("pointerdown", onPointerDown, { passive: true });
        box.addEventListener("pointermove", onPointerMove, { passive: true });
        box.addEventListener("pointerup", onPointerUp, { passive: true });
        box.addEventListener("pointercancel", onPointerCancel, { passive: true });
      });

      resetBtn.addEventListener("click", resetGame);

      resetGame();

      return {
        reset: resetGame
      };
    }
  });
})();
