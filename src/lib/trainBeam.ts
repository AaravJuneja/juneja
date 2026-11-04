export interface BeamPoint {
  x:number;
  y:number;
  z:number;
}

export function beamContains(origin:BeamPoint,direction:BeamPoint,target:BeamPoint,range:number,angle:number) {
  const x=target.x-origin.x,y=target.y-origin.y,z=target.z-origin.z;
  const distance=Math.hypot(x,y,z);
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(distance>range||length===0)return false;
  if(distance===0)return true;
  return (x*direction.x+y*direction.y+z*direction.z)/(distance*length)>=Math.cos(angle);
}

export function beamVisible(targetDistance:number,obstructionDistance:number|undefined,tolerance=.04) {
  return obstructionDistance===undefined||targetDistance<=obstructionDistance+tolerance;
}
