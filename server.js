// Mercato Manager — serveur de jeu (aucune dépendance, Node 18+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {RAW,BASEPOOL,CLUBS,AB}=require('./data.js');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data');
fs.mkdirSync(DIR,{recursive:true});const FILE=path.join(DIR,'game.json');
let G;try{G=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){G={t0:Date.now()-864e5,players:{},auctions:{},listings:{},matches:{},seq:1}}
let dirty=true;
const save=()=>{if(!dirty)return;dirty=false;try{fs.writeFileSync(FILE+'.tmp',JSON.stringify(G));fs.renameSync(FILE+'.tmp',FILE)}catch(e){console.error('save',e.message)}};
setInterval(save,5000);['SIGTERM','SIGINT'].forEach(s=>process.on(s,()=>{dirty=true;save();process.exit(0)}));
const FORM={"4-3-3":[4,3,3],"4-4-2":[4,4,2],"3-5-2":[3,5,2]},BP=432e5,MATCH_MS=362000;
const hs=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)};
const r2=n=>Math.round(n*100)/100,rnd=(a,b)=>a+Math.random()*(b-a);
const fm=n=>(n>=10?n.toFixed(1):n.toFixed(2)).replace('.',',')+' M€';
function mk(n,club,lg,pos,ovr,price){
  const j=k=>((hs(n+k)%9)-4),c=x=>Math.max(25,Math.min(97,Math.round(x))),h=hs(n);
  const b={ATT:[2,4,-6,-28,-4],MID:[-4,-6,4,-12,-2],DEF:[-6,-26,-6,4,4],GK:[-20,-35,-10,4,0]}[pos];
  return{id:++G.seq,n,club,lg:AB[lg]||lg,pos,ovr,price,value:price,num:{GK:1,DEF:2+h%4,MID:6+h%5,ATT:7+h%5}[pos],st:[0,1,2,3,4].map(i=>c(ovr+b[i]+j(i))),form:0}}
const parse=t=>t.split('\n').map(l=>{const a=l.split('|');return mk(a[0],a[1],a[2],a[3],+a[4],+a[5])});
function starter(){const all=parse(BASEPOOL),pick=(pos,n)=>{const c=all.filter(p=>p.pos===pos),r=[];while(r.length<n&&c.length)r.push(c.splice(Math.floor(Math.random()*c.length),1)[0]);return r};
  return[...pick('GK',2),...pick('DEF',5),...pick('MID',4),...pick('ATT',3)].map(p=>{const d=Math.round(rnd(-2,2));return{...p,ovr:p.ovr+d,st:p.st.map(v=>v+d)}})}
const POOL=parse(RAW).sort((a,b)=>hs(a.n)-hs(b.n));
const OLD=new Set(['Alexandre Oukidja','Paul Bernardoni','Hamari Traoré','Clément Michelin','Maxime Estève','Warmed Omari','Jordan Amavi','Pierre Lees-Melou','Morgan Sanson','Nabil Bentaleb','Farid Boulaya','Gaëtan Laborde','Terem Moffi','Andy Delort']);
for(const u of Object.values(G.players))if(u.squad.length===14&&u.W+u.D+u.L===0&&u.squad.every(p=>OLD.has(p.n))){u.squad=starter();u.xi=null;u.xf='';dirty=true}
const byId=id=>G.players[id],byTok=t=>Object.values(G.players).find(p=>p.token===t);
const minb=a=>a.leader?r2(a.bid*1.03):a.bid;
const avail=u=>r2(u.budget-Object.values(G.auctions).filter(a=>a.leader===u.id&&a.end>Date.now()).reduce((s,a)=>s+a.bid,0));
/* ---- équipe ---- */
function slots(f){const[d,m,a]=FORM[f],L={DEF:{3:['DC','DC','DC'],4:['DG','DC','DC','DD']},MID:{3:['MG','MC','MD'],4:['MG','MC','MC','MD'],5:['MG','MC','MC','MC','MD']},ATT:{2:['BU','BU'],3:['AG','BU','AD']}};
  return[['GK','GB'],...L.DEF[d].map(l=>['DEF',l]),...L.MID[m].map(l=>['MID',l]),...L.ATT[a].map(l=>['ATT',l])]}
function fixXI(u){
  const S2=slots(u.fm),used=new Set(),xi=[];
  S2.forEach((s,i)=>{const p=u.xf===u.fm&&u.xi&&u.squad.find(q=>q.id===u.xi[i]);if(p&&!used.has(p.id)){used.add(p.id);xi.push(p.id)}else xi.push(null)});
  S2.forEach((s,i)=>{if(xi[i])return;const c=u.squad.filter(q=>!used.has(q.id)).sort((a,b)=>(b.pos===s[0])-(a.pos===s[0])||b.ovr-a.ovr)[0];if(c){used.add(c.id);xi[i]=c.id}});
  u.xi=xi;u.xf=u.fm}
function lineup(u){fixXI(u);return slots(u.fm).map((s,i)=>{const p=u.squad.find(q=>q.id===u.xi[i]);return p?{...p,pos:s[0],st:p.pos===s[0]?p.st:p.st.map(v=>Math.round(v*.85))}:null}).filter(Boolean)}
const cmp=x=>x.map(p=>({id:p.id,n:p.n,pos:p.pos,ovr:p.ovr,st:p.st}));
/* ---- simulation ---- */
function strength(x){
  const m=(a,f)=>a.length?a.reduce((s,p)=>s+f(p),0)/a.length:30,g=k=>x.filter(p=>p.pos===k);
  return{att:.6*m(g('ATT'),p=>p.st[1])+.4*m(g('MID'),p=>p.st[2]),def:.5*m(g('DEF'),p=>p.st[3])+.3*m(g('GK'),p=>p.st[3])+.2*m(g('MID'),p=>p.st[3]+12)}}
const pois=l=>{const L=Math.exp(-l);let k=0,p=1;do{k++;p*=Math.random()}while(p>L);return k-1};
function simM(xa,xb,bn,s){
  const A=strength(xa),B=xb?strength(xb):{att:s+rnd(-4,4),def:s+rnd(-4,4)},ev=[];
  const lam=(a,d)=>Math.max(.2,Math.min(4.5,1.3*Math.exp((a-d)/24)));
  const ga=pois(lam(A.att,B.def)),gb=pois(lam(B.att,A.def));
  const w=p=>({ATT:3,MID:1.2,DEF:.25,GK:.01}[p.pos])*Math.pow(p.st[1]/60,3);
  const goal=(x,sd)=>{if(!x)return ev.push({m:Math.ceil(rnd(1,90)),s:sd,n:'Joueur de '+bn,i:0});let r=Math.random()*x.reduce((t,p)=>t+w(p),0),sc=x[0];for(const p of x){r-=w(p);if(r<=0){sc=p;break}}ev.push({m:Math.ceil(rnd(1,90)),s:sd,n:sc.n,i:sc.id})};
  for(let i=0;i<ga;i++)goal(xa,0);for(let i=0;i<gb;i++)goal(xb,1);ev.sort((a,b)=>a.m-b.m);return{ev,ga,gb}}
function applyRes(u,m){
  const side=m.a===u.id?0:1,gf=side?m.gb:m.ga,gc=side?m.ga:m.gb,r=gf>gc?'W':gf<gc?'L':'D',rep=[];
  u[r]++;u.pts+=r==='W'?3:r==='D'?1:0;u.budget=r2(u.budget+(r==='W'?.6:r==='D'?.25:.1));
  (side?m.xb:m.xa).forEach(q=>{const p=u.squad.find(z=>z.id===q.id);if(!p)return;
    const g=m.ev.filter(e=>e.s===side&&e.i===q.id).length;
    const n=Math.max(4,Math.min(10,6.2+rnd(-.5,1)+g*.9+(r==='W'?.4:r==='L'?-.3:0)+((gc===0&&(q.pos==='GK'||q.pos==='DEF'))?.5:0)));p.form=n;
    let f=1+(n-6.6)*.05;if(n>=7.5&&Math.random()<.4){p.ovr++;p.st=p.st.map(v=>Math.min(97,v+1));f*=1.04;rep.push(p.n)}
    p.value=Math.max(.1,r2(p.value*f))});
  u.note=`${r==='W'?'Victoire':r==='D'?'Match nul':'Défaite'} ${gf}-${gc} · valeurs mises à jour`+(rep.length?` · ⬆️ ${rep.join(', ')}`:'')}
/* ---- boucle serveur ---- */
function tick(){
  const now=Date.now();
  if(G.ver!==2){G.ver=2;G.t0=now;G.recent=[];for(const id in G.auctions)if(!G.auctions[id].settled)G.auctions[id].end=now;dirty=true}
  const b0=Math.floor((now-G.t0)/BP);
  if(!G.auctions[`c${b0}n0`]){ // 5 nouveaux joueurs à chaque période de 12 h ; les stars arrivent progressivement
    const cap=78+Math.floor(b0/2);G.recent=G.recent||[];
    let c=POOL.filter(p=>p.ovr<=cap&&!G.recent.includes(p.n));if(c.length<5)c=POOL.filter(p=>p.ovr<=cap);if(c.length<5)c=POOL.slice();
    for(let i=0;i<5;i++){const p={...c.splice(Math.floor(Math.random()*c.length),1)[0],id:++G.seq},id=`c${b0}n${i}`;G.recent.push(p.n);
      G.auctions[id]={id,p,end:G.t0+(b0+1)*BP,bid:p.price,leader:null,ln:'',bidders:[],settled:false}}
    G.lastBatch={id:'c'+b0,end:G.t0+(b0+1)*BP,names:[0,1,2,3,4].map(i=>G.auctions[`c${b0}n${i}`].p.n)};G.recent=G.recent.slice(-60);dirty=true}
  for(const id in G.auctions){const a=G.auctions[id];
    if(now>=a.end&&!a.settled){a.settled=true;dirty=true;const u=a.leader&&byId(a.leader);
      if(u){u.budget=r2(u.budget-a.bid);u.squad.push({...a.p,id:++G.seq,new:1})}}
    if(now>a.end+864e5){delete G.auctions[id];dirty=true}}
  for(const id in G.listings){const l=G.listings[id],u=byId(l.sid);if(!u||!u.squad.some(p=>p.id===l.p.id)){delete G.listings[id];dirty=true}}
  for(const id in G.matches){const m=G.matches[id];
    if(m.status==='live'&&!m.done&&now-m.t0>MATCH_MS){m.done=true;dirty=true;const a=byId(m.a);if(a)applyRes(a,m);const b=m.b&&byId(m.b);if(b)applyRes(b,m)}
    if(m.status==='open'&&now-m.ts>36e5){const a=byId(m.a);if(a&&a.mid===id)a.mid=null;delete G.matches[id];dirty=true}
    if(m.done&&now-m.t0>864e5){delete G.matches[id];dirty=true}}}
setInterval(tick,1000);tick();
/* ---- actions ---- */
const clean=s=>String(s||'').replace(/[<>&"']/g,'').trim().slice(0,16);
const pinH=(n,p)=>crypto.createHash('sha256').update(n.toLowerCase()+':'+p+':mm').digest('hex');
const A={
  join(b){const name=clean(b.name),pin=String(b.pin||'');
    if(name.length<2)return{err:'Pseudo trop court'};if(!/^\d{4}$/.test(pin))return{err:'Code à 4 chiffres requis'};
    if(!CLUBS[b.lg])return{err:'Championnat invalide'};
    if(Object.values(G.players).some(p=>p.name.toLowerCase()===name.toLowerCase()))return{err:'Pseudo déjà pris'};
    const id=crypto.randomBytes(5).toString('hex'),token=crypto.randomBytes(20).toString('hex');
    G.players[id]={id,token,name,pinh:pinH(name,pin),lg:b.lg,budget:100,squad:starter(),W:0,D:0,L:0,pts:0,fm:'4-3-3',xi:null,xf:'',mid:null,opp:null,note:''};dirty=true;return{token}},
  login(b){const name=clean(b.name),u=Object.values(G.players).find(p=>p.name.toLowerCase()===name.toLowerCase());
    if(!u||u.pinh!==pinH(u.name,String(b.pin||'')))return{err:'Pseudo ou code incorrect'};return{token:u.token}},
  bid(b,u){const a=G.auctions[b.id],v=parseFloat(b.amount),now=Date.now();
    if(!a||now>=a.end)return{err:'Enchère terminée'};if(!v||v<minb(a))return{err:'Mise trop basse : minimum '+fm(minb(a))};
    if(v>avail(u)+(a.leader===u.id?a.bid:0))return{err:'Budget insuffisant'};
    a.bid=r2(v);a.leader=u.id;a.ln=u.name;if(!a.bidders.includes(u.id))a.bidders.push(u.id);dirty=true},
  sell(b,u){const p=u.squad.find(q=>q.id===b.pid),v=parseFloat(b.price);if(!p||!(v>0))return{err:'Prix invalide'};
    if(Object.values(G.listings).some(l=>l.p.id===p.id))return{err:'Déjà en vente'};
    const id='l'+(++G.seq);G.listings[id]={id,sid:u.id,sn:u.name,p:{...p},price:r2(v)};dirty=true},
  unsell(b,u){const l=G.listings[b.id];if(l&&l.sid===u.id){delete G.listings[b.id];dirty=true}},
  buy(b,u){const l=G.listings[b.id],s=l&&byId(l.sid);if(!l||!s)return{err:'Plus disponible'};if(s===u)return{err:'C’est ton joueur'};
    if(l.price>avail(u))return{err:'Budget insuffisant'};
    s.squad=s.squad.filter(p=>p.id!==l.p.id);s.budget=r2(s.budget+l.price);u.budget=r2(u.budget-l.price);u.squad.push({...l.p,new:1});delete G.listings[b.id];dirty=true},
  fm(b,u){if(FORM[b.fm]){u.fm=b.fm;dirty=true}},
  slot(b,u){fixXI(u);const i=+b.i;if(!u.squad.some(p=>p.id===b.pid)||!(i>=0&&i<11))return;const j=u.xi.indexOf(b.pid);if(j>=0)u.xi[j]=u.xi[i];u.xi[i]=b.pid;dirty=true},
  num(b,u){const p=u.squad.find(q=>q.id===b.pid);if(p){p.num=Math.max(1,Math.min(99,Math.round(+b.num)||1));dirty=true}},
  seen(b,u){const p=u.squad.find(q=>q.id===b.pid);if(p&&p.new){delete p.new;dirty=true}},
  bot(b,u){if(u.mid&&G.matches[u.mid])return{err:'Match déjà en cours'};const o=opp(u),id='m'+(++G.seq);
    G.matches[id]={id,status:'live',a:u.id,an:u.name,bn:o.n,xa:cmp(lineup(u)),...simM(cmp(lineup(u)),null,o.n,o.s),t0:Date.now(),ts:Date.now()};u.mid=id;u.opp=null;u.note='';dirty=true},
  create(b,u){if(u.mid&&G.matches[u.mid])return{err:'Match déjà en cours'};const id='m'+(++G.seq);
    G.matches[id]={id,status:'open',a:u.id,an:u.name,xa:cmp(lineup(u)),ts:Date.now()};u.mid=id;u.note='';dirty=true},
  join_m(b,u){const m=G.matches[b.id];if(!m||m.status!=='open'||m.a===u.id)return{err:'Match plus disponible'};
    if(u.mid&&G.matches[u.mid])return{err:'Match déjà en cours'};const xb=cmp(lineup(u));
    Object.assign(m,{status:'live',b:u.id,bn:u.name,xb,...simM(m.xa,xb,'',0),t0:Date.now()});u.mid=m.id;u.note='';dirty=true},
  cancel(b,u){const m=G.matches[u.mid];if(m&&m.status==='open'&&m.a===u.id){delete G.matches[u.mid];u.mid=null;dirty=true}},
  ack(b,u){const m=G.matches[u.mid];if(!m||m.done){u.mid=null;dirty=true}else return{err:'Le match n’est pas terminé'}}
};
function opp(u){if(!u.opp){const c=CLUBS[u.lg].split(',')[Math.floor(Math.random()*10)].split(' '),s=+c.pop();u.opp={n:c.join(' '),s}}return u.opp}
function stateFor(u){
  fixXI(u);const now=Date.now(),m=u.mid&&G.matches[u.mid];
  const strip=m=>{const{xa,xb,...r}=m;return r};
  const T=Object.values(G.players).map(p=>({id:p.id,name:p.name,lg:p.lg,W:p.W,D:p.D,L:p.L,pts:p.pts,w:r2(p.budget+p.squad.reduce((s,q)=>s+q.value,0))})).sort((a,b)=>b.pts-a.pts||b.w-a.w);
  return{now,batch:G.lastBatch||null,me:{id:u.id,name:u.name,lg:u.lg,budget:u.budget,avail:avail(u),squad:u.squad,xi:u.xi,fm:u.fm,slots:slots(u.fm),W:u.W,D:u.D,L:u.L,pts:u.pts,note:u.note,opp:opp(u)},
    auctions:Object.values(G.auctions).filter(a=>a.end>now||a.end>now-18e5||(a.bidders.includes(u.id)&&a.end>now-864e5)).map(a=>({id:a.id,p:a.p,end:a.end,bid:a.bid,min:minb(a),lead:a.leader===u.id?'me':a.leader?'other':'',ln:a.ln,bidded:a.bidders.includes(u.id)})),
    listings:Object.values(G.listings),open:Object.values(G.matches).filter(x=>x.status==='open'&&x.a!==u.id).map(x=>({id:x.id,an:x.an})),
    match:m?strip(m):null,rank:T.slice(0,100),pos:T.findIndex(t=>t.id===u.id)+1,total:T.length}}
/* ---- HTTP ---- */
const tries={};
const json=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  if(req.method==='GET'&&u.pathname==='/api/state'){const p=byTok(u.searchParams.get('token')||'x');return p?json(res,200,stateFor(p)):json(res,401,{err:'auth'})}
  if(req.method==='POST'&&u.pathname.startsWith('/api/')){let d='';
    req.on('data',c=>{d+=c;if(d.length>5000)req.destroy()});
    req.on('end',()=>{let b;try{b=JSON.parse(d||'{}')}catch(e){return json(res,400,{err:'bad'})}
      const act=u.pathname.slice(5).replace('join_m','join_m'),f=A[act==='joinm'?'join_m':act];if(!f)return json(res,404,{err:'?'});
      if(act==='join'||act==='login'){const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress,k=ip+act,t=Date.now();tries[k]=(tries[k]||[]).filter(x=>t-x<36e5);if(tries[k].length>=30)return json(res,429,{err:'Trop d’essais, réessaie plus tard'});tries[k].push(t);
        const r=f(b);return json(res,200,r||{})}
      const p=byTok(b.token||'x');if(!p)return json(res,401,{err:'auth'});
      const r=f(b,p)||{};try{json(res,200,{...r,state:stateFor(p)})}catch(e){json(res,500,{err:'erreur'})}});return}
  const file=u.pathname==='/'?'index.html':u.pathname.slice(1);
  const fp=path.join(__dirname,'public',path.normalize(file).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(fp,(e,data)=>{if(e){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(data)})
}).listen(PORT,()=>console.log('Mercato Manager sur le port '+PORT));
