export const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
export const normalizeAngle = a => Math.atan2(Math.sin(a),Math.cos(a));
export function rotate(x,y,angle) { const c=Math.cos(angle),s=Math.sin(angle);return {x:c*x-s*y,y:s*x+c*y}; }
export function screenVector(x,y,angle=0) {return rotate(x,y,-angle*Math.PI/180);}
export function orientationGravity(beta,gamma,angle=0) {
  const b=beta*Math.PI/180,g=gamma*Math.PI/180;
  return screenVector(Math.cos(b)*Math.sin(g),Math.sin(b),angle);
}
export function motionImpulse(ax,ay,dt,angle=0,sensitivity=1) {
  const v=screenVector(-ax,ay,angle);
  if(Math.hypot(v.x,v.y)<0.75)return {x:0,y:0};
  return {x:clamp(v.x,-35,35)*78*sensitivity*clamp(dt,0.005,0.05),
    y:clamp(v.y,-35,35)*78*sensitivity*clamp(dt,0.005,0.05)};
}
export function releaseVelocity(samples,now,cap=2400) {
  const recent=samples.filter(p=>now-p.t<=0.12);
  if(recent.length<2 || now-recent.at(-1).t>0.15)return {x:0,y:0};
  const first=recent[0],last=recent.at(-1),dt=last.t-first.t;
  if(dt<0.015)return {x:0,y:0};
  let x=(last.x-first.x)/dt,y=(last.y-first.y)/dt;
  const speed=Math.hypot(x,y),limited=cap*(1-Math.exp(-speed/cap));
  if(speed>0){x*=limited/speed;y*=limited/speed;}
  return {x,y};
}
export function bodyCorners(body) {
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>rotate(x*body.width/2,y*body.height/2,body.angle));
}
export function fitBody(body,room) {
  const corners=bodyCorners(body),ex=Math.max(...corners.map(p=>Math.abs(p.x))),ey=Math.max(...corners.map(p=>Math.abs(p.y)));
  body.x=clamp(body.x,room.left+ex,Math.max(room.left+ex,room.right-ex));
  body.y=clamp(body.y,room.top+ey,Math.max(room.top+ey,room.bottom-ey));
}
export function stepBody(body,dt,gravity,room,restitution=0.62) {
  const inertia=(body.width**2+body.height**2)/12;
  body.vx=clamp((body.vx+gravity.x*dt)*Math.exp(-0.12*dt),-3200,3200);
  body.vy=clamp((body.vy+gravity.y*dt)*Math.exp(-0.12*dt),-3200,3200);
  body.omega=clamp(body.omega*Math.exp(-0.45*dt),-18,18);
  body.x+=body.vx*dt;body.y+=body.vy*dt;body.angle=normalizeAngle(body.angle+body.omega*dt);
  let impact=0,contact=false;
  const walls=[{nx:1,ny:0,axis:'x',limit:room.left,side:1},
    {nx:-1,ny:0,axis:'x',limit:room.right,side:-1},
    {nx:0,ny:1,axis:'y',limit:room.top,side:1},
    {nx:0,ny:-1,axis:'y',limit:room.bottom,side:-1}];
  for(let pass=0;pass<3;pass++)for(const wall of walls){
    const corners=bodyCorners(body);
    let corner=corners[0],penetration=0;
    for(const p of corners){
      const value=(wall.limit-(body[wall.axis]+p[wall.axis]))*wall.side;
      if(value>penetration){penetration=value;corner=p;}
    }
    if(penetration<=0)continue;
    const contacts=corners.filter(p=>Math.abs((wall.limit-(body[wall.axis]+p[wall.axis]))*wall.side-penetration)<0.5);
    corner={x:contacts.reduce((sum,p)=>sum+p.x,0)/contacts.length,y:contacts.reduce((sum,p)=>sum+p.y,0)/contacts.length};
    contact=true;body.x+=wall.nx*penetration;body.y+=wall.ny*penetration;
    const rx=corner.x,ry=corner.y;
    const cvx=body.vx-body.omega*ry,cvy=body.vy+body.omega*rx;
    const vn=cvx*wall.nx+cvy*wall.ny;
    if(vn>=0)continue;
    impact=Math.max(impact,-vn);
    const cross=rx*wall.ny-ry*wall.nx;
    const bounce=-vn<80 ? 0 : restitution;
    const j=-(1+bounce)*vn/(1+cross*cross/inertia);
    body.vx+=j*wall.nx;body.vy+=j*wall.ny;body.omega+=j*cross/inertia;
    const tx=-wall.ny,ty=wall.nx,crossT=rx*ty-ry*tx;
    const vt=(body.vx-body.omega*ry)*tx+(body.vy+body.omega*rx)*ty;
    const jt=clamp(-vt/(1+crossT*crossT/inertia),-j*0.22,j*0.22);
    body.vx+=jt*tx;body.vy+=jt*ty;body.omega+=jt*crossT/inertia;
  }
  if(contact){body.vx*=Math.exp(-0.6*dt);body.vy*=Math.exp(-0.6*dt);body.omega*=Math.exp(-3*dt);}
  const floor=body.y+Math.max(...bodyCorners(body).map(p=>p.y))>=room.bottom-1;
  const settled=floor&&gravity.y>200&&Math.abs(body.vx)<220&&Math.abs(body.vy)<100&&Math.abs(body.omega)<2.5;
  body.recoveryTime=settled?(body.recoveryTime||0)+dt:0;
  let recovered=false;
  if(body.recoveryTime>.35){
    const previous=body.angle;
    body.angle*=Math.exp(-8*dt);body.omega*=Math.exp(-18*dt);
    if(Math.abs(body.angle)<.015){body.angle=0;body.omega=0;recovered=previous!==0;}
    body.y=room.bottom-Math.max(...bodyCorners(body).map(p=>p.y));fitBody(body,room);
  }
  return {impact,contact,recovered};
}
