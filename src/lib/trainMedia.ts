import * as THREE from "three";

export const FRONT_MEDIA_POSITION=[0,1.35,-4.48] as const;
export const FRONT_MEDIA_SIZE=[.72,.72*51/45] as const;
export const FRONT_FRAME_COUNT=131;
export const FRONT_FRAME_MS=30;

export function frontMediaFrame(elapsed:number,reducedMotion:boolean) {
  return reducedMotion||!Number.isFinite(elapsed)?0:Math.floor(Math.max(0,elapsed)/FRONT_FRAME_MS)%FRONT_FRAME_COUNT;
}

export function createTrainMedia(scene:THREE.Scene,signal:AbortSignal,ready:()=>void) {
  let disposed=false;
  const bitmaps=new Set<ImageBitmap>();
  const texture=(url:string)=>{
    const map=new THREE.Texture();map.colorSpace=THREE.SRGBColorSpace;map.flipY=false;
    void fetch(url,{signal}).then(response=>{
      if(!response.ok)throw new Error("Scene media unavailable");
      return response.blob();
    }).then(blob=>createImageBitmap(blob,{imageOrientation:"flipY",premultiplyAlpha:"none",colorSpaceConversion:"none"})).then(bitmap=>{
      if(disposed||signal.aborted) {bitmap.close();return;}
      bitmaps.add(bitmap);map.image=bitmap;map.needsUpdate=true;ready();
    }).catch(()=>{});
    return map;
  };
  const moon=texture("/train/moon.webp"),sun=texture("/train/sun.webp"),front=texture("/train/front-atlas.webp");
  front.generateMipmaps=false;front.minFilter=THREE.NearestFilter;front.magFilter=THREE.NearestFilter;
  front.repeat.set(1/16,1/9);
  const moonMaterial=new THREE.SpriteMaterial({map:moon,transparent:true,alphaTest:.01,fog:false,toneMapped:false});
  const sunMaterial=new THREE.SpriteMaterial({map:sun,transparent:true,alphaTest:.01,fog:false,toneMapped:false});
  const celestial=new THREE.Sprite(moonMaterial);celestial.name="train-celestial";celestial.position.set(-140,56,-68);celestial.scale.set(10,10,1);
  const geometry=new THREE.PlaneGeometry(...FRONT_MEDIA_SIZE);
  const material=new THREE.MeshBasicMaterial({map:front,transparent:true,alphaTest:.01,toneMapped:false});
  const display=new THREE.Mesh(geometry,material);display.name="train-front-media";display.position.set(...FRONT_MEDIA_POSITION);display.rotation.y=Math.PI;display.updateMatrix();display.matrixAutoUpdate=false;
  scene.add(celestial,display);
  let previous=-1;
  let previousImage:ImageBitmap|undefined;
  return {
    setDay(morning:boolean){celestial.material=morning?sunMaterial:moonMaterial;},
    update(elapsed:number,reducedMotion:boolean) {
      const image=celestial.material.map?.image as ImageBitmap|undefined;
      celestial.visible=!!image;
      if(image!==previousImage) {previousImage=image;if(image)celestial.scale.set(10*image.width/image.height,10,1);}
      display.visible=!!front.image;
      const frame=frontMediaFrame(elapsed,reducedMotion);
      if(frame!==previous) {previous=frame;front.offset.set(frame%16/16,1-(Math.floor(frame/16)+1)/9);}
      return display.visible&&!reducedMotion;
    },
    dispose() {
      disposed=true;scene.remove(celestial,display);
      geometry.dispose();material.dispose();moonMaterial.dispose();sunMaterial.dispose();
      moon.dispose();sun.dispose();front.dispose();
      for(const bitmap of bitmaps)bitmap.close();bitmaps.clear();
    },
  };
}
