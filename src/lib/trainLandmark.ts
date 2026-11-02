import * as THREE from "three";
import {lowestTerrainHeight} from "./trainEnvironment";

export const ISLAND_FLAG="encryptid{y0u_g0t_1t}";
export const ISLAND_SIGN_SIZE=[1.6,.4] as const;

export interface IslandBounds {
  min:[number,number,number];
  max:[number,number,number];
}

export function islandSignPosition(bounds:IslandBounds,lift:number):[number,number,number] {
  return [(bounds.min[0]+bounds.max[0])/2,bounds.max[1]+lift+.035,(bounds.min[2]+bounds.max[2])/2];
}

export function islandGroundLift(bounds:IslandBounds,period:number) {
  return lowestTerrainHeight(bounds,period)-bounds.min[1]-.15;
}

export function islandSurfaceHeight(x:number,z:number,bounds:IslandBounds,lift:number,period:number) {
  const centerX=(bounds.min[0]+bounds.max[0])/2;
  const centerZ=(bounds.min[2]+bounds.max[2])/2;
  const localZ=centerZ+((z-centerZ+period/2)%period+period)%period-period/2;
  const radius=Math.hypot((x-centerX)/((bounds.max[0]-bounds.min[0])/2),(localZ-centerZ)/((bounds.max[2]-bounds.min[2])/2));
  if(radius>1)return undefined;
  const plateau=.38;
  const shape=radius<=plateau?1:(1-radius)/(1-plateau);
  return bounds.min[1]+lift+(bounds.max[1]-bounds.min[1])*shape;
}

export function createIslandSign(scene:THREE.Scene,position:[number,number,number],period:number) {
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=128;
  const context=canvas.getContext("2d");
  if(!context)throw new Error("Sign drawing unavailable");
  context.fillStyle="#30251e";context.fillRect(0,0,512,128);
  context.strokeStyle="#a38159";context.lineWidth=2;context.strokeRect(5,5,502,118);
  context.fillStyle="#eee1c9";context.font="500 30px Outfit, sans-serif";context.textAlign="center";context.textBaseline="middle";
  context.fillText(ISLAND_FLAG,256,65,470);
  for(const x of [16,496])for(const y of [16,112]) {context.beginPath();context.arc(x,y,3,0,Math.PI*2);context.fill();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const faceGeometry=new THREE.PlaneGeometry(...ISLAND_SIGN_SIZE).rotateX(-Math.PI/2);
  const backingGeometry=new THREE.BoxGeometry(ISLAND_SIGN_SIZE[0]+.04,.04,ISLAND_SIGN_SIZE[1]+.04);
  const faceMaterial=new THREE.MeshBasicMaterial({map:texture});
  const backingMaterial=new THREE.MeshBasicMaterial({color:"#4f3827"});
  const face=new THREE.InstancedMesh(faceGeometry,faceMaterial,5);
  const backing=new THREE.InstancedMesh(backingGeometry,backingMaterial,5);
  for(const mesh of [face,backing]) {mesh.frustumCulled=false;scene.add(mesh);}
  const matrix=new THREE.Matrix4();
  const update=(distance:number)=>{
    for(let i=0;i<5;i++) {
      const offset=((i*period+distance+period*2.5)%(period*5))-period*2.5;
       face.setMatrixAt(i,matrix.makeTranslation(position[0],position[1]+.025,position[2]+offset));
      backing.setMatrixAt(i,matrix.makeTranslation(position[0],position[1],position[2]+offset));
    }
    face.instanceMatrix.needsUpdate=true;backing.instanceMatrix.needsUpdate=true;
  };
  update(0);
  return {
    update,
    setDay(morning:boolean){faceMaterial.color.setScalar(morning?1:.8);},
    dispose(){for(const mesh of [face,backing]){scene.remove(mesh);mesh.dispose();}faceGeometry.dispose();backingGeometry.dispose();faceMaterial.dispose();backingMaterial.dispose();texture.dispose();},
  };
}
