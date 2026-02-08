/* קובץ מלא: classify.js – Parasha "מגירון" (classification drawers game)
   שינויים שבוצעו:
   ✔ הסרת מספר מגירה ומונה (מה-UI)
   ✔ כפתורי רמה 1/2 + ברירת מחדל רמה 1
   ✔ ביטול גרירה → לחיצה על מגירה
   ✔ תיקון ניקוד (לא מסירים ניקוד)
   ✔ הגדלת משך הודעות באנר +1 שניה
   ✔ הסתרת אזור הפתק בסיום
   ✔ סטטוס חדש: ניסיונות | התאמות מתוך סה"כ | זמן
*/

(() => {
"use strict";

const MODE="classify";
const GAME_ID="classify";

/* ===== helpers ===== */

function parseCsvList(s){
  return String(s||"").split(",").map(x=>x.trim()).filter(Boolean);
}
function clampInt(n,min,max){
  const x=Number(n);
  if(!Number.isFinite(x))return min;
  return Math.max(min,Math.min(max,Math.trunc(x)));
}
function randInt_(min,max){
  const a=Math.ceil(min);
  const b=Math.floor(max);
  if(window.crypto&&window.crypto.getRandomValues){
    const buf=new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return a+(buf[0]%(b-a+1));
  }
  return a+Math.floor(Math.random()*(b-a+1));
}
function shuffleArrayInPlace_(arr){
  for(let i=arr.length-1;i>0;i--){
    const k=randInt_(0,i);
    const t=arr[i];arr[i]=arr[k];arr[k]=t;
  }
  return arr;
}

/* ⚠️ שינוי חשוב: לא מסירים ניקוד */
function sanitizeWord_(w){
  let s=String(w||"").trim();
  s=s.replace(/\s+/g,"");
  return s;
}

function parseDrawers_(raw){
  const parts=parseCsvList(raw);
  const out=[];
  for(const p of parts){
    const [titleRaw,emojiRaw]=String(p).split("|");
    const title=String(titleRaw||"").trim();
    const emoji=String(emojiRaw||"").trim();
    if(!title)continue;
    out.push({title,emoji});
  }
  return out;
}

function parseItems_(raw,drawersCount){
  const parts=parseCsvList(raw);
  const out=[];
  for(const p of parts){
    const [wordRaw,drawerIdxRaw]=String(p).split("|");
    const word=sanitizeWord_(wordRaw);
    const idx=clampInt(drawerIdxRaw,1,Math.max(1,drawersCount));
    if(!word)continue;
    out.push({word,target:idx});
  }
  return out;
}

/* ===== init ===== */

async function init(rootEl,ctx){
  const {CONTROL_API,parashaLabel}=ctx;
  const url=`${CONTROL_API}?mode=${encodeURIComponent(MODE)}&parasha=${encodeURIComponent(parashaLabel)}`;
  const res=await fetch(url);
  const data=await res.json();

  if(!data||!data.row){
    rootEl.innerHTML=`<div>לא נמצאו נתונים למשחק "מגירון".</div>`;
    return{reset:()=>{}};
  }

  const row=data.row||{};
  const title=String(row.classify_title||"מגירון").trim();
  const type=String(row.classify_type||"").trim();
  const drawers=parseDrawers_(row.classify_drawers||"");

  const rawL1=(row.level1_items!=null&&String(row.level1_items).trim()!=="")
    ?row.level1_items:row.classify_items;

  const rawL2=row.level2_items;

  const itemsL1=parseItems_(rawL1||"",drawers.length);
  const itemsL2=parseItems_(rawL2||"",drawers.length);

  if(!drawers.length||( !itemsL1.length && !itemsL2.length)){
    rootEl.innerHTML=`<div>חסרים נתונים למשחק.</div>`;
    return{reset:()=>{}};
  }

  return render(rootEl,{title,type,drawers,itemsL1,itemsL2});
}

/* ===== UI ===== */

function render(rootEl,model){

rootEl.innerHTML=`
<div class="mg-wrap">
<div class="mg-cardbox">

<div class="mg-topbar">
  <div class="mg-actions">
    <button type="button" class="mg-btn mg-reset">איפוס</button>
    <button type="button" class="mg-btn mg-level is-on" data-level="1">רמה 1</button>
    <button type="button" class="mg-btn mg-level" data-level="2">רמה 2</button>
  </div>
  <div class="mg-status"></div>
</div>

<div class="mg-banner" hidden><span class="mg-banner-text"></span></div>

<div class="mg-titleRow">
  <div class="mg-title"></div>
  <p class="mg-subtitle"></p>
</div>

<div class="mg-currentFrame">
  <div class="mg-currentLabel">הפתק הנוכחי</div>
  <div class="mg-note mg-currentNote"><span class="mg-currentWord"></span></div>
  <div class="mg-currentHint">הצבע על המגירה המתאימה</div>
</div>

<div class="mg-grid"></div>

</div>
</div>`.trim();

/* ===== refs ===== */

const elGrid=rootEl.querySelector(".mg-grid");
const elStatus=rootEl.querySelector(".mg-status");
const elTitle=rootEl.querySelector(".mg-title");
const elSubtitle=rootEl.querySelector(".mg-subtitle");
const banner=rootEl.querySelector(".mg-banner");
const bannerText=rootEl.querySelector(".mg-banner-text");
const elCurrentFrame=rootEl.querySelector(".mg-currentFrame");
const elCurrentWord=rootEl.querySelector(".mg-currentWord");
const btnReset=rootEl.querySelector(".mg-reset");
const levelBtns=[...rootEl.querySelectorAll(".mg-level")];

elTitle.textContent=model.title||"מגירון";
elSubtitle.textContent=model.type?`מה המגירות מייצגות: ${model.type}`:"";

/* ===== state ===== */

let state={
level:1,
correct:0,
wrong:0,
remaining:0,
deck:[],
current:null,
drawerCounts:new Array(model.drawers.length).fill(0),
drawerNotesEls:new Array(model.drawers.length).fill(null),
startTime:0,
timer:null
};

/* ===== drawers build ===== */

for(let i=0;i<model.drawers.length;i++){
const d=model.drawers[i];
const accent=accentForIndex_(i+1);

const dw=document.createElement("section");
dw.className="mg-dw";
dw.style.setProperty("--accent",accent);
dw.setAttribute("data-drawer-idx",String(i+1));

dw.innerHTML=`
<div class="mg-dwHead">
<div class="mg-dwTitle">
<span class="mg-dwTitleText"></span>
${d.emoji?`<span class="mg-dwEmoji">${d.emoji}</span>`:""}
</div>
</div>
<div class="mg-dwBody">
<div class="mg-slot"></div>
<div class="mg-front"><div class="mg-handle"></div></div>
</div>`;

dw.querySelector(".mg-dwTitleText").textContent=d.title;

const slot=dw.querySelector(".mg-slot");
state.drawerNotesEls[i]=slot;

/* ✔ לחיצה במקום גרירה */
dw.addEventListener("click",()=>attemptDropOnDrawer_(i+1));

elGrid.appendChild(dw);
}

/* ===== status ===== */

function updateStatus_(){
const total=state.correct+state.wrong;
const elapsed=Math.floor((Date.now()-state.startTime)/1000);
const mm=String(Math.floor(elapsed/60)).padStart(2,"0");
const ss=String(elapsed%60).padStart(2,"0");
elStatus.textContent=`ניסיונות: ${total} | התאמות: ${state.correct}/${state.total} | זמן: ${mm}:${ss}`;
}

/* ===== banner ===== */

function showBanner_(text,durationMs=1500){ // +1 שניה
bannerText.textContent=text;
banner.hidden=false;
requestAnimationFrame(()=>banner.classList.add("is-on"));
return new Promise(r=>{
setTimeout(()=>{
banner.classList.remove("is-on");
setTimeout(()=>{banner.hidden=true;r();},140);
},durationMs);
});
}

/* ===== deck ===== */

function buildDeck_(){
const src=(state.level===1)?model.itemsL1:model.itemsL2;
const deck=src.map(x=>({word:x.word,target:x.target}));
shuffleArrayInPlace_(deck);
state.total=deck.length;
return deck;
}

function setCurrent_(item){
state.current=item||null;
if(!item){
elCurrentWord.textContent="";
elCurrentFrame.style.display="none"; // ✔ הסתרה בסיום
return;
}
elCurrentFrame.style.display="";
elCurrentWord.textContent=item.word;
}

function next_(){
const item=state.deck.pop()||null;
state.remaining=state.deck.length;
setCurrent_(item);
updateStatus_();
if(!item){
showBanner_("כל הכבוד! 🎉 סיימת את כל הפתקים.",2500);
}
}

function resetAll_(){
state.correct=0;
state.wrong=0;
state.drawerCounts.fill(0);
state.deck=buildDeck_();
state.remaining=state.deck.length;
state.startTime=Date.now();

if(state.timer)clearInterval(state.timer);
state.timer=setInterval(updateStatus_,1000);

for(const slot of state.drawerNotesEls){
slot.innerHTML="";
}
next_();
}

btnReset.addEventListener("click",resetAll_);

/* ===== level buttons ===== */

levelBtns.forEach(btn=>{
btn.addEventListener("click",()=>{
levelBtns.forEach(b=>b.classList.remove("is-on"));
btn.classList.add("is-on");
state.level=Number(btn.dataset.level)||1;
resetAll_();
});
});

/* ===== drop logic ===== */

async function attemptDropOnDrawer_(drawerIdx){
if(!state.current)return;

const idx=clampInt(drawerIdx,1,model.drawers.length);
const isCorrect=(idx===Number(state.current.target));

if(!isCorrect){
state.wrong++;
updateStatus_();
await showBanner_("לא כאן 🙂 נסה מגירה אחרת",1850); // +1s
return;
}

state.correct++;
updateStatus_();

const slot=state.drawerNotesEls[idx-1];
const mini=document.createElement("div");
mini.className="mg-note mg-mini";
mini.textContent=state.current.word;
slot.appendChild(mini);

await showBanner_("יפה! ✅",1550); // +1s
next_();
}

/* ===== init ===== */

resetAll_();
return{reset:()=>resetAll_()};
}

/* ===== palette ===== */

function accentForIndex_(n){
const palette=["#7aa3ff","#4fd1c5","#b388ff","#ffcc66","#ff7a7a","#5ad1ff","#7bd389","#fda4af"];
return palette[(Number(n)-1)%palette.length];
}

/* ===== register ===== */

(function registerWhenReady_(){
if(window.ParashaGamesRegister){
window.ParashaGamesRegister(GAME_ID,{init:(rootEl,ctx)=>init(rootEl,ctx)});
return;
}
setTimeout(registerWhenReady_,30);
})();

})();
