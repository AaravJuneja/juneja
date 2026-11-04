import * as THREE from "three";

export interface InteractionRegion {name:string;bounds:THREE.Box3;enabled?:boolean;}

export function createTrainInteractionRegions():InteractionRegion[] {
  const regions:InteractionRegion[]=[];
  const add=(name:string,min:[number,number,number],max:[number,number,number])=>regions.push({name,bounds:new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max))});
  for(const [index,z] of [2.7,-.75,-3.35].entries())add(`NT_R02_Lamp_Pendant_0${index+1}`,[-.16,2.27,z-.16],[.16,2.69,z+.16]);
  for(const [index,[x,z]] of [[-1.42,-.08],[1.42,-1.3],[-1.42,-3.82]].entries())add(`NT_R02_Lamp_Sconce_0${index+1}`,[x-.16,1.74,z-.08],[x+.16,2,z+.08]);
  for(const side of [-1,1]) {
    const minX=side<0?-1.7:1.55,maxX=side<0?-1.55:1.7;
    for(const [minZ,maxZ] of [[-4.09,-2.11],[-2.01,-.04],[.04,2.01],[2.11,4.09]])add("windows",[minX,.94,minZ],[maxX,2.21,maxZ]);
    add("luggage",[side<0?-1.7:1.28,2.25,-4.15],[side<0?-1.28:1.7,2.39,4.15]);
  }
  add("desk",[.61,.77,-3.43],[1.55,.89,-1.47]);
  add("notebooks",[.9,.89,-2.8],[1.16,1.03,-2.44]);
  add("door",[-.44,.02,-4.4],[.44,2.24,-4.26]);
  return regions;
}

export function interactionVisible(object:THREE.Object3D) {
  for(let current:THREE.Object3D|null=object;current;current=current.parent)if(!current.visible)return false;
  return true;
}

export function pickTrainInteraction(ray:THREE.Ray,hits:THREE.Intersection[],regions:InteractionRegion[],interactive:(name:string)=>boolean,point:THREE.Vector3) {
  let hit:THREE.Intersection|undefined;
  for(const candidate of hits)if(interactionVisible(candidate.object)) {hit=candidate;break;}
  const limit=Math.min(4,hit?.distance??Infinity);
  let name=hit&&hit.distance<=4&&interactive(hit.object.name)?hit.object.name:null;
  let nearest=limit+.015;
  for(const region of regions) {
    if(region.enabled===false||!ray.intersectBox(region.bounds,point))continue;
    const distance=ray.origin.distanceTo(point);
    if(distance>4||distance>nearest)continue;
    nearest=distance;name=region.name;
  }
  return name;
}
