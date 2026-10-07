import {clamp,screenVector,motionImpulse} from './physics.mjs';

// iOS may omit a channel or individual axes. Never gate linear motion on gravity data.
export function readMotion(state,event,dt){
  const raw=event.accelerationIncludingGravity,linear=event.acceleration;
  const axes=['x','y','z'],sample={x:0,y:0,z:0,valid:false};
  state.raw ??= {};
  for(const axis of axes){
    const value=raw?.[axis];
    let residual=0;
    if(Number.isFinite(value)){
      if(!Number.isFinite(state.raw[axis]))state.raw[axis]=value;
      state.raw[axis]+=(value-state.raw[axis])*(1-Math.exp(-clamp(dt,.005,.05)*2.5));
      residual=value-state.raw[axis];sample.valid=true;
    }
    if(Number.isFinite(linear?.[axis])){sample[axis]=clamp(linear[axis],-100,100);sample.valid=true;}
    else sample[axis]=clamp(residual,-100,100);
  }
  return sample;
}

export function applyShake(body,sample,dt,angle=0,sensitivity=1){
  const strength=Math.hypot(sample.x||0,sample.y||0,sample.z||0);
  if(strength<.75)return strength;
  const impulse=motionImpulse(sample.x||0,sample.y||0,dt,angle,sensitivity);
  const speed=Math.hypot(body.vx,body.vy);
  if(strength>3.5){
    // A shake adds energy to the current flight; returning the phone does not cancel it.
    let direction=speed>80?{x:body.vx/speed,y:body.vy/speed}:screenVector(-(sample.x||0),sample.y||0,angle);
    if(speed<=80){direction.y=Math.min(direction.y,-strength*.55);}
    const length=Math.hypot(direction.x,direction.y)||1;
    const target=Math.min(3200,Math.sqrt(speed*speed+(Math.min(strength,65)-3.5)*clamp(dt,.005,.05)*220000*sensitivity));
    body.vx=direction.x/length*target;body.vy=direction.y/length*target;
    body.recoveryTime=0;
  }else{body.vx+=impulse.x;body.vy+=impulse.y;}
  const result=Math.hypot(body.vx,body.vy);
  if(result>3200){body.vx*=3200/result;body.vy*=3200/result;}
  return strength;
}
