(()=>{

const ID="monopol";

async function init(root,ctx){

const api=ctx.CONTROL_API;
const p=ctx.parashaLabel;

/* load board */
const bRes=await fetch(`${api}?mode=monopol_board&parasha=${encodeURIComponent(p)}`);
const boardData=(await bRes.json()).row;

/* load data */
const dRes=await fetch(`${api}?mode=monopol_data&parasha=${encodeURIComponent(p)}`);
const rows=(await dRes.json()).rows||[];

const cells=(boardData?.cells||"").split(",");

const state={
pos:[0,0],
score:[0,0],
turn:0
};

root.innerHTML=`
<div class="mono-wrap">
<div class="mono-board"></div>
<div class="mono-ui">
<button class="mono-btn">זרוק קובייה</button>
<div class="mono-card" hidden></div>
</div>
</div>
`;

const boardEl=root.querySelector(".mono-board");
const btn=root.querySelector(".mono-btn");
const card=root.querySelector(".mono-card");

/* build board */
cells.forEach((c,i)=>{
const d=document.createElement("div");
d.className="mono-cell";
d.dataset.i=i;
d.textContent=c;
boardEl.appendChild(d);
});

function drawPawns(){
document.querySelectorAll(".mono-pawns").forEach(e=>e.remove());
state.pos.forEach((p,i)=>{
const cell=boardEl.children[p];
const wrap=document.createElement("div");
wrap.className="mono-pawns";
wrap.textContent=i===0?"🧒":"🤖";
cell.appendChild(wrap);
});
}
drawPawns();

btn.onclick=()=>{
const roll=1+Math.floor(Math.random()*6);
const pl=state.turn;
state.pos[pl]+=roll;
if(state.pos[pl]>=cells.length-1)state.pos[pl]=cells.length-1;
drawPawns();
handleCell(pl);
state.turn=pl?0:1;
};

function handleCell(pl){
const id=cells[state.pos[pl]];
const data=rows.find(r=>r.id==id);
if(!data)return;

card.hidden=false;

if(data.type==="quiz"){
card.innerHTML=`<b>${data.title}</b><br>${data.text}<br>
${["a1","a2","a3","a4"].map(a=>`<button class="ans">${data[a]}</button>`).join("")}`;
card.querySelectorAll(".ans").forEach(b=>{
b.onclick=()=>{
if(b.textContent==data.correct)state.score[pl]+=2;
card.hidden=true;
};
});
}
else if(data.type==="bonus"){state.score[pl]+=1;}
else if(data.type==="trap"){state.score[pl]=Math.max(0,state.score[pl]-1);}
else if(data.type==="station"){state.score[pl]+=1;}
}
return{reset(){}};
}

(function reg(){
if(window.ParashaGamesRegister){
window.ParashaGamesRegister(ID,{init});
}else setTimeout(reg,50);
})();

})();
