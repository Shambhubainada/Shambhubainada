const stacks = [
  {shed:"09",stack:"S-01",commodity:"Wheat",status:"Normal",fumigation:"26.08.26",days:6},
  {shed:"14",stack:"S-05",commodity:"Rice",status:"Under Cover",fumigation:"28.08.26",days:4},
  {shed:"18",stack:"S-09",commodity:"Wheat",status:"Fumigation Due",fumigation:"20.07.26",days:43},
  {shed:"20",stack:"S-12",commodity:"Rice",status:"Infested",fumigation:"22.08.26",days:11},
  {shed:"09",stack:"S-14",commodity:"Wheat",status:"Normal",fumigation:"30.08.26",days:2}
];

function updateClock(){
  const d=new Date();
  document.getElementById("dateTime").textContent =
    d.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"})+
    "  "+d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
setInterval(updateClock,1000); updateClock();

function render(list=stacks){
  document.getElementById("totalStacks").textContent=stacks.length;
  document.getElementById("normalStacks").textContent=stacks.filter(x=>x.status==="Normal").length;
  document.getElementById("underCover").textContent=stacks.filter(x=>x.status==="Under Cover").length;
  document.getElementById("fumigationDue").textContent=stacks.filter(x=>x.status==="Fumigation Due").length;
  document.getElementById("infestedStacks").textContent=stacks.filter(x=>x.status==="Infested").length;

  document.getElementById("stackTable").innerHTML=list.map((x,i)=>{
    const cls=x.status==="Normal"?"normal":x.status==="Under Cover"?"cover":"due";
    return `<tr><td>${i+1}</td><td>${x.shed}</td><td>${x.stack}</td><td>${x.commodity}</td>
    <td class="status ${cls}">${x.status}</td><td>${x.fumigation}</td><td>${x.days}</td></tr>`;
  }).join("");
}
document.getElementById("search").addEventListener("input",e=>{
  const q=e.target.value.toLowerCase();
  render(stacks.filter(x=>Object.values(x).join(" ").toLowerCase().includes(q)));
});
render();
