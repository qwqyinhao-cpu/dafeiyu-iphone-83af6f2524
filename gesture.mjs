// A short head movement remains a stroke even after a long hold.
export function updateDragGesture(gesture,point,now) {
  gesture.x=point.x;gesture.y=point.y;
  gesture.distance=Math.max(gesture.distance,Math.hypot(point.x-gesture.startX,point.y-gesture.startY));
  gesture.samples.push({...point,t:now});
  gesture.samples=gesture.samples.filter(sample=>now-sample.t<0.25);
  if(!gesture.active&&gesture.distance>(gesture.head?42:8)){
    gesture.active=true;return true;
  }
  return false;
}
