import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {beamContains,beamVisible,type BeamPoint} from "./trainBeam";
import {fetchTrainModel} from "./trainAsset";

export type EquipmentName="equipment:key"|"equipment:drawer"|"equipment:charm";
export type EquipmentEvent="key"|"locked"|"open"|"close"|"charm"|"none";
export interface EquipmentState {hasKey:boolean;drawerOpen:boolean;}
export interface TorchBeam {origin:BeamPoint;direction:BeamPoint;range:number;enabled:boolean;}

export const DRAWER_TRAVEL=.18;
export const DRAWER_DURATION=420;
export const BEAM_HALF_ANGLE=Math.acos(.957);

export function equipmentAction(state:EquipmentState,name:string):{state:EquipmentState;event:EquipmentEvent} {
  if(name==="equipment:key")return state.hasKey?{state,event:"none"}:{state:{...state,hasKey:true},event:"key"};
  if(name==="equipment:drawer") {
    if(!state.hasKey)return {state,event:"locked"};
    return {state:{...state,drawerOpen:!state.drawerOpen},event:state.drawerOpen?"close":"open"};
  }
  if(name==="equipment:charm")return state.drawerOpen?{state,event:"charm"}:{state,event:"none"};
  return {state,event:"none"};
}

export function equipmentInteractive(state:EquipmentState,name:string) {
  if(name==="equipment:key")return !state.hasKey;
  if(name==="equipment:charm")return state.drawerOpen;
  return name==="equipment:drawer";
}

export function drawerOffset(from:number,to:number,elapsed:number) {
  const t=Math.min(1,Math.max(0,elapsed/DRAWER_DURATION));
  const eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  return from+(to-from)*eased;
}

export async function createTrainEquipment(scene:THREE.Scene,signal:AbortSignal,load:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>=(url,abort)=>fetchTrainModel(url,abort,"Equipment unavailable")) {
  const gltf=await new GLTFLoader().parseAsync(await load("/train/equipment.glb.gz",signal),"/train/");
  const meshes:THREE.Mesh[]=[];
  const geometries=new Set<THREE.BufferGeometry>();
  const materials=new Set<THREE.MeshBasicMaterial>();
  const baseColors=new Map<THREE.Mesh,THREE.Color>();
  gltf.scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const originals=Array.isArray(object.material)?object.material:[object.material];
    for(const material of originals)material.dispose();
    const material=new THREE.MeshBasicMaterial({vertexColors:true});
    object.material=material;
    object.name=`equipment:${object.name}`;
    geometries.add(object.geometry);materials.add(material);
    baseColors.set(object,material.color.clone());
    meshes.push(object);
  });
  const dispose=()=>{
    scene.remove(gltf.scene);
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
  };
  if(signal.aborted) {dispose();throw new DOMException("Aborted","AbortError");}
  const find=(name:string)=>meshes.find(mesh=>mesh.name===name);
  const key=find("equipment:key");
  const drawer=find("equipment:drawer");
  const charm=find("equipment:charm");
  const drawerRest=drawer?.position.z??0;
  const keyPoint={x:0,y:0,z:0};
  const keyWorld=new THREE.Vector3();
  if(key) {key.updateWorldMatrix(true,false);key.getWorldPosition(keyWorld);Object.assign(keyPoint,{x:keyWorld.x,y:keyWorld.y,z:keyWorld.z});}
  const probe=new THREE.Raycaster();
  const probeOrigin=new THREE.Vector3();
  const probeDirection=new THREE.Vector3();
  let state:EquipmentState={hasKey:false,drawerOpen:false};
  let slideFrom=0,slideTo=0,slideStart=-Infinity;
  let charmUntil=0,rattleUntil=0,glint=0;
  const day=new THREE.Color(1,1,1);
  const tint=(mesh:THREE.Mesh|undefined,scale:number)=>{
    if(!mesh)return;
    (mesh.material as THREE.MeshBasicMaterial).color.copy(baseColors.get(mesh)!).multiply(day).multiplyScalar(scale);
  };
  for(const mesh of meshes) {mesh.matrixAutoUpdate=mesh===drawer;mesh.updateMatrix();}
  scene.add(gltf.scene);
  scene.updateMatrixWorld();
  return {
    meshes,
    materials:[...materials],
    getState(){return {...state};},
    isInteractive(name:string){return equipmentInteractive(state,name);},
    activate(name:string,now=performance.now()):EquipmentEvent {
      const result=equipmentAction(state,name);
      state=result.state;
      if(result.event==="key"&&key)key.visible=false;
      else if(result.event==="open"||result.event==="close") {
        slideFrom=drawer?drawer.position.z-drawerRest:0;
        slideTo=state.drawerOpen?DRAWER_TRAVEL:0;
        slideStart=now;
      }
      else if(result.event==="locked")rattleUntil=now+260;
      else if(result.event==="charm")charmUntil=now+1200;
      return result.event;
    },
    update(now:number,beam:TorchBeam|undefined,occluders:THREE.Object3D[],reducedMotion:boolean) {
      let animating=false;
      if(drawer) {
        let offset=drawerOffset(slideFrom,slideTo,reducedMotion?DRAWER_DURATION:now-slideStart);
        if(now<rattleUntil) {offset+=reducedMotion?0:Math.sin((rattleUntil-now)*.12)*.004;animating=true;}
        if(now-slideStart<DRAWER_DURATION)animating=true;
        drawer.position.z=drawerRest+offset;
      }
      if(charm) {
        const sparkle=now<charmUntil?1.4+(reducedMotion?.3:Math.sin(now*.02)*.3):1;
        tint(charm,sparkle);
        if(now<charmUntil)animating=true;
      }
      if(key&&key.visible) {
        let lit=false;
        if(beam?.enabled&&beamContains(beam.origin,beam.direction,keyPoint,beam.range,BEAM_HALF_ANGLE)) {
          probeOrigin.set(beam.origin.x,beam.origin.y,beam.origin.z);
          probeDirection.copy(keyWorld).sub(probeOrigin);
          const distance=probeDirection.length();
          probe.set(probeOrigin,probeDirection.normalize());probe.far=distance;
          lit=beamVisible(distance,probe.intersectObjects(occluders,false)[0]?.distance);
        }
        const target=lit?1:0;
        if(Math.abs(glint-target)>.01) {glint+=(target-glint)*(reducedMotion?1:.18);animating=true;}
        else glint=target;
        tint(key,1+glint*(1.6+(reducedMotion?0:Math.sin(now*.012)*.4)));
        if(glint>0)animating=true;
      }
      return animating;
    },
    setDay(morning:boolean) {
      day.setRGB(morning?1.8:1,morning?1.9:1,morning?2:1);
      for(const mesh of meshes)tint(mesh,1);
    },
    reset() {
      state={hasKey:false,drawerOpen:false};
      slideFrom=slideTo=0;slideStart=-Infinity;charmUntil=rattleUntil=0;glint=0;
      if(key)key.visible=true;
      if(drawer)drawer.position.z=drawerRest;
    },
    dispose,
  };
}
