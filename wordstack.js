/* wordstack.js – Parasha "תיבה ואות" game (module)
   NEW FLOW – single button: סיימתי / תורי ▶
*/

(() => {
  "use strict";

  function parseCsvList(s){
    return String(s||"").split(",").map(x=>x.trim()).filter(Boolean);
  }

  function normalizeWord_(w){
    return String(w||"").trim().replace(/\s+/g,"");
  }

  function isHebrewOnly_(w){
    return /^[\u0590-\u05FF]+$/.test(w);
  }

  // basic local judge (placeholder)
  function judgeWord_(word){
    const w = normalizeWord_(word);
    if(!w) return false;
    if(!isHebrewOnly_(w)) return false;
    if(w.length < 2) return false;
    return true;
  }

  // ✅ FIX — מאפשר הוספת אות בכל מקום (גם באמצע)
  function isOneLetterAdded_(oldWord,newWord){
    const a = normalizeWord_(oldWord);
    const b = normalizeWord_(newWord);

    if(b.length !== a.length + 1) return false;

    let i=0,j=0,skipped=0;

    while(i<a.length && j<b.length){
      if(a[i]===b[j]){
        i++; j++;
      }else{
        skipped++;
        if(skipped>1) return false;
        j++;
      }
    }
    return true;
  }

  function wait(ms){
    return new Promise(r=>setTimeout(r,ms));
  }

  function randInt_(min,max){
    return min + Math.floor(Math.random()*(max-min+1));
  }

  function pickRandom_(arr){
    if(!arr || !arr.length) return "";
    return arr[randInt_(0,arr.length-1)];
  }

  // מחשב – מהלך בסיסי
  function computerPickMove_(current){
    const letters=["א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ל","מ","נ","ס","ע","פ","צ","ק","ר","ש","ת"];
    for(const ch of letters){
      const try1 = ch + current;
      if(judgeWord_(try1)) return try1;

      const try2 = current + ch;
      if(judgeWord_(try2)) return try2;
    }
    return "";
  }

  async function initWordstack(rootEl,ctx){

    const { CONTROL_API, parashaLabel } = ctx;

    const url = `${CONTROL_API}?mode=wordstack&parasha=${encodeURIComponent(parashaLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if(!data || !data.row){
      rootEl.innerHTML = `<div>לא נמצאו נתוני תיבה.</div>`;
      return {reset:()=>{}};
    }

    const level1List = parseCsvList(data.row.level1_words).map(normalizeWord_);
    const level2List = parseCsvList(data.row.level2_words).map(normalizeWord_);

    const model = { level1List, level2List };

    return render(rootEl,model);
  }

  function render(rootEl,model){

    rootEl.innerHTML = `
    <div class="ws-wrap">
      <div class="ws-cardbox">

        <div class="ws-topbar">
          <div class="ws-actions">
            <div class="ws-levels">
              <button class="ws-btn ws-level-1 is-active">רמה 1</button>
              <button class="ws-btn ws-level-2">רמה 2</button>
            </div>
            <button class="ws-btn ws-reset">איפוס</button>
          </div>

          <div class="ws-status"></div>
        </div>

        <div class="ws-lockedCard">
          <div class="ws-lockedTitle">המילה הנוכחית</div>
          <div class="ws-lockedWord"></div>
        </div>

        <div class="ws-openCard">
          <div class="ws-openTitle">כאן כותבים מילה חדשה</div>
          <textarea class="ws-openInput"></textarea>

          <div class="ws-openActions">
            <button class="ws-btn ws-mainBtn">סיימתי</button>
          </div>
        </div>

      </div>
    </div>
    `;

    const elStatus = rootEl.querySelector(".ws-status");
    const elLocked = rootEl.querySelector(".ws-lockedWord");
    const elInput = rootEl.querySelector(".ws-openInput");
    const btnMain = rootEl.querySelector(".ws-mainBtn");
    const btnReset = rootEl.querySelector(".ws-reset");
    const btnLevel1 = rootEl.querySelector(".ws-level-1");
    const btnLevel2 = rootEl.querySelector(".ws-level-2");

    let state=null;

    function currentList_(){
      return state.level===2 ? model.level2List : model.level1List;
    }

    function pickStartWord_(){
      const w = pickRandom_(currentList_());
      return w || "בראשית";
    }

    function setStatus_(txt){
      elStatus.textContent = txt;
    }

    function renderLocked_(){
      elLocked.textContent = state.word || "";
    }

    function setChildTurn_(){
      state.turn="child";
      btnMain.textContent="סיימתי";
      elInput.disabled=false;
      setStatus_("התור שלך — בנה מילה חדשה והוסף אות אחת");
      elInput.focus();
    }

    function setComputerWait_(){
      state.turn="computer";
      elInput.disabled=true;
      setStatus_("המחשב חושב…");
    }

    function setChildAfterComputer_(){
      state.turn="afterComputer";
      btnMain.textContent="תורי ▶";
      elInput.disabled=true;
      setStatus_("עכשיו תורך");
    }

    function resetAll_(){
      state={
        level:1,
        word:pickStartWord_(),
        turn:"child"
      };
      renderLocked_();
      elInput.value="";
      setChildTurn_();
    }

    async function onChildSubmit_(){

      const typed = normalizeWord_(elInput.value);
      const current = normalizeWord_(state.word);

      if(!isOneLetterAdded_(current,typed)) return;
      if(!judgeWord_(typed)) return;

      // נועל מיד
      state.word = typed;
      renderLocked_();
      elInput.value="";

      await computerTurn_();
    }

    async function computerTurn_(){

      setComputerWait_();

      await wait(randInt_(1200,2000));

      const next = computerPickMove_(state.word);

      if(!next){
        setChildTurn_();
        return;
      }

      elInput.value = next;
      state.word = next;
      renderLocked_();

      setChildAfterComputer_();
    }

    btnMain.addEventListener("click", async ()=>{
      if(state.turn==="child"){
        await onChildSubmit_();
      }else if(state.turn==="afterComputer"){
        elInput.value="";
        setChildTurn_();
      }
    });

    btnReset.addEventListener("click",()=>resetAll_());

    btnLevel1.addEventListener("click",()=>{
      state.level=1;
      resetAll_();
    });

    btnLevel2.addEventListener("click",()=>{
      state.level=2;
      resetAll_();
    });

    resetAll_();

    return { reset:()=>resetAll_() };
  }

  window.ParashaGamesRegister("wordstack",{
    init:async(rootEl,ctx)=>initWordstack(rootEl,ctx)
  });

})();
