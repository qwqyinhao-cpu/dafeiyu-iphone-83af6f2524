import {clamp,rotate,orientationGravity,screenVector,releaseVelocity,stepBody,fitBody} from './physics.mjs';
import {updateDragGesture} from './gesture.mjs';
import {readMotion,applyShake} from './motion.mjs';

const $=id=>document.getElementById(id),canvas=$('pet'),ctx=canvas.getContext('2d',{alpha:true});
const defaults={gravity:1,motion:1,bounce:0.62,size:0.9,talk:true,lines:['摸摸头，今天也要开心。','大肥鱼在这里陪你。','慢慢来，我不着急。']};
const storageKey='dafeiyu.motion.v1';
let settings={...defaults};
try{
  const saved=JSON.parse(localStorage.getItem(storageKey));
  if(saved&&typeof saved==='object'){
    for(const key of ['gravity','motion','bounce','size'])if(Number.isFinite(saved[key]))settings[key]=clamp(saved[key],key==='bounce'?0.2:0.3,key==='size'?1.15:key==='bounce'?0.9:2);
    if(typeof saved.talk==='boolean')settings.talk=saved.talk;
    if(Array.isArray(saved.lines))settings.lines=saved.lines.filter(s=>typeof s==='string'&&s.trim()).slice(0,30).map(s=>s.slice(0,100));
  }
}catch{}
const body={x:0,y:0,vx:0,vy:0,angle:0,omega:0,width:150,height:188};
let room={left:8,top:76,right:380,bottom:720},W=390,H=844,dpr=1,manifest=null,clips=[],current=null;
let animStarted=0,animationToken=0,loaded=new Map(),pending=new Map(),drag=null,ready=false;
let lastFrame=0,lastInteraction=0,nextIdle=0,bubbleUntil=0,lastImpact=-10,contact=false,shakeEnergy=0;
let randomGroup=[],clickGroup=[],dragClip=null,idleClip=null,nextTalk=0,forcedUntil=0;
const motion={enabled:false,orientationAt:0,motionAt:0,lastSample:0,gx:0,gy:1,raw:{},status:'运动传感器尚未开启',lastFeedback:0};

function save(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}
function layout(){
  W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const header=document.querySelector('header').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect();
  room={left:8,top:Math.max(72,header.bottom+8),right:W-8,bottom:Math.max(header.bottom+72,footer.top-14)};
  const height=Math.max(24,Math.min(228,(room.bottom-room.top)*0.62,W*0.6))*settings.size;
  body.height=height;body.width=height*151.2/189;
  if(!ready){body.x=W/2;body.y=Math.min(H*0.47,room.bottom-height/2-15);}else fitBody(body,room);
}
addEventListener('resize',layout);layout();

function say(text,duration=3){if(!text)return;$('bubble').textContent=text;$('bubble').hidden=false;bubbleUntil=performance.now()/1000+duration;}
function sayRandom(){if(settings.talk&&settings.lines.length)say(settings.lines[Math.floor(Math.random()*settings.lines.length)]);}
function updateBubble(now){
  if(now>bubbleUntil){$('bubble').hidden=true;return;}
  $('bubble').style.left=clamp(body.x,120,W-120)+'px';
  $('bubble').style.top=clamp(body.y-body.height/2-18,105,H-170)+'px';
}

async function loadImage(file){
  if(loaded.has(file)){const image=loaded.get(file);loaded.delete(file);loaded.set(file,image);return image;}
  if(pending.has(file))return pending.get(file);
  const promise=new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
      loaded.set(file,image);while(loaded.size>4)loaded.delete(loaded.keys().next().value);resolve(image);
    };image.onerror=()=>reject(new Error('动画图片未能加载'));image.src='assets/'+file;
  }).finally(()=>pending.delete(file));
  pending.set(file,promise);return promise;
}
async function play(clip,{force=0}={}){
  if(!clip)return;
  if(clip===current&&!force)return;
  const token=++animationToken;
  try{await loadImage(clip.pages[0].file);}catch{
    if(token===animationToken){$('loading').textContent='这个动作暂时没能加载，请联网后重试。';$('loading').hidden=false;setTimeout(()=>{$('loading').hidden=true;},4000);}return;
  }
  if(token!==animationToken)return;
  current=clip;animStarted=performance.now()/1000;forcedUntil=animStarted+force;
  if(clip.pages.length>1)loadImage(clip.pages[1].file).catch(()=>{});
}
function random(list){return list[Math.floor(Math.random()*list.length)];}
function animation(now){
  if(!current)return;
  const elapsed=now-animStarted;
  if(elapsed<current.duration||now<forcedUntil)return;
  if(drag?.active){play(dragClip||idleClip,{force:0.1});return;}
  if(Math.hypot(body.vx,body.vy)>350){play(dragClip||idleClip,{force:0.1});return;}
  if(now>nextIdle){play(random(randomGroup)||idleClip,{force:0.1});nextIdle=now+12+Math.random()*14;}
  else play(idleClip,{force:0.1});
}
function draw(now){
  ctx.clearRect(0,0,W,H);
  const shadow=clamp((room.bottom-body.y-body.height/2)/H,0,0.7);
  ctx.save();ctx.fillStyle=`rgba(48,82,130,${0.12-shadow*0.12})`;ctx.beginPath();ctx.ellipse(body.x,room.bottom+4,body.width*(0.4-shadow*0.22),5,0,0,Math.PI*2);ctx.fill();ctx.restore();
  if(!current)return;
  const frame=Math.floor(Math.max(0,now-animStarted)*current.fps)%current.frames;
  const page=current.pages.find(p=>frame>=p.start&&frame<p.start+p.count)||current.pages[0];
  const image=loaded.get(page.file);
  if(!image){loadImage(page.file).catch(()=>{});return;}
  const pageIndex=current.pages.indexOf(page),next=current.pages[(pageIndex+1)%current.pages.length];
  if(frame>=page.start+page.count-24&&next!==page)loadImage(next.file).catch(()=>{});
  const local=frame-page.start,sx=(local%current.cols)*current.tileW,sy=Math.floor(local/current.cols)*current.tileH;
  const scale=body.height/189;
  ctx.save();ctx.translate(body.x,body.y);ctx.rotate(body.angle);
  const squash=clamp(shakeEnergy,0,0.09);ctx.scale(1+squash,1-squash);
  ctx.drawImage(image,sx,sy,current.tileW,current.tileH,(current.left-224)*scale,(current.top-136.5)*scale,current.tileW*scale,current.tileH*scale);
  ctx.restore();
}
function tick(timestamp){
  const now=timestamp/1000,dt=lastFrame?Math.min(0.04,now-lastFrame):1/60;lastFrame=now;
  if(ready&&!document.hidden){
    let gx=motion.enabled?motion.gx:0,gy=motion.enabled?motion.gy:1;
    const gravity={x:gx*1100*settings.gravity,y:gy*1100*settings.gravity};
    if(drag?.active){
      body.recoveryTime=0;
      const anchor=rotate(drag.localX,drag.localY,body.angle),tx=drag.x-anchor.x,ty=drag.y-anchor.y;
      const oldX=body.x,oldY=body.y,blend=1-Math.exp(-23*dt);
      body.x+=(tx-body.x)*blend;body.y+=(ty-body.y)*blend;
      body.vx=(body.x-oldX)/dt;body.vy=(body.y-oldY)/dt;
      const inertia=(body.width**2+body.height**2)/12;
      const torque=anchor.y*gravity.x-anchor.x*gravity.y;
      body.omega=clamp((body.omega+torque/inertia*dt)*Math.exp(-4*dt),-8,8);
      body.angle+=body.omega*dt;fitBody(body,room);
    }else{
      let hit=0,recovered=false;const steps=Math.ceil(dt/(1/120));
      for(let i=0;i<steps;i++){const result=stepBody(body,dt/steps,gravity,room,settings.bounce);hit=Math.max(hit,result.impact);contact=result.contact;recovered ||= result.recovered;}
      if(recovered){play(idleClip,{force:1});lastInteraction=now;}
      if(hit>300&&now-lastImpact>0.5){lastImpact=now;shakeEnergy=0.07;play(random(clickGroup)||idleClip,{force:0.35});if(hit>700)sayRandom();}
    }
    shakeEnergy*=Math.exp(-8*dt);animation(now);draw(now);updateBubble(now);
    $('gravityArrow').style.transform=`rotate(${Math.atan2(-gx,gy)*180/Math.PI}deg)`;
    if(settings.talk&&now>nextTalk&&now-lastInteraction>8){sayRandom();nextTalk=now+100+Math.random()*90;}
    if(motion.enabled&&now-motion.motionAt>4&&now-motion.orientationAt>4){
      setSensorStatus('尚未收到运动数据，可在设置中重新开启。');
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function point(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
function localPoint(p){return rotate(p.x-body.x,p.y-body.y,-body.angle);}
function petting(){play(random(clickGroup)||idleClip,{force:1});shakeEnergy=0.035;sayRandom();lastInteraction=performance.now()/1000;}
canvas.addEventListener('pointerdown',event=>{
  if(!ready||drag||event.button>0)return;
  const p=point(event),local=localPoint(p);
  if(Math.abs(local.x)>body.width*0.7||Math.abs(local.y)>body.height*0.6)return;
  event.preventDefault();canvas.setPointerCapture(event.pointerId);
  const now=performance.now()/1000;
  drag={id:event.pointerId,x:p.x,y:p.y,startX:p.x,startY:p.y,t:now,localX:local.x,localY:local.y,head:local.y<-body.height*0.08,active:false,samples:[{...p,t:now}],distance:0};
  body.vx=body.vy=0;body.recoveryTime=0;lastInteraction=now;
});
canvas.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  event.preventDefault();const p=point(event),now=performance.now()/1000;
  if(updateDragGesture(drag,p,now))play(dragClip||idleClip,{force:0.1});
});
function finishPointer(event,cancelled=false){
  if(!drag||event.pointerId!==drag.id)return;
  const now=performance.now()/1000,was=drag;drag=null;
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  if(cancelled){body.vx=body.vy=0;return;}
  if(was.active){
    const v=releaseVelocity(was.samples,now);body.vx=v.x;body.vy=v.y;
    body.omega=clamp(body.omega+(was.localX*v.y-was.localY*v.x)/((body.width**2+body.height**2)/12)*0.18,-14,14);
    play(dragClip||idleClip,{force:0.4});
  }else petting();
  lastInteraction=now;
}
canvas.addEventListener('pointerup',e=>finishPointer(e));canvas.addEventListener('pointercancel',e=>finishPointer(e,true));
canvas.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId){drag=null;body.vx=body.vy=0;}});

function screenAngle(){return screen.orientation?.angle??window.orientation??0;}
function setSensorStatus(text){if(motion.status===text)return;motion.status=text;$('sensorStatus').textContent=text;}
function onOrientation(event){
  if(!motion.enabled||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
  const now=performance.now()/1000,g=orientationGravity(event.beta,event.gamma,screenAngle());
  motion.gx+=0.25*(g.x-motion.gx);motion.gy+=0.25*(g.y-motion.gy);motion.orientationAt=now;
  if(now-motion.motionAt>1)setSensorStatus('倾斜可用，尚未收到甩动数据。');
}
function onMotion(event){
  if(!motion.enabled)return;
  const now=performance.now()/1000,dt=motion.lastSample?clamp(now-motion.lastSample,0.005,0.05):1/60;motion.lastSample=now;
  const sample=readMotion(motion,event,dt);
  if(sample.valid){
    if(now-motion.orientationAt>0.7&&Number.isFinite(motion.raw.x)&&Number.isFinite(motion.raw.y)){
      const screen=screenVector(-motion.raw.x/9.81,motion.raw.y/9.81,screenAngle());
      motion.gx=clamp(screen.x,-1,1);motion.gy=clamp(screen.y,-1,1);
    }
    motion.motionAt=now;
    if(!drag?.active){
      const strength=applyShake(body,sample,dt,screenAngle(),settings.motion);
      if(strength>0.75){
        lastInteraction=now;
        if(strength>5){shakeEnergy=0.06;const rate=event.rotationRate?.alpha;
          if(Number.isFinite(rate))body.omega=clamp(body.omega-rate*Math.PI/180*dt*2.2,-16,16);
          if(now-lastImpact>0.5){play(dragClip||idleClip,{force:0.25});lastImpact=now;}
        }
      }
    }
    setSensorStatus('倾斜与甩动已开启 · 运动数据只在本机处理');
    if(now-motion.lastFeedback>.25){motion.lastFeedback=now;$('hint').textContent=Math.hypot(sample.x,sample.y,sample.z)>3.5?'甩动已收到 · 大肥鱼加速中':'抓起来甩一甩 · 轻轻摸摸头';}
  }
}
async function enableMotion(){
  if(motion.enabled){motion.enabled=false;$('motionButton').textContent='开启倾斜重力';setSensorStatus('已关闭运动传感器');return;}
  if(!isSecureContext){setSensorStatus('运动权限需要 HTTPS，请使用正式安装链接。');say('请使用 HTTPS 安装链接开启运动权限。',5);return;}
  if(!('DeviceMotionEvent' in window)&&!('DeviceOrientationEvent' in window)){setSensorStatus('当前设备没有提供运动传感器，仍可用手指拖拽。');say('这里可以先用手指抓起和甩出。',4);return;}
  try{
    const requests=[];
    if(typeof window.DeviceMotionEvent?.requestPermission==='function')requests.push(window.DeviceMotionEvent.requestPermission());
    if(typeof window.DeviceOrientationEvent?.requestPermission==='function')requests.push(window.DeviceOrientationEvent.requestPermission());
    const results=await Promise.all(requests);
    if(results.some(result=>result!=='granted')){setSensorStatus('运动权限未允许；可以继续用手指互动。');say('允许运动权限后，就能跟着手机倾斜啦。',4);return;}
    motion.enabled=true;motion.lastSample=0;motion.raw={};motion.motionAt=motion.orientationAt=performance.now()/1000;
    $('motionButton').textContent='倾斜重力已开启';setSensorStatus('等待运动数据…');
    addEventListener('deviceorientation',onOrientation);addEventListener('devicemotion',onMotion);
  }catch{setSensorStatus('没有取得运动权限，请在 Safari 中重新开启。');say('请在 Safari 中重新开启运动权限。',4);}
}
$('motionButton').addEventListener('click',enableMotion);

function reset(){body.x=W/2;body.y=Math.min(H*0.45,room.bottom-body.height);body.vx=body.vy=body.omega=body.angle=0;drag=null;play(idleClip,{force:0.2});}
$('resetButton').addEventListener('click',reset);
$('settingsButton').addEventListener('click',()=>{$('settings').showModal();});
$('actionsButton').addEventListener('click',()=>{$('actions').showModal();});
document.querySelectorAll('.close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
for(const key of ['gravity','motion','bounce','size']){
  const input=$(key+'Input');input.value=settings[key];input.addEventListener('input',()=>{settings[key]=Number(input.value);save();if(key==='size')layout();});
}
$('talkInput').checked=settings.talk;$('talkInput').addEventListener('change',()=>{settings.talk=$('talkInput').checked;nextTalk=performance.now()/1000+50;save();});
$('linesInput').value=settings.lines.join('\n');$('linesInput').addEventListener('change',()=>{settings.lines=$('linesInput').value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,30).map(s=>s.slice(0,100));save();});
document.addEventListener('visibilitychange',()=>{lastFrame=0;motion.lastSample=0;drag=null;if(document.hidden){body.vx=body.vy=body.omega=0;}});

let registration=null,offlineBusy=false;
async function prepareOffline(){
  if(offlineBusy||!manifest)return;
  if(!('serviceWorker' in navigator)||!isSecureContext){$('offlineStatus').textContent='请使用正式 HTTPS 链接保存离线动画。';return;}
  offlineBusy=true;$('offlineButton').disabled=true;
  try{
    registration=registration||await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
    const cache=await caches.open('dafeiyu-assets-'+(manifest.assetVersion||manifest.version));
    const urls=clips.flatMap(c=>c.pages.map(p=>'assets/'+p.file));
    let completed=0;
    for(const url of urls){
      if(!await cache.match(url)){const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('下载失败');await cache.put(url,response);}
      completed++;$('offlineStatus').textContent=`正在保存 ${completed}/${urls.length}，请保持页面打开…`;
    }
    $('offlineStatus').textContent='动画已保存。可开启飞行模式，再从主屏幕图标打开检查。';
    navigator.storage?.persist?.().catch(()=>{});
  }catch(error){$('offlineStatus').textContent='未全部保存，请联网后重试。已下载的动画会保留。';}
  finally{offlineBusy=false;$('offlineButton').disabled=false;}
}
$('offlineButton').addEventListener('click',prepareOffline);
async function start(){
  try{
    const response=await fetch('assets/animations.json',{cache:'no-cache'});if(!response.ok)throw new Error('manifest');manifest=await response.json();clips=manifest.clips;
    idleClip=clips.find(c=>c.name==='待机呼吸休闲')||clips.find(c=>c.group==='idle')||clips[0];
    dragClip=clips.find(c=>c.group==='drag');clickGroup=clips.filter(c=>c.group==='click');
    randomGroup=clips.filter(c=>c.group==='random'||c.group==='idle');
    await play(idleClip);if(!current)throw new Error('image');ready=true;$('loading').hidden=true;
    nextIdle=performance.now()/1000+14;nextTalk=performance.now()/1000+90;
    const titles={click:'摸摸她',idle:'休息一下',drag:'抓起来',move:'走一走',turn:'转个身',random:'日常小动作',events:'特别动作'};
    for(const group of ['click','idle','drag','move','turn','random','events']){
      const matches=clips.filter(c=>c.group===group);if(!matches.length)continue;
      const heading=document.createElement('div');heading.className='groupTitle';heading.textContent=titles[group];$('actionList').append(heading);
      for(const clip of matches){const button=document.createElement('button');button.textContent=clip.name.replace(/^点击回应[- ]*/,'');button.addEventListener('click',()=>{play(clip,{force:clip.duration});$('actions').close();lastInteraction=performance.now()/1000;});$('actionList').append(button);}
    }
    $('versionStatus').textContent='版本 '+manifest.version;
    if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;return r.update();}).catch(()=>{});
  }catch{
    $('loading').textContent='大肥鱼还没有醒来，点这里重新加载。';$('loading').style.pointerEvents='auto';$('loading').addEventListener('click',()=>location.reload(),{once:true});
  }
}
start();
// A newly activated worker owns a new shell; reload once to avoid mixed old/new modules.
let updated=false;
navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(!updated){updated=true;location.reload();}});
