import * as THREE from "three";
import type { CarriageCollider } from "./trainPhysics";

export function cameraBoomDistance(origin:THREE.Vector3,direction:THREE.Vector3,distance:number,colliders:CarriageCollider[]) {
  let result=distance;
  for(const box of colliders) {
    let near=0,far=result;
    const min=[box.min[0]-.1,box.bottom-.1,box.min[1]-.1];
    const max=[box.max[0]+.1,box.top+.1,box.max[1]+.1];
    for(let axis=0;axis<3;axis++) {
      const position=origin.getComponent(axis),step=direction.getComponent(axis);
      if(Math.abs(step)<1e-8) {if(position<min[axis]||position>max[axis]) {far=-1;break;}}
      else {
        const a=(min[axis]-position)/step,b=(max[axis]-position)/step;
        near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
      }
    }
    if(far>=near&&far>=0)result=Math.min(result,Math.max(0,near-.06));
  }
  return result;
}
