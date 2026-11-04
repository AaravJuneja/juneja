import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { skins } from "./trainCatalog";
import { trainGraphicsProfile,type TrainGraphicsQuality } from "./trainGraphics";
import { fetchTrainModel } from "./trainAsset";

export const TORCH_SHADOW_LAYER=1;

export function torchAimDirection(camera:THREE.Camera,heading:number,cameraAim:boolean,target=new THREE.Vector3()) {
  return cameraAim?camera.getWorldDirection(target):target.set(Math.sin(heading),0,Math.cos(heading));
}

export function createTrainTorch(scene:THREE.Scene,renderer:THREE.WebGLRenderer,signal:AbortSignal) {
  let target=renderer;
  const root=new THREE.Group();
  root.name="HeldFlashlight";
  scene.add(root);
  const shadowCamera=new THREE.PerspectiveCamera(32,1,.035,28);
  const initialGraphics=trainGraphicsProfile("low",1,1,1);
  shadowCamera.layers.set(TORCH_SHADOW_LAYER);
  const shadowTarget=new THREE.WebGLRenderTarget(initialGraphics.torchShadowSize,initialGraphics.torchShadowSize,{format:THREE.RedFormat,type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthTexture:new THREE.DepthTexture(initialGraphics.torchShadowSize,initialGraphics.torchShadowSize)});
  const depthMaterial=new THREE.MeshDepthMaterial({colorWrite:false});
  const shadowMatrix=new THREE.Matrix4();
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  const uniforms={
    trainTorchPosition:{value:new THREE.Vector3()},
    trainTorchDirection:{value:new THREE.Vector3(0,0,-1)},
    trainTorchStrength:{value:0},
    trainTorchRange:{value:18},
    trainTorchShadow:{value:shadowTarget.depthTexture},
    trainTorchMatrix:{value:shadowMatrix},
    trainTorchTexelSize:{value:new THREE.Vector2(1/initialGraphics.torchShadowSize,1/initialGraphics.torchShadowSize)},
    trainTorchShadows:{value:0},
  };
  const resources={geometries:new Set<THREE.BufferGeometry>(),materials:new Set<THREE.Material>(),textures:new Set<THREE.Texture>()};
  let disposed=false;
  let shell:THREE.MeshStandardMaterial[]=[];
  let lens:THREE.MeshStandardMaterial[]=[];
  let skinTexture:THREE.CanvasTexture|undefined;
  let selectedSkin="yellow";
  let quality:TrainGraphicsQuality="low";
  let enabled=true;
  let lastShadow=-Infinity;
  const shadowUpdateInterval=1000/30;
  let shadowReady=false;
  const aim=new THREE.Vector3();
  const tip=new THREE.Vector3();
  const localGrip=new THREE.Vector3(0,.065,0);
  const ray=new THREE.Raycaster();
  ray.firstHitOnly=true;
  const hits:THREE.Intersection[]=[];
  const beamDirection=new THREE.Vector3();
  const cameraCenter=new THREE.Vector2();
  const rotationMatrix=new THREE.Matrix4();
  const up=new THREE.Vector3(0,1,0);
  const dispose=()=>{
    if(disposed)return;
    disposed=true;
    scene.remove(root);
    skinTexture?.dispose();
    shadowTarget.depthTexture?.dispose();shadowTarget.dispose();depthMaterial.dispose();
    for(const geometry of resources.geometries)geometry.dispose();
    for(const material of resources.materials)material.dispose();
    const closed=new Set<ImageBitmap>();
    for(const texture of resources.textures) {
      texture.dispose();
      if(typeof ImageBitmap!=="undefined"&&texture.image instanceof ImageBitmap&&!closed.has(texture.image)) {texture.image.close();closed.add(texture.image);}
    }
    signal.removeEventListener("abort",dispose);
  };
  signal.addEventListener("abort",dispose,{once:true});
  const setSkin=(id:string)=>{
    const skin=skins.find(item=>item.id===id);
    if(!skin)return;
    selectedSkin=id;
    const resolution=trainGraphicsProfile(quality,1,1,1).torchSkinSize;
    const scale=resolution/128;
    const cell=8/scale;
    const canvas=document.createElement("canvas");canvas.width=canvas.height=resolution;
    const context=canvas.getContext("2d")!;
    context.scale(scale,scale);
    let seed=173;
    for(const char of id)seed=(seed*31+char.charCodeAt(0))>>>0;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const hue=Math.round(random()*360);
    const base=id==="vantablack"?"#030306":skin.colors[0];
    context.fillStyle=base;context.fillRect(0,0,128,128);
    if("pattern" in skin) {
      if(id.includes("rainbow")||id.includes("aurora")) {
        const gradient=context.createLinearGradient(0,0,128,128);
        if(id.includes("rainbow"))for(let i=0;i<7;i++)gradient.addColorStop(i/6,`hsl(${i*55} ${id.includes("pastel")?55:85}% ${id.includes("pastel")?76:56}%)`);
        else {gradient.addColorStop(0,skin.colors[0]);gradient.addColorStop(1,skin.colors[1]);}
        context.fillStyle=gradient;context.fillRect(0,0,128,128);
      }
      for(let y=0;y<128;y+=cell)for(let x=0;x<128;x+=cell) {
        const chance=random();
        if(id.includes("checkers")) {context.fillStyle=(Math.floor(x/cell)+Math.floor(y/cell))%2?"#315dc4":"#a6cefa";context.fillRect(x,y,cell,cell);}
        else if(id.includes("static")||id.includes("error")||id.includes("matrix")) {context.fillStyle=id.includes("matrix")?`rgb(0 ${Math.round(30+chance*210)} 35)`:`hsl(${hue} ${id==="static"?0:75}% ${chance*95}%)`;context.fillRect(x,y,cell,cell);}
        else if(chance>.70) {context.fillStyle=skin.colors[1];context.fillRect(x,y,id.includes("sparkle")?cell*.25:cell*.75,id.includes("lightning")?cell*2.25:cell*.75);}
      }
      if(id.includes("stars")||id.includes("galaxy")||id.includes("space"))for(let i=0;i<Math.round(70*scale*scale);i++) {context.fillStyle="#f6efff";context.fillRect(random()*128,random()*128,1.5/scale,1.5/scale);}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    skinTexture?.dispose();skinTexture=texture;
    for(const material of shell) {material.color.set("#ffffff");material.map=texture;material.needsUpdate=true;}
  };
  return {
    root,
    dispose,
    async load() {
      try {
        const gltf=await new GLTFLoader().parseAsync(await fetchTrainModel("/train/flashlight.glb.gz",signal,"Torch unavailable"),"/train/");
        gltf.scene.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          resources.geometries.add(object.geometry);
          for(const material of Array.isArray(object.material)?object.material:[object.material]) {
            resources.materials.add(material);
            for(const value of Object.values(material))if(value instanceof THREE.Texture)resources.textures.add(value);
            if(material instanceof THREE.MeshStandardMaterial) {
              if(material.name==="TorchShell")shell.push(material);
              if(material.name==="TorchLens")lens.push(material);
            }
          }
        });
        if(disposed||signal.aborted) {
          for(const geometry of resources.geometries)geometry.dispose();
          for(const material of resources.materials)material.dispose();
          for(const texture of resources.textures)texture.dispose();
          return;
        }
        root.add(gltf.scene);setSkin(selectedSkin);
      } catch(error) {if(!signal.aborted)console.warn(error instanceof Error?error.message:"Torch unavailable");}
    },
    patch(material:THREE.MeshBasicMaterial) {
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader="varying vec3 vTrainWorld;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
          vec4 trainWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            trainWorld = instanceMatrix * trainWorld;
          #endif
          vTrainWorld = (modelMatrix * trainWorld).xyz;`);
        shader.fragmentShader=`varying vec3 vTrainWorld;
          uniform vec3 trainTorchPosition;
          uniform vec3 trainTorchDirection;
          uniform float trainTorchStrength;
          uniform float trainTorchRange;
          uniform sampler2D trainTorchShadow;
          uniform mat4 trainTorchMatrix;
          uniform vec2 trainTorchTexelSize;
          uniform float trainTorchShadows;
        `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>",`
          if(trainTorchStrength>0.0) {
            vec3 trainOffset=vTrainWorld-trainTorchPosition;
            float trainDistance=length(trainOffset);
            float trainCone=trainDistance<trainTorchRange?smoothstep(0.957,0.985,dot(trainOffset/max(trainDistance,0.0001),trainTorchDirection)):0.0;
            if(trainCone>0.0) {
              float trainVisible=1.0;
              if(trainTorchShadows>0.5) {
                trainVisible=0.0;
                vec4 trainProjected=trainTorchMatrix*vec4(vTrainWorld,1.0);
                if(trainProjected.w>0.0) {
                  vec3 trainShadow=trainProjected.xyz/trainProjected.w;
                  if(trainShadow.x>0.0&&trainShadow.x<1.0&&trainShadow.y>0.0&&trainShadow.y<1.0&&trainShadow.z<1.0) {
                    vec2 offset=trainTorchTexelSize*0.5;
                    float sample00=step(trainShadow.z-0.0025,texture2D(trainTorchShadow,trainShadow.xy+vec2(-offset.x,-offset.y)).r);
                    float sample10=step(trainShadow.z-0.0025,texture2D(trainTorchShadow,trainShadow.xy+vec2(offset.x,-offset.y)).r);
                    float sample01=step(trainShadow.z-0.0025,texture2D(trainTorchShadow,trainShadow.xy+vec2(-offset.x,offset.y)).r);
                    float sample11=step(trainShadow.z-0.0025,texture2D(trainTorchShadow,trainShadow.xy+offset).r);
                    trainVisible=(sample00+sample10+sample01+sample11)*0.25;
                  }
                }
              }
              float trainFalloff=pow(max(0.0,1.0-trainDistance/trainTorchRange),2.0);
              outgoingLight+=diffuseColor.rgb*vec3(1.0,0.91,0.69)*trainCone*trainFalloff*trainVisible*trainTorchStrength;
            }
          }
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=>"train-torch-v2";
      material.needsUpdate=true;
    },
    setSkin,
    setQuality(value:TrainGraphicsQuality){
      if(value===quality)return;
      quality=value;
      const profile=trainGraphicsProfile(value,1,1,1);
      shadowTarget.setSize(profile.torchShadowSize,profile.torchShadowSize);
      uniforms.trainTorchTexelSize.value.set(1/profile.torchShadowSize,1/profile.torchShadowSize);
      shadowReady=false;
      lastShadow=-Infinity;
      setSkin(selectedSkin);
    },
    setTorch(value:boolean){enabled=value;},
    setRenderer(value:THREE.WebGLRenderer){shadowTarget.dispose();target=value;shadowReady=false;lastShadow=-Infinity;},
    castShadows(objects:Iterable<THREE.Object3D>){for(const object of objects)object.layers.enable(TORCH_SHADOW_LAYER);},
    getState(){return {skin:selectedSkin,torch:enabled};},
    update(camera:THREE.Camera,socket:THREE.Object3D|undefined,firstPerson:boolean,playerVisible:boolean,occluders:THREE.Object3D[],now:number,heading:number,cameraAim:boolean) {
      if(disposed)return false;
      if(firstPerson||!socket||!playerVisible)root.position.set(.19,-.19,-.36).applyMatrix4(camera.matrixWorld);
      else {socket.updateWorldMatrix(true,false);socket.localToWorld(root.position.copy(localGrip));}
      torchAimDirection(camera,heading,cameraAim,beamDirection);
      if(cameraAim)ray.setFromCamera(cameraCenter,camera);
      else ray.set(root.position,beamDirection);
      ray.far=18;
      if(quality==="high") {
        hits.length=0;
        const hit=ray.intersectObjects(occluders,false,hits)[0];
        ray.ray.at(Math.max(.65,hit?.distance??ray.far),aim);
      } else ray.ray.at(ray.far,aim);
      root.quaternion.setFromRotationMatrix(rotationMatrix.lookAt(root.position,aim,up));
      beamDirection.copy(aim).sub(root.position).normalize();
      root.visible=true;
      tip.set(0,0,-.22).applyQuaternion(root.quaternion).add(root.position);
      ray.set(root.position,beamDirection);ray.far=.25;
      if(quality==="high") {
        hits.length=0;
        const barrelHit=ray.intersectObjects(occluders,false,hits)[0];
        if(barrelHit)tip.copy(root.position).addScaledVector(beamDirection,Math.max(0,barrelHit.distance-.025));
      }
      uniforms.trainTorchPosition.value.copy(tip);
      uniforms.trainTorchDirection.value.copy(aim).sub(tip).normalize();
      const shadows=enabled&&quality==="high";
      uniforms.trainTorchShadows.value=shadows?1:0;
      for(const material of lens)material.emissiveIntensity=enabled?1.2:0;
      let pending=false;
      if(shadows) {
        if(now-lastShadow<shadowUpdateInterval)pending=true;
        else {
          lastShadow=now;
          shadowCamera.position.copy(tip);shadowCamera.far=uniforms.trainTorchRange.value;
          shadowCamera.lookAt(aim);shadowCamera.updateProjectionMatrix();shadowCamera.updateMatrixWorld(true);
          shadowMatrix.copy(bias).multiply(shadowCamera.projectionMatrix).multiply(shadowCamera.matrixWorldInverse);
          const previousTarget=target.getRenderTarget();
          const previousOverride=scene.overrideMaterial;
          try {
            scene.overrideMaterial=depthMaterial;
            target.setRenderTarget(shadowTarget);target.clear();target.render(scene,shadowCamera);
            shadowReady=true;
          } finally {
            scene.overrideMaterial=previousOverride;
            target.setRenderTarget(previousTarget);
          }
        }
      }
      uniforms.trainTorchStrength.value=enabled&&(!shadows||shadowReady)?2.8:0;
      return pending;
    },
  };
}
