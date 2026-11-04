import * as THREE from "three";
import type { CarriageCollider } from "./trainPhysics";

const lower=[0,0,0];
const upper=[0,0,0];

export function cameraBoomDistance(origin:THREE.Vector3,direction:THREE.Vector3,distance:number,colliders:CarriageCollider[]) {
  let result=distance;
  for(const box of colliders) {
    let near=0,far=result;
    lower[0]=box.min[0]-.1;lower[1]=box.bottom-.1;lower[2]=box.min[1]-.1;
    upper[0]=box.max[0]+.1;upper[1]=box.top+.1;upper[2]=box.max[1]+.1;
    for(let axis=0;axis<3;axis++) {
      const position=origin.getComponent(axis),step=direction.getComponent(axis);
      if(Math.abs(step)<1e-8) {if(position<lower[axis]||position>upper[axis]) {far=-1;break;}}
      else {
        const a=(lower[axis]-position)/step,b=(upper[axis]-position)/step;
        near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
      }
    }
    if(far>=near&&far>=0)result=Math.min(result,Math.max(0,near-.06));
  }
  return result;
}

export function cameraGroundDistance(origin:THREE.Vector3,direction:THREE.Vector3,distance:number,ground:(x:number,z:number)=>number,clearance=.2,step=.1) {
  const clear=(t:number)=>origin.y+direction.y*t>=ground(origin.x+direction.x*t,origin.z+direction.z*t)+clearance;
  if(!clear(0))return 0;
  let previous=0;
  for(let t=Math.min(step,distance);;t=Math.min(t+step,distance)) {
    if(!clear(t)) {
      let low=previous,high=t;
      for(let i=0;i<6;i++) {const middle=(low+high)/2;if(clear(middle))low=middle;else high=middle;}
      return low;
    }
    if(t>=distance)return distance;
    previous=t;
  }
}
