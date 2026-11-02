import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { skins } from "./trainCatalog";

export function torchAimDirection(camera:THREE.Camera,heading:number,cameraAim:boolean,target=new THREE.Vector3()) {
  return cameraAim?camera.getWorldDirection(target):target.set(Math.sin(heading),0,Math.cos(heading));
}

export function createTrainTorch(scene:THREE.Scene,renderer:THREE.WebGLRenderer,signal:AbortSignal) {
  const root=new THREE.Group();
  root.name="HeldFlashlight";
  scene.add(root);
  const shadowCamera=new THREE.PerspectiveCamera(32,1,.035,28);
  const shadowTarget=new THREE.WebGLRenderTarget(384,384);
  shadowTarget.depthTexture=new THREE.DepthTexture(384,384);
  shadowTarget.texture.minFilter=THREE.NearestFilter;
  shadowTarget.texture.magFilter=THREE.NearestFilter;
  const depthMaterial=new THREE.MeshDepthMaterial();
  const shadowMatrix=new THREE.Matrix4();
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  const uniforms={
    trainTorchPosition:{value:new THREE.Vector3()},
    trainTorchDirection:{value:new THREE.Vector3(0,0,-1)},
    trainTorchStrength:{value:0},
    trainTorchRange:{value:18},
    trainTorchShadow:{value:shadowTarget.depthTexture},
    trainTorchMatrix:{value:shadowMatrix},
  };
  const resources={geometries:new Set<THREE.BufferGeometry>(),materials:new Set<THREE.Material>(),textures:new Set<THREE.Texture>()};
  let disposed=false;
  let shell:THREE.MeshStandardMaterial[]=[];
  let lens:THREE.MeshStandardMaterial[]=[];
  let skinTexture:THREE.CanvasTexture|undefined;
  let selectedSkin="yellow";
  let enabled=true;
  let lastShadow=-Infinity;
  let shadowReady=false;
  const aim=new THREE.Vector3();
  const tip=new THREE.Vector3();
  const localGrip=new THREE.Vector3(0,.065,0);
  const ray=new THREE.Raycaster();
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
    const canvas=document.createElement("canvas");canvas.width=canvas.height=128;
    const context=canvas.getContext("2d")!;
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
      for(let y=0;y<128;y+=8)for(let x=0;x<128;x+=8) {
        const chance=random();
        if(id.includes("checkers")) {context.fillStyle=(x/8+y/8)%2?"#315dc4":"#a6cefa";context.fillRect(x,y,8,8);}
        else if(id.includes("static")||id.includes("error")||id.includes("matrix")) {context.fillStyle=id.includes("matrix")?`rgb(0 ${Math.round(30+chance*210)} 35)`:`hsl(${hue} ${id==="static"?0:75}% ${chance*95}%)`;context.fillRect(x,y,8,8);}
        else if(chance>.70) {context.fillStyle=skin.colors[1];context.fillRect(x,y,id.includes("sparkle")?2:6,id.includes("lightning")?18:6);}
      }
      if(id.includes("stars")||id.includes("galaxy")||id.includes("space"))for(let i=0;i<70;i++) {context.fillStyle="#f6efff";context.fillRect(random()*128,random()*128,1.5,1.5);}
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
        const response=await fetch("/train/flashlight.glb",{signal});
        if(!response.ok)throw new Error("Torch unavailable");
        const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),"/train/");
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
        `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>",`
          vec3 trainOffset=vTrainWorld-trainTorchPosition;
          float trainDistance=length(trainOffset);
          float trainCone=smoothstep(0.957,0.985,dot(normalize(trainOffset),trainTorchDirection));
          vec4 trainProjected=trainTorchMatrix*vec4(vTrainWorld,1.0);
          vec3 trainShadow=trainProjected.xyz/trainProjected.w;
          float trainVisible=0.0;
          if(trainProjected.w>0.0&&trainShadow.x>0.0&&trainShadow.x<1.0&&trainShadow.y>0.0&&trainShadow.y<1.0&&trainShadow.z<1.0) {
            trainVisible=step(trainShadow.z-0.0025,texture2D(trainTorchShadow,trainShadow.xy).r);
          }
          float trainFalloff=pow(max(0.0,1.0-trainDistance/trainTorchRange),2.0);
          outgoingLight+=diffuseColor.rgb*vec3(1.0,0.91,0.69)*trainCone*trainFalloff*trainVisible*trainTorchStrength;
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=>"train-torch-v1";
      material.needsUpdate=true;
    },
    setSkin,
    setTorch(value:boolean){enabled=value;},
    getState(){return {skin:selectedSkin,torch:enabled};},
    update(camera:THREE.Camera,socket:THREE.Object3D|undefined,firstPerson:boolean,playerVisible:boolean,occluders:THREE.Object3D[],hidden:THREE.Object3D[],now:number,heading:number,cameraAim:boolean) {
      if(disposed)return;
      if(firstPerson||!socket||!playerVisible)root.position.set(.19,-.19,-.36).applyMatrix4(camera.matrixWorld);
      else {socket.updateWorldMatrix(true,false);root.position.copy(socket.localToWorld(localGrip.clone()));}
      torchAimDirection(camera,heading,cameraAim,beamDirection);
      if(cameraAim)ray.setFromCamera(cameraCenter,camera);
      else ray.set(root.position,beamDirection);
      ray.far=18;
      const hit=ray.intersectObjects(occluders,false)[0];
      ray.ray.at(Math.max(.65,hit?.distance??ray.far),aim);
      root.quaternion.setFromRotationMatrix(rotationMatrix.lookAt(root.position,aim,up));
      beamDirection.copy(aim).sub(root.position).normalize();
      root.visible=true;
      tip.set(0,0,-.22).applyQuaternion(root.quaternion).add(root.position);
      ray.set(root.position,beamDirection);ray.far=.25;
      const barrelHit=ray.intersectObjects(occluders,false)[0];
      if(barrelHit)tip.copy(root.position).addScaledVector(beamDirection,Math.max(0,barrelHit.distance-.025));
      uniforms.trainTorchPosition.value.copy(tip);
      uniforms.trainTorchDirection.value.copy(aim).sub(tip).normalize();
      uniforms.trainTorchStrength.value=enabled&&shadowReady?2.8:0;
      for(const material of lens)material.emissiveIntensity=enabled?1.2:0;
      if(!enabled||now-lastShadow<1000/15)return;
      lastShadow=now;
      shadowCamera.position.copy(tip);shadowCamera.far=uniforms.trainTorchRange.value;
      shadowCamera.lookAt(aim);shadowCamera.updateProjectionMatrix();shadowCamera.updateMatrixWorld(true);
      shadowMatrix.copy(bias).multiply(shadowCamera.projectionMatrix).multiply(shadowCamera.matrixWorldInverse);
      const previousTarget=renderer.getRenderTarget();
      const previousOverride=scene.overrideMaterial;
      const previousVisible=[root,...hidden].map(object=>object.visible);
      try {
        [root,...hidden].forEach(object=>{object.visible=false;});
        scene.overrideMaterial=depthMaterial;
        renderer.setRenderTarget(shadowTarget);renderer.clear();renderer.render(scene,shadowCamera);
        shadowReady=true;
      } finally {
        scene.overrideMaterial=previousOverride;
        [root,...hidden].forEach((object,i)=>{object.visible=previousVisible[i];});
        renderer.setRenderTarget(previousTarget);
      }
    },
  };
}
