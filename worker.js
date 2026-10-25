// Linksy – Cloudflare Worker. VSI podatki (profili, objave, slike, prijatelji, povabila, gesla) so v ZASEBNEM repozitoriju PRIV_REPO.
// Nihče ne vidi nikogar, dokler se ne povežete s povabilom. Javni repozitorij je samo za stran (index.html).
// Spremenljivke: PRIV_REPO="uporabnik/linksy-zasebno" (ZASEBEN),
// (neobvezno) ITER=50000, če Cloudflare pri prijavi javi napako zaradi CPU (brezplačni paket)
// BRANCH="main", ORIGIN="https://uporabnik.github.io", GH_TOKEN=skrivnost (Contents: Read and write za zasebni repozitorij).
const DATA="data/linksy.json",KEYS="data/keys.json",FR="data/friends.json",RX=["like","love","haha","wow","sad","angry"],J={"Content-Type":"application/json"};
const str=(s,n)=>String(s==null?"":s).slice(0,n),BR=e=>e.BRANCH||"main",PR=e=>e.PRIV_REPO||e.REPO;
const b64=u=>{let s="";for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const dec=b=>new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g,"")),c=>c.charCodeAt(0)));
const gh=(e,p,o={},R)=>fetch(`https://api.github.com/repos/${R||e.REPO}/contents/${p}`,{...o,headers:{Authorization:"Bearer "+e.GH_TOKEN,Accept:"application/vnd.github+json","User-Agent":"linksy-worker","X-GitHub-Api-Version":"2022-11-28",...(o.headers||{})}});
async function read(e,p,R){const q=`${p}?ref=${BR(e)}`,r=await gh(e,q,{},R);if(r.status===404)return{sha:null,v:null};if(!r.ok)throw new Error("GitHub "+r.status);const j=await r.json();const t=j.content?dec(j.content):await(await gh(e,q,{headers:{Accept:"application/vnd.github.raw+json"}},R)).text();return{sha:j.sha,v:t?JSON.parse(t):null}}
const write=(e,p,c,sha,msg,R)=>gh(e,p,{method:"PUT",body:JSON.stringify({message:msg,content:c,branch:BR(e),...(sha?{sha}:{})})},R);
async function update(e,p,fn,R){for(let i=0;i<5;i++){const{sha,v}=await read(e,p,R),nv=fn(v||{});if(nv===undefined)return v;const r=await write(e,p,b64(new TextEncoder().encode(JSON.stringify(nv))),sha,"linksy: "+p,R);if(r.ok)return nv;if(r.status!==409&&r.status!==422)throw new Error("GitHub "+r.status);await new Promise(x=>setTimeout(x,150*(i+1)))}throw new Error("Preveč hkratnih zapisov, poskusite znova")}
const hex=u=>[...new Uint8Array(u)].map(x=>x.toString(16).padStart(2,"0")).join(""),rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const sha=async s=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
async function pbk(pw,salt,it){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);return hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:new TextEncoder().encode(salt),iterations:it},k,256))}
const TRY=globalThis.__try||(globalThis.__try={}),UN=/^[A-Za-z0-9_.-]{3,20}$/;
async function authOk(e,uid,key){const hk=await sha(key);if(KC[uid+hk])return true;const{v:K}=await read(e,KEYS,PR(e));if(K&&K.k&&(K.k[uid]||[]).includes(hk)){KC[uid+hk]=1;return true}return false}
const RL2=globalThis.__rl2||(globalThis.__rl2={}),INV="data/invites.json";
async function dataOf(e){const c=globalThis.__dc;if(c&&Date.now()-c.t<8000)return c.d;const{v}=await read(e,DATA,PR(e)),d=v||{users:{},posts:[]};globalThis.__dc={d,t:Date.now()};return d}
async function sigOf(e,n){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(e.SIGN_KEY||e.GH_TOKEN),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(n))).slice(0,32)}
const FC=globalThis.__fc||(globalThis.__fc={}),RL=globalThis.__rl||(globalThis.__rl={});
async function friendsOf(e,uid){const c=FC[uid];if(c&&Date.now()-c.t<60000)return c.f;const{v}=await read(e,FR,PR(e)),f=(v&&v[uid]&&v[uid].f)||[];FC[uid]={f,t:Date.now()};return f}
const KC=globalThis.__kc||(globalThis.__kc={}),ID=/^u_[a-z0-9]{10}$/,EMPTY=()=>({f:[],in:[],out:[]});
export class Conv{
 constructor(ctx){this.sql=ctx.storage.sql;this.sql.exec("CREATE TABLE IF NOT EXISTS m(id INTEGER PRIMARY KEY AUTOINCREMENT,f TEXT,x TEXT,t INTEGER)")}
 async fetch(req){const p=new URL(req.url).pathname,b=await req.json(),j=o=>new Response(JSON.stringify(o));
  if(p==="/add"){const t=Date.now(),id=this.sql.exec("INSERT INTO m(f,x,t) VALUES(?,?,?) RETURNING id",b.f,b.x,t).one().id;
   this.sql.exec("DELETE FROM m WHERE id<=?",id-20000);return j({m:{id,f:b.f,x:b.x,t}})}
  if(p==="/list"){const r=this.sql.exec("SELECT id,f,x,t FROM m WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT ?",b.before,b.before,b.n).toArray().reverse();return j({m:r})}
  if(p==="/del"){const c=this.sql.exec("DELETE FROM m WHERE id=? AND f=?",b.id,b.f);return j({n:c.rowsWritten})}
  if(p==="/count"){return j({n:this.sql.exec("SELECT COUNT(*) AS n FROM m WHERE id>? AND f=?",b.after,b.from).one().n})}
  return j({})}
}
export class Inbox{
 constructor(ctx,env){this.ctx=ctx;this.env=env;ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping","pong"))}
 async fetch(req){const u=new URL(req.url);
  if(u.pathname==="/ws"){const[c,s]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(s);
   await this.ctx.storage.put({uid:u.searchParams.get("uid"),f:JSON.parse(u.searchParams.get("f")||"[]")});
   return new Response(null,{status:101,webSocket:c,headers:{"Sec-WebSocket-Protocol":"linksy"}})}
  if(u.pathname==="/push"){const t=await req.text();for(const w of this.ctx.getWebSockets())w.send(t);return new Response("ok")}
  if(u.pathname==="/deliver"){const{from,d}=await req.json(),f=(await this.ctx.storage.get("f"))||[];
   if(!f.includes(from))return new Response("ne",{status:403});
   for(const w of this.ctx.getWebSockets())w.send(JSON.stringify({from,d}));return new Response("ok")}
  return new Response("?",{status:404})}
 async webSocketMessage(ws,msg){let m;try{m=JSON.parse(msg)}catch(x){return}
  if(m.t!=="sig"||typeof m.to!=="string")return;
  const uid=await this.ctx.storage.get("uid"),f=(await this.ctx.storage.get("f"))||[];
  if(!f.includes(m.to)||JSON.stringify(m.d||{}).length>20000)return;
  await this.env.INBOX.get(this.env.INBOX.idFromName(m.to)).fetch("https://do/deliver",{method:"POST",body:JSON.stringify({from:uid,d:m.d})})}
 webSocketClose(ws){try{ws.close()}catch(x){}}
}
export default{async fetch(req,e){
 if(new URL(req.url).pathname==="/ws"){
  if(req.headers.get("Upgrade")!=="websocket")return new Response("Pričakovan WebSocket",{status:426});
  if(e.ORIGIN&&req.headers.get("Origin")!==e.ORIGIN)return new Response("Napačen izvor",{status:403});
  const tk=(req.headers.get("Sec-WebSocket-Protocol")||"").split(",").map(x=>x.trim()).find(x=>x.startsWith("u_"))||"",uid=tk.slice(0,12),key=tk.slice(13);
  try{if(!ID.test(uid)||key.length<24||!(await authOk(e,uid,key)))return new Response("Ni dovoljeno",{status:403});
   const{v}=await read(e,FR,PR(e)),f=(v&&v[uid]&&v[uid].f)||[];
   return e.INBOX.get(e.INBOX.idFromName(uid)).fetch("https://do/ws?uid="+uid+"&f="+encodeURIComponent(JSON.stringify(f)),req)}
  catch(err){return new Response("Napaka: "+err.message,{status:500})}}
 const cors={"Access-Control-Allow-Origin":e.ORIGIN||"*","Access-Control-Allow-Headers":"Content-Type,X-Uid,X-Key","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
 const out=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...J,...cors}});
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 const cache=caches.default,ck=new Request(new URL(req.url).origin+"/__data");
 const cput=d=>cache.put(ck,new Response(JSON.stringify(d),{headers:{...J,"Cache-Control":"max-age=15"}}));
 try{
  if(req.method==="GET"){const u=new URL(req.url);
   if(u.pathname.startsWith("/img/")){const n=u.pathname.slice(5);if(!/^[A-Za-z0-9_.-]{5,80}$/.test(n)||(await sigOf(e,n))!==u.searchParams.get("t"))return new Response("Ni dovoljeno",{status:403});
    const r=await gh(e,`images/${n}?ref=${BR(e)}`,{headers:{Accept:"application/vnd.github.raw+json"}},PR(e));if(!r.ok)return new Response("Ni slike",{status:404});
    return new Response(r.body,{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=31536000, immutable","Cross-Origin-Resource-Policy":"cross-origin"}})}
   return out({ok:true,app:"linksy"})}
  if(req.method!=="POST")return out({e:"Metoda ni dovoljena"},405);
  const raw=await req.text();if(raw.length>7500000)return out({e:"Zahteva je prevelika"},413);
  const b=JSON.parse(raw),IT=+e.ITER||100000;
  if(b.t==="register"||b.t==="login"){
   const un=str(b.un,20).trim(),pw=str(b.pw,100),lk=un.toLowerCase(),now=Date.now(),T=TRY[lk]=(TRY[lk]||[]).filter(x=>now-x<600000);
   if(!UN.test(un)||pw.length<6)return out({e:"Neveljavno uporabniško ime ali geslo (geslo vsaj 6 znakov)."},400);
   if(T.length>=10)return out({e:"Preveč poskusov. Poskusite čez nekaj minut."},429);
   if(b.t==="register"){const ipk="ip:"+(req.headers.get("CF-Connecting-IP")||"x"),R=TRY[ipk]=(TRY[ipk]||[]).filter(x=>now-x<3600000);
    if(R.length>=5)return out({e:"Preveč novih računov z istega naslova. Poskusite pozneje."},429);
    const salt=rnd(16),h=await pbk(pw,salt,IT),uid="u_"+rnd(5),key=rnd(16),hk=await sha(key);let taken=false;
    await update(e,KEYS,d=>{d.acc=d.acc||{};d.k=d.k||{};if(d.acc[lk]){taken=true;return}d.acc[lk]={uid,un,salt,h,it:IT};d.k[uid]=[hk];return d},PR(e));
    if(taken)return out({e:"Uporabniško ime je zasedeno. Izberite drugo."},409);
    R.push(now);KC[uid+hk]=1;return out({uid,key,un})}
   const{v:K}=await read(e,KEYS,PR(e)),a=K&&K.acc&&K.acc[lk];
   if(!a||await pbk(pw,a.salt,a.it||IT)!==a.h){T.push(now);return out({e:"Napačno uporabniško ime ali geslo."},401)}
   const key=rnd(16),hk=await sha(key);await update(e,KEYS,d=>{d.k=d.k||{};const l=d.k[a.uid]=d.k[a.uid]||[];l.push(hk);while(l.length>8)l.shift();return d},PR(e));
   KC[a.uid+hk]=1;return out({uid:a.uid,key,un:a.un})}
  const uid=req.headers.get("X-Uid")||"",key=req.headers.get("X-Key")||"";
  if(!ID.test(uid)||key.length<24)return out({e:"Neveljavna identiteta"},400);
  const hk=await sha(key);
  if(!KC[uid+hk]){const{v:K}=await read(e,KEYS,PR(e));if(!(K&&K.k&&(K.k[uid]||[]).includes(hk)))return out({e:"Seja ni veljavna"},403);KC[uid+hk]=1}
  if(b.t==="ice"){const fb={iceServers:[{urls:"stun:stun.cloudflare.com:3478"},{urls:"stun:stun.l.google.com:19302"}]};
   if(e.TURN_KEY_ID&&e.TURN_API_TOKEN){try{const r=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${e.TURN_KEY_ID}/credentials/generate-ice-servers`,{method:"POST",headers:{Authorization:"Bearer "+e.TURN_API_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({ttl:86400})});
    if(r.ok){const j=await r.json(),l=[].concat(j.iceServers||[]).map(s=>({...s,urls:[].concat(s.urls).filter(x=>!/:53(\?|$)/.test(x))})).filter(s=>s.urls.length);if(l.length)return out({iceServers:l})}}catch(x){}}
   return out(fb)}
  if(/^msg\./.test(b.t)){
   const fl=await friendsOf(e,uid),ck=id=>e.CONV.get(e.CONV.idFromName([uid,id].sort().join("_")));
   const call=async(st,p,body)=>(await st.fetch("https://do"+p,{method:"POST",body:JSON.stringify(body||{})})).json();
   const push=(u,o)=>e.INBOX.get(e.INBOX.idFromName(u)).fetch("https://do/push",{method:"POST",body:JSON.stringify(o)});
   if(b.t==="msg.unread"){const seen=b.seen||{},res={};await Promise.all(fl.slice(0,100).map(async f=>{const r=await call(ck(f),"/count",{after:+seen[f]||0,from:f});if(r.n)res[f]=r.n}));return out({u:res})}
   const o=b.with||b.to;if(!ID.test(o)||!fl.includes(o))return out({e:"Ta oseba ni vaš prijatelj"},403);
   const st=ck(o);
   if(b.t==="msg.hist")return out({m:(await call(st,"/list",{n:300,before:+b.before||0})).m});
   if(b.t==="msg.send"){const x=str(b.x,2000).trim();if(!x)return out({e:"Prazno sporočilo"},400);
    const now=Date.now(),a=RL[uid]=(RL[uid]||[]).filter(t=>now-t<60000);if(a.length>=30)return out({e:"Preveč sporočil, počakajte minuto."},429);a.push(now);
    const r=await call(st,"/add",{f:uid,x});await push(uid,{ev:"msg",with:o,m:r.m});await push(o,{ev:"msg",with:uid,m:r.m});return out({m:r.m})}
   if(b.t==="msg.del"){const r=await call(st,"/del",{id:+b.id,f:uid});if(r.n){await push(uid,{ev:"del",with:o,id:+b.id});await push(o,{ev:"del",with:uid,id:+b.id})}return out({ok:true})}
   return out({e:"Neznano dejanje"},400)}
  if(b.t==="me"){const{v}=await read(e,FR,PR(e));return out({fr:(v&&v[uid])||EMPTY()})}
  if(b.t==="friend.rm"){const o=b.id;if(!ID.test(o)||o===uid)return out({e:"Neveljavna oseba"},400);
   const F=await update(e,FR,d=>{const x=d[uid],y=d[o];if(x)x.f=x.f.filter(z=>z!==o);if(y)y.f=y.f.filter(z=>z!==uid);return d},PR(e));
   delete FC[uid];delete FC[o];return out({ok:true,fr:(F&&F[uid])||EMPTY()})}
  if(/^friend\./.test(b.t))return out({e:"Prijatelje dodajate samo s povabilom."},403);
  if(b.t==="sync"){const fl=await friendsOf(e,uid),set=new Set([uid,...fl]),d=await dataOf(e),users={};
   for(const id of set)if(d.users&&d.users[id])users[id]=d.users[id];
   const posts=(d.posts||[]).filter(p=>set.has(p.a)).slice(-200).map(p=>({...p,r:Object.fromEntries(Object.entries(p.r||{}).filter(([u])=>set.has(u))),cm:(p.cm||[]).filter(c=>set.has(c.u))}));
   return out({users,posts})}
  if(/^invite\./.test(b.t)){const now=Date.now();
   if(b.t==="invite.create"){const al="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",code=Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>al[x%32]).join("");let full=false;
    await update(e,INV,d=>{d.i=d.i||{};for(const k in d.i){const c=d.i[k];if((c.used||c.exp<now)&&now-(c.used?c.used.t:c.exp)>2592000000)delete d.i[k]}
     if(Object.values(d.i).filter(c=>c.by===uid&&!c.used&&c.exp>now).length>=10){full=true;return}d.i[code]={by:uid,exp:now+604800000};return d},PR(e));
    if(full)return out({e:"Imate že 10 aktivnih povabil. Nekatera prekličite ali počakajte, da potečejo."},400);return out({code})}
   if(b.t==="invite.list"){const{v}=await read(e,INV,PR(e));return out({i:Object.entries((v&&v.i)||{}).filter(([k,c])=>c.by===uid&&!c.used&&c.exp>now).map(([code,c])=>({code,exp:c.exp}))})}
   if(b.t==="invite.revoke"){const code=str(b.code,20);await update(e,INV,d=>{if(d.i&&d.i[code]&&d.i[code].by===uid&&!d.i[code].used){delete d.i[code];return d}},PR(e));return out({ok:true})}
   if(b.t==="invite.redeem"){const a=RL2[uid]=(RL2[uid]||[]).filter(t=>now-t<3600000);if(a.length>=10)return out({e:"Preveč poskusov. Poskusite čez eno uro."},429);a.push(now);
    const code=str(b.code,20).toUpperCase().replace(/[^A-Z0-9]/g,"");let inv=null;
    await update(e,INV,d=>{const c=d.i&&d.i[code];if(!c||c.used||c.exp<now||c.by===uid)return;c.used={u:uid,t:now};inv=c;return d},PR(e));
    if(!inv)return out({e:"Povabilo ni veljavno, je poteklo ali je že uporabljeno."},400);
    const F=await update(e,FR,d=>{const g=u=>d[u]=d[u]||EMPTY(),x=g(uid),y=g(inv.by);if(!x.f.includes(inv.by))x.f.push(inv.by);if(!y.f.includes(uid))y.f.push(uid);return d},PR(e));
    delete FC[uid];delete FC[inv.by];return out({ok:true,fr:(F&&F[uid])||EMPTY()})}
   return out({e:"Neznano dejanje"},400)}
  const origin=new URL(req.url).origin,chk=async s=>{try{const u=new URL(s);if(u.origin!==origin||!u.pathname.startsWith("/img/"))return false;return(await sigOf(e,u.pathname.slice(5)))===u.searchParams.get("t")}catch(x){return false}};
  const V=new Set();for(const s of [b.img,b.cover,...(Array.isArray(b.gallery)?b.gallery.slice(0,300):[])])if(typeof s==="string"&&s.length<300&&await chk(s))V.add(s);const url=s=>V.has(s)?s:"";
  if(b.t==="image"){if(typeof b.data!=="string"||b.data.length>7000000||!/^\/9j\/[A-Za-z0-9+\/=]+$/.test(b.data))return out({e:"Dovoljene so samo slike JPEG do približno 5 MB"},400);
   const name=`${uid}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}.jpg`,r=await write(e,"images/"+name,b.data,null,"linksy: slika",PR(e));
   if(!r.ok)return out({e:"GitHub "+r.status},502);return out({url:`${origin}/img/${name}?t=${await sigOf(e,name)}`})}
  const D=await update(e,DATA,d=>{d.users=d.users||{};d.posts=d.posts||[];
   const U=d.users[uid]=d.users[uid]||{id:uid,h:Math.floor(Math.random()*360)};
   const P=()=>d.posts.find(x=>x.id===b.id);
   if(b.t==="profile"){U.n=str(b.n,40)||U.n||"Član";U.bio=str(b.bio,200);U.img=url(b.img);U.cover=url(b.cover);U.gallery=(Array.isArray(b.gallery)?b.gallery:[]).map(url).filter(Boolean).slice(0,300)}
   else if(b.t==="post"){const x=str(b.x,1000);if(!x&&!url(b.img))return d;d.posts.push({id:"p_"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),a:uid,t:Date.now(),x,img:url(b.img),r:{},cm:[],sh:0});d.posts=d.posts.slice(-500)}
   else if(b.t==="comment"){const p=P(),x=str(b.x,300);if(p&&x&&p.cm.length<200)p.cm.push({u:uid,x,t:Date.now()})}
   else if(b.t==="react"){const p=P();if(p){if(RX.includes(b.k))p.r[uid]=b.k;else delete p.r[uid]}}
   else if(b.t==="delpost"){const i=d.posts.findIndex(x=>x.id===b.id&&x.a===uid);if(i>=0)d.posts.splice(i,1)}
   if(Object.keys(d.users).length>3000)throw new Error("Omrežje je polno");return d},PR(e));
  globalThis.__dc={d:D,t:Date.now()};return out({ok:true})
 }catch(err){return out({e:err.message||"Napaka"},500)}
}};
