import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BODY_HEIGHT, type PlayerState } from "./trainPhysics";
import type { TrainGraphicsQuality } from "./trainGraphics";
import { fetchTrainModel } from "./trainAsset";

export type AvatarId="sniqr"|"private";
export type AvatarClip="Idle"|"Walk"|"Run"|"Jump"|"Fall"|"Prone"|"Crawl";

const TRANSITION_DURATION=.16;
const modelBitmaps=new WeakMap<THREE.Object3D,Set<ImageBitmap>>();
const bitmapReferences=new WeakMap<ImageBitmap,number>();
const closedBitmaps=new WeakSet<ImageBitmap>();
const releasedModels=new WeakSet<THREE.Object3D>();

export function avatarClip(player:PlayerState,walking:boolean,sprinting:boolean):AvatarClip {
  if(player.prone)return walking?"Crawl":"Prone";
  if(!player.grounded)return player.velocityY>0?"Jump":"Fall";
  return walking?sprinting?"Run":"Walk":"Idle";
}

function isImageBitmap(value:unknown):value is ImageBitmap {
  return typeof ImageBitmap!=="undefined"&&value instanceof ImageBitmap;
}

function collectImageBitmaps(value:unknown,result:Set<ImageBitmap>) {
  if(isImageBitmap(value)) {result.add(value);return;}
  if(Array.isArray(value))for(const item of value)collectImageBitmaps(item,result);
}

function collectModelResources(model:THREE.Object3D) {
  const textures=new Set<THREE.Texture>();
  const materials=new Set<THREE.Material>();
  const geometries=new Set<THREE.BufferGeometry>();
  const skeletons=new Set<THREE.Skeleton>();
  const bitmaps=new Set<ImageBitmap>();
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    geometries.add(object.geometry);
    if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      materials.add(material);
      for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
    }
  });
  for(const texture of textures)collectImageBitmaps(texture.source.data,bitmaps);
  return {textures,materials,geometries,skeletons,bitmaps};
}

function retain(model:THREE.Object3D) {
  if(modelBitmaps.has(model)||releasedModels.has(model))return;
  const {bitmaps}=collectModelResources(model);
  modelBitmaps.set(model,bitmaps);
  for(const bitmap of bitmaps)bitmapReferences.set(bitmap,(bitmapReferences.get(bitmap)??0)+1);
}

function release(model:THREE.Object3D) {
  if(releasedModels.has(model))return;
  releasedModels.add(model);
  const resources=collectModelResources(model);
  for(const texture of resources.textures)texture.dispose();
  for(const material of resources.materials)material.dispose();
  for(const geometry of resources.geometries)geometry.dispose();
  for(const skeleton of resources.skeletons)skeleton.dispose();
  const bitmaps=modelBitmaps.get(model)??resources.bitmaps;
  modelBitmaps.delete(model);
  for(const bitmap of bitmaps) {
    const references=bitmapReferences.get(bitmap)??0;
    if(references>1) {bitmapReferences.set(bitmap,references-1);continue;}
    bitmapReferences.delete(bitmap);
    if(!closedBitmaps.has(bitmap)) {closedBitmaps.add(bitmap);bitmap.close();}
  }
}

export function createTrainAvatar(scene:THREE.Scene,signal:AbortSignal,status:(message:string)=>void,prepare?:(model:THREE.Object3D)=>Promise<unknown>|unknown) {
  const group=new THREE.Group();
  group.name="PlayerAvatar";
  scene.add(group);
  let model:THREE.Group|undefined;
  let hand:THREE.Object3D|undefined;
  let currentId:AvatarId|undefined;
  let mixer:THREE.AnimationMixer|undefined;
  let clips=new Map<string,THREE.AnimationAction>();
  let active:THREE.AnimationAction|undefined;
  const fadingOut=new Map<THREE.AnimationAction,number>();
  let pending:AbortController|undefined;
  let request=0;
  let disposed=false;
  const clear=()=>{
    mixer?.stopAllAction();
    fadingOut.clear();
    if(model) {mixer?.uncacheRoot(model);group.remove(model);release(model);}
    model=undefined;hand=undefined;currentId=undefined;mixer=undefined;active=undefined;clips.clear();
  };
  const dispose=()=>{
    if(disposed)return;
    disposed=true;request++;pending?.abort();pending=undefined;clear();scene.remove(group);signal.removeEventListener("abort",dispose);
  };
  signal.addEventListener("abort",dispose,{once:true});
  if(signal.aborted)dispose();
  return {
    group,
    dispose,
    getCurrentId(){return currentId;},
    getHandSocket():THREE.Object3D|undefined {
      return hand;
    },
    async select(id:AvatarId,quality:TrainGraphicsQuality="high") {
      if(disposed||signal.aborted)return false;
      const token=++request;
      pending?.abort();
      const controller=new AbortController();
      pending=controller;
      try {
        status("Loading avatar…");
        const source=id==="private"
          ?quality==="low"?"/api/train/avatar?quality=low":"/api/train/avatar"
          :quality==="low"?"/train/avatars/sniqr-low.glb.gz":"/train/avatars/sniqr.glb.gz";
        const basePath=id==="private"?"/api/train/":"/train/avatars/";
        const data=await fetchTrainModel(source,controller.signal,"Avatar download failed");
         if(disposed||signal.aborted||controller.signal.aborted||token!==request)return false;
        const gltf=await new GLTFLoader().parseAsync(data,basePath);
        retain(gltf.scene);
         if(disposed||signal.aborted||controller.signal.aborted||token!==request) {release(gltf.scene);return false;}
        gltf.scene.scale.setScalar(BODY_HEIGHT/1.85);
        gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh)object.frustumCulled=false;});
        try {await prepare?.(gltf.scene);} catch {}
         if(disposed||signal.aborted||controller.signal.aborted||token!==request) {release(gltf.scene);return false;}
        clear();
         model=gltf.scene;
         currentId=id;
        hand=model.getObjectByName("Hand.R")??model.getObjectByName("HandR");
        group.add(model);
        mixer=new THREE.AnimationMixer(model);
        clips=new Map(gltf.animations.map(clip=>[clip.name,mixer!.clipAction(clip)]));
         status("");
         return true;
      } catch(error) {
         if(!disposed&&!signal.aborted&&token===request&&!controller.signal.aborted)status(error instanceof Error?"Avatar unavailable. Select an avatar to retry":"Avatar unavailable");
         return false;
      } finally {
        if(pending===controller)pending=undefined;
      }
    },
    update(player:PlayerState,heading:number,walking:boolean,sprinting:boolean,visible:boolean,delta:number,reducedMotion=false,locomotionScale=1):boolean {
      group.position.set(player.x,player.feet,player.z);
      group.rotation.y=heading;
      group.visible=visible;
      if(!mixer)return false;
      const clip=avatarClip(player,walking,sprinting);
      const next=clips.get(clip);
      if(!next) {
        for(const action of fadingOut.keys())action.stop();
        fadingOut.clear();
        active?.stop();active=undefined;
        mixer.update(0);
        return false;
      }
      const elapsed=Number.isFinite(delta)?Math.max(0,delta):0;
      const timeScale=clip==="Walk"||clip==="Run"||clip==="Crawl"?Number.isFinite(locomotionScale)?THREE.MathUtils.clamp(locomotionScale,0,1):0:1;
      if(reducedMotion) {
        for(const action of fadingOut.keys())action.stop();
        fadingOut.clear();
        if(next!==active) {
          mixer.stopAllAction();
          active=next.reset().setEffectiveWeight(1).setEffectiveTimeScale(0).play();
        } else active.stopFading().setEffectiveTimeScale(0);
        mixer.update(0);
        return false;
      }
      if(next!==active) {
        if(fadingOut.delete(next))next.stopFading();
        if(active) {
          active.stopFading().fadeOut(TRANSITION_DURATION);
          fadingOut.set(active,TRANSITION_DURATION);
        }
        active=next.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(TRANSITION_DURATION).play();
      } else active.setEffectiveTimeScale(timeScale);
      mixer.update(elapsed);
      for(const [action,remaining] of fadingOut) {
        const timeLeft=remaining-elapsed;
        if(timeLeft<=0) {action.stop();fadingOut.delete(action);}
        else fadingOut.set(action,timeLeft);
      }
      if(active.isRunning()&&active.getClip().duration>0)return true;
      for(const action of fadingOut.keys())if(action.isRunning()&&action.getClip().duration>0)return true;
      return false;
    },
  };
}
