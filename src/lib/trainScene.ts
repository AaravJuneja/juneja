import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { EYE_HEIGHT, PRONE_EYE_HEIGHT, CRAWL_SPEED, WALK_SPEED, SPRINT_SPEED, MAX_EXTERIOR_TRAVEL, canStand, carriageStructure, exteriorMovementBounds, jumpPlayer, lieDown, stepPlayer, trainDrift, turnPlayer, type MovementWorld, type PlayerState } from "./trainPhysics";
import { createTrainEnvironment, terrainSurfaceHeight } from "./trainEnvironment";
import { canSprint,stepSprint,type SprintState } from "./trainSprint";
import { createIslandSign,islandGroundLift,islandSignPosition,islandSurfaceHeight,type IslandBounds } from "./trainLandmark";
import { createTrainAvatar, type AvatarId } from "./trainAvatar";
import { cameraBoomDistance,cameraGroundDistance } from "./trainCamera";
import { TORCH_SHADOW_LAYER,createTrainTorch } from "./trainTorch";
import { stepAdaptiveGraphics,trainFrameBudget,trainFrameDue,trainGraphicsProfile,trainPowerPreference,type AdaptiveGraphicsState,type FramePacer,type TrainGraphicsQuality } from "./trainGraphics";
import { fetchTrainModel } from "./trainAsset";
import { parseTrainManifest } from "./trainManifest";
import { createTrainEquipment, type EquipmentEvent } from "./trainEquipment";
import { STEP_SOUNDS, stepStride, type StrideState, type TrainSound } from "./trainAudio";
import { createRadioNotes } from "./trainRadioNotes";
import type { RadioSpatialFrame } from "./radioSpatialAudio";
import { advanceTrainTiming,dampTrainHeading,resetTrainTiming,trainWorldSpeed,TRAIN_SIMULATION_STEP,type TrainTimingState } from "./trainTiming";
import {createTrainInteractionRegions,pickTrainInteraction} from "./trainInteraction";
import {createTrainHitboxes} from "./trainHitboxes";

type Point = [number, number];
export interface TrainActions {
  failed: () => void;
  activate: (object: string) => void;
  hover: (object: string | null) => void;
  equipment?: (event:EquipmentEvent)=>void;
  sound?: (sound:TrainSound,options?:{volume?:number;rate?:number})=>void;
  radioSpatial?: (frame:RadioSpatialFrame|null)=>void;
  stamina?: (energy:number,sprinting:boolean,exhausted:boolean)=>void;
  avatarStatus?: (message:string)=>void;
}

const CANVAS_LABEL="Interactive train carriage. Drag to look, WASD to walk, Control to sprint, Shift to toggle shift lock, C to lie flat or stand, V to switch perspective, O to switch free orbit and character aim, M for the catalog, Q to toggle the flashlight, arrows to turn, Space to double jump, E to interact with the object ahead. Click objects directly to use them. On touch screens, drag with two fingers to walk, drag farther to sprint, and double tap empty space to jump. Home returns to your seat, Escape releases controls";
const CANVAS_SHORTCUTS="W A S D Control Shift C V O M Q ArrowLeft ArrowRight ArrowUp ArrowDown Space E Home Escape";
const MOVEMENT_KEYS=["KeyW","KeyA","KeyS","KeyD","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","ControlLeft","ControlRight","Space"];
const CONTROL_KEYS=["ShiftLeft","ShiftRight","KeyC","KeyV","KeyO","KeyM","KeyQ","KeyE","Home"];
const HIDDEN_MESHES=["realm","island","sky","water"];

export async function mountTrainScene(host: HTMLElement, signal: AbortSignal, actions: TrainActions, initialQuality:TrainGraphicsQuality="low") {
  THREE.Mesh.prototype.raycast=acceleratedRaycast;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, .05, 500);
  let graphicsQuality=initialQuality;
  const createRenderer=(quality:TrainGraphicsQuality)=>{
    const next=new THREE.WebGLRenderer({ antialias: false, powerPreference: trainPowerPreference(quality) });
    next.outputColorSpace = THREE.SRGBColorSpace;
    const element=next.domElement;
    element.tabIndex = 0;
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", CANVAS_LABEL);
    element.setAttribute("aria-keyshortcuts", CANVAS_SHORTCUTS);
    return next;
  };
  let renderer = createRenderer(graphicsQuality);
  renderer.setClearColor("#171322");
  let canvas = renderer.domElement;
  let retired:THREE.WebGLRenderer|undefined;
  const events = new AbortController();
  let canvasEvents = new AbortController();
  const meshes: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const baseColors = new Map<THREE.Material,THREE.Color>();
  const exteriorInstances: THREE.InstancedMesh[] = [];
  const scenery:THREE.InstancedMesh[]=[];
  const boundsTrees=new Set<THREE.BufferGeometry>();
  let environment:ReturnType<typeof createTrainEnvironment> | undefined;
  let islandSign:ReturnType<typeof createIslandSign> | undefined;
  const avatarAmbient=new THREE.HemisphereLight("#e9dcff","#493334",2);
  const avatarKey=new THREE.DirectionalLight("#ffe3bd",2.2);
  avatarKey.position.set(-3,7,3);
  scene.add(avatarAmbient,avatarKey);
  let requestRender=()=>{};
  const avatar=createTrainAvatar(scene,signal,message=>actions.avatarStatus?.(message),model=>{
    model.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material])for(const value of Object.values(material))if(value instanceof THREE.Texture)renderer.initTexture(value);
    });
    return renderer.compileAsync(model,camera,scene);
  });
  const torch=createTrainTorch(scene,renderer,signal);
  torch.setQuality(graphicsQuality);
  const pacer:FramePacer={nextAt:NaN};
  const desired:{avatar:AvatarId;quality:TrainGraphicsQuality}={avatar:"sniqr",quality:graphicsQuality};
  let avatarId:AvatarId="sniqr";
  let avatarQuality:TrainGraphicsQuality|undefined;
  let avatarRequest=Promise.resolve(false);
  const syncAvatar=()=>{
    const target={...desired};
    const run=avatar.select(target.avatar,target.quality).then(loaded=>{
      if(loaded) {avatarId=target.avatar;avatarQuality=target.quality;requestRender();}
      return loaded;
    });
    avatarRequest=run;
    const settle=async(current:Promise<boolean>):Promise<boolean>=>{const loaded=await current;return current===avatarRequest?loaded:settle(avatarRequest);};
    return settle(run);
  };
  void syncAvatar();
  const torchLoading=torch.load();
  const adaptiveGraphics:AdaptiveGraphicsState={scale:1,slowFrames:0,fastFrames:0};
  const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let switching = false;
  let frame = 0;
  let hoverFrame = 0;
  let observer: ResizeObserver | undefined;
  let visibility: IntersectionObserver | undefined;
  const keys = new Set<string>();
  let moving = false;
  let equipment:Awaited<ReturnType<typeof createTrainEquipment>>|undefined;
  let radioNotes:ReturnType<typeof createRadioNotes>|undefined;
  let hitboxes:ReturnType<typeof createTrainHitboxes>|undefined;
  const stride:StrideState={travelled:0,last:-1};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    equipment?.dispose();
    radioNotes?.dispose();
    hitboxes?.dispose();
    actions.radioSpatial?.(null);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(hoverFrame);
    observer?.disconnect();
    visibility?.disconnect();
    events.abort();
    canvasEvents.abort();
    keys.clear();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    for (const geometry of boundsTrees) geometry.boundsTree = undefined;
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for(const mesh of scenery)mesh.dispose();
    environment?.dispose();
    islandSign?.dispose();
    avatar.dispose();
    torch.dispose();
    for (const mesh of exteriorInstances) mesh.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    if(retired) {retired.dispose();retired.forceContextLoss();retired.domElement.remove();retired=undefined;}
  };
  signal.addEventListener("abort", dispose, { once: true, signal: events.signal });
  try {
    const [model, manifest] = await Promise.all([
      fetchTrainModel("/train/carriage.glb.gz", signal, "Scene download failed"),
      fetch("/train/scene.json", { signal }).then(async response => {
        if (!response.ok) throw new Error("Scene download failed");
        return parseTrainManifest(await response.json());
      }),
    ]);
    const gltf = await new GLTFLoader().parseAsync(model, "/train/");
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of originals) material.dispose();
      object.material = new THREE.MeshBasicMaterial({ vertexColors: true });
      geometries.add(object.geometry);
      materials.add(object.material);
      baseColors.set(object.material,object.material.color.clone());
      meshes.push(object);
    });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{object.matrixAutoUpdate=false;});
    const tint=new THREE.Color();
    const part=(geometry:THREE.BufferGeometry,position:[number,number,number],color:string,tilt=0)=>{
      geometry.deleteAttribute("normal");geometry.deleteAttribute("uv");
      if(tilt)geometry.rotateX(tilt);
      geometry.translate(...position);
      tint.set(color);
      const colors=new Float32Array(geometry.getAttribute("position").count*3);
      for(let i=0;i<colors.length;i+=3) {colors[i]=tint.r;colors[i+1]=tint.g;colors[i+2]=tint.b;}
      return geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
    };
    const box=(size:[number,number,number],position:[number,number,number],color:string,tilt=0)=>part(new THREE.BoxGeometry(...size),position,color,tilt);
    const merge=(name:string,parts:THREE.BufferGeometry[])=>{
      const geometry=mergeGeometries(parts);
      for(const piece of parts)piece.dispose();
      if(!geometry)throw new Error("Carriage geometry unavailable");
      const material=new THREE.MeshBasicMaterial({vertexColors:true});
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=name;mesh.matrixAutoUpdate=false;scene.add(mesh);meshes.push(mesh);geometries.add(geometry);materials.add(material);baseColors.set(material,material.color.clone());
    };
    const structure=carriageStructure();
    const shell:THREE.BufferGeometry[]=[];
    for(const piece of structure) {
      if(!piece.visible)continue;
      const top=piece===structure[0]?-.035:piece.top;
      shell.push(box([piece.max[0]-piece.min[0],top-piece.bottom,piece.max[1]-piece.min[1]],[(piece.max[0]+piece.min[0])/2,(top+piece.bottom)/2,(piece.max[1]+piece.min[1])/2],piece.top===0?"#3b2727":"#4f2a2a"));
    }
    const colliders=[...manifest.colliders,...structure];
    for(const z of [-2.95,2.95])shell.push(box([1.8,.32,1.15],[0,-.31,z],"#28232d"));
    for(const z of [-3.25,-2.65,2.65,3.25]) {
      shell.push(box([1.5,.08,.08],[0,-.62,z],"#49414c"));
      for(const x of [-.72,.72]) {
        shell.push(part(new THREE.CylinderGeometry(.3,.3,.14,16).rotateZ(Math.PI/2),[x,-.62,z],"#27242c"));
        shell.push(part(new THREE.CylinderGeometry(.09,.09,.17,10).rotateZ(Math.PI/2),[x,-.62,z],"#706975"));
      }
    }
    for(const x of [-.6,.6])shell.push(box([.09,.09,2],[x,-.8,5.96],"#493735",.65));
    merge("carriage",shell);
    const notebooks:THREE.BufferGeometry[]=[];
    for(let i=0;i<3;i++) {
      notebooks.push(box([.28,.045,.36],[1.05,.90,-1.85-i*.48],["#65405a","#46554a","#72523a"][i]));
      notebooks.push(box([.25,.025,.33],[1.05,.925,-1.85-i*.48],"#c6b39b"));
    }
    merge("notebooks",notebooks);
    camera.position.fromArray(manifest.camera.position);
    camera.position.y=EYE_HEIGHT;
    const home = camera.position.clone();
    const player:PlayerState={x:home.x,z:home.z,feet:0,velocityY:0,grounded:true};
    let perspective:"first"|"third"="third";
    let cameraMode:"orbit"|"aim"="orbit";
    let shiftLock=false;
    let heading=0;
    const sprint:SprintState={energy:1,cooldown:0,exhausted:false};
    let staminaState=-1;
    const homeDirection = new THREE.Vector3().fromArray(manifest.camera.target).sub(home);
    const startYaw = Math.atan2(-homeDirection.x, -homeDirection.z);
    let yaw = startYaw;
    heading=startYaw+Math.PI;
    let pitch = 0;
    let paused = reducedMotion.matches;
    let suspended = false;
    let inView = true;
    const timing:TrainTimingState={lastAt:NaN,remainder:0};
    let worldSpeed=1;
    let simulationTime=0;
    let showHitboxes=false;
    let animationElapsed=0;
    let animationTravel=0;
    let distance = 0;
    let sceneryDistance = Number.NaN;
    let exteriorTravel=0;
    let touchX = 0;
    let touchZ = 0;
    let touchSprint=false;
    const touches=new Map<number,Point>();
    let touchOrigin:Point|undefined;
    let lastTap=0;
    const orientation = new THREE.Euler(0, 0, 0, "YXZ");
    const cameraTarget=new THREE.Vector3();
    const cameraDirection=new THREE.Vector3();
    const cameraRight=new THREE.Vector3();
    const cameraCollisionRay=new THREE.Raycaster();
    cameraCollisionRay.firstHitOnly=true;
    const cameraHits:THREE.Intersection[]=[];
    const ray = new THREE.Raycaster();
    ray.far = 4;
    ray.firstHitOnly=true;
    const hoverHits:THREE.Intersection[]=[];
    const pointerPosition = new THREE.Vector2();
    const interactive = meshes.filter(m => ["case", "radio", "cord", "notebooks"].includes(m.name) || m.name.startsWith("NT_R02_Lamp"));
    const regions=createTrainInteractionRegions();
    const charmRegion={name:"equipment:charm",bounds:new THREE.Box3(),enabled:false};
    regions.push(charmRegion);
    const interactionPoint=new THREE.Vector3();
    const isInteractive=(name:string)=>{
      if(name.startsWith("equipment:"))return !!equipment?.isInteractive(name);
      for(const mesh of interactive)if(mesh.name===name)return true;
      return false;
    };
    const solid = meshes.filter(m => !HIDDEN_MESHES.includes(m.name));
    const ceilingHeight=(x:number,z:number)=>Math.abs(x)<1.58&&Math.abs(z)<4.3&&player.feet<2.5?(Math.abs(x)>1.24?2.35:2.61):Infinity;
    let hover: string | null = null;
    let hoverDirty = true;
    const hoverView = new THREE.Matrix4();
    let canvasRect = new DOMRect();
    let pointer: { id: number; x: number; y: number; lastX: number; lastY: number; dragged: boolean } | undefined;
    let pointerAt: Point | undefined;
    const updateHover = (force=false) => {
      if (suspended || document.hidden) return;
      camera.updateMatrixWorld();
      if (!force && !hoverDirty && hoverView.equals(camera.matrixWorld)) return;
      hoverDirty = false;
      hoverView.copy(camera.matrixWorld);
      if (pointerAt && document.pointerLockElement !== canvas && canvasRect.width && canvasRect.height) {
        pointerPosition.set((pointerAt[0]-canvasRect.left)/canvasRect.width*2-1, -(pointerAt[1]-canvasRect.top)/canvasRect.height*2+1);
      } else pointerPosition.set(0, 0);
      ray.setFromCamera(pointerPosition, camera);
      hoverHits.length = 0;
      ray.intersectObjects(solid, false, hoverHits);
      charmRegion.enabled=equipment?.getCharmBounds(charmRegion.bounds)??false;
      const name=pickTrainInteraction(ray.ray,hoverHits,regions,isInteractive,interactionPoint);
      if (hover !== name) { hover = name; actions.hover(name); }
    };
    const requestHover = () => {
      hoverDirty = true;
      if (hoverFrame || frame || disposed || switching) return;
      hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; updateHover(); });
    };
    const realm = meshes.find(m => m.name === "realm");
    let tileLength = 1;
    const matrix = new THREE.Matrix4();
    if (realm) {
      realm.geometry.computeBoundingBox();
      const box = realm.geometry.boundingBox!;
      tileLength = box.max.z - box.min.z + 30;
    }
    const tileOffset=(value:number)=>((value%tileLength)+tileLength*1.5)%tileLength-tileLength/2;
    const islandBounds=manifest.landmarks?.island;
    const outdoorBounds=exteriorMovementBounds(tileLength,islandBounds?(islandBounds.max[2]-islandBounds.min[2])/2:0);
    const island=meshes.find(mesh=>mesh.name==="island");
    let islandGround:{bounds:IslandBounds;lift:number}|undefined;
    if(island&&islandBounds) {
      const lift=islandGroundLift(islandBounds,tileLength);
      islandGround={bounds:islandBounds,lift};
      island.geometry.translate(0,lift,0);
      islandSign=createIslandSign(scene,islandSignPosition(islandBounds,lift),tileLength);
      document.fonts?.load("500 30px Outfit").then(()=>{if(!disposed){islandSign?.redraw();requestRender();}}).catch(()=>{});
    }
    let islandCopies:THREE.InstancedMesh|undefined;
    for(const mesh of [realm,island]) {
      if(!mesh)continue;
      const instances=new THREE.InstancedMesh(mesh.geometry,mesh.material,5);
      for(let i=0;i<5;i++)instances.setMatrixAt(i,matrix.makeTranslation(0,0,(i-2)*tileLength));
      instances.frustumCulled=false;instances.matrixAutoUpdate=false;
      mesh.visible=false;scene.add(instances);scenery.push(instances);
      if(mesh===island)islandCopies=instances;
    }
    const movementWorld:MovementWorld={
      groundHeight:(x,z)=>{
        if(Math.abs(x)<1.75)return -1.1;
        const localZ=z-distance;
        const terrain=terrainSurfaceHeight(x,localZ,tileLength);
        const islandHeight=islandGround&&islandSurfaceHeight(x,localZ,islandGround.bounds,islandGround.lift,tileLength);
        return islandHeight===undefined?terrain:Math.max(terrain,islandHeight);
      },
      ceilingHeight,
      driftZ:0,
    };
    const toggleProne=()=>{
      if(player.prone) {
        if(!canStand(player,colliders,ceilingHeight(player.x,player.z)))return false;
        player.prone=false;
      } else if(!lieDown(player,colliders,outdoorBounds,movementWorld))return false;
      restart();
      return true;
    };
    const fog = new THREE.FogExp2("#171322", .0055);
    scene.fog = fog;
    let morning=false;
    const updateSky=()=>{
      const color=morning?"#7994a6":document.documentElement.hasAttribute("data-portrait")?"#0d0906":"#171322";
      renderer.setClearColor(color);fog.color.set(color);
    };
    updateSky();
    environment=createTrainEnvironment(scene,tileLength);
    const torchOccluders=[...solid,...environment.getOccluders()];
    const cameraOccluders=islandCopies?[...torchOccluders,islandCopies]:torchOccluders;
    for(const object of cameraOccluders) {
      const geometry=(object as THREE.Mesh).geometry;
      if(!geometry||geometry.boundsTree)continue;
      geometry.boundsTree=new MeshBVH(geometry);
      boundsTrees.add(geometry);
    }
    const water=meshes.find(mesh=>mesh.name==="water");
    if(water)water.visible=false;
    const forest: { mesh: THREE.InstancedMesh; points: THREE.Vector3[]; color: THREE.Color }[] = [];
    let seed=173;
    const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    const trees=Array.from({length:64},(_,i)=>{
      const x=i%3===0?10+random()*16:-10-random()*20;
      const z=(random()-.5)*tileLength;
      return new THREE.Vector3(x,terrainSurfaceHeight(x,z,tileLength),z);
    });
    const rotation=new THREE.Quaternion();
    const translation=new THREE.Vector3();
    const grove=(geometry: THREE.BufferGeometry,color: string,points: THREE.Vector3[],scale: THREE.Vector3) => {
      const material=new THREE.MeshBasicMaterial({color});
      const mesh=new THREE.InstancedMesh(geometry,material,points.length*3);
      for(let copy=0;copy<3;copy++)for(let i=0;i<points.length;i++)mesh.setMatrixAt(copy*points.length+i,matrix.compose(translation.copy(points[i]),rotation,scale));
      mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;scene.add(mesh);
      geometries.add(geometry);materials.add(material);exteriorInstances.push(mesh);forest.push({mesh,points,color:material.color.clone()});
    };
    const unit=new THREE.Vector3(1,1,1);
    grove(new THREE.CylinderGeometry(.13,.22,3.8,7),"#342732",trees.map(p=>p.clone().add(new THREE.Vector3(0,1.8,0))),unit);
    grove(new THREE.ConeGeometry(1.7,5,8),"#283d3a",trees.filter((_,i)=>i%3!==0).map(p=>p.clone().add(new THREE.Vector3(0,4.1,0))),unit);
    grove(new THREE.ConeGeometry(2.1,2.8,9),"#233831",trees.filter((_,i)=>i%3!==0).map(p=>p.clone().add(new THREE.Vector3(0,2.9,0))),unit);
    grove(new THREE.IcosahedronGeometry(1,1),"#7d608b",trees.filter((_,i)=>i%3===0).map(p=>p.clone().add(new THREE.Vector3(0,3.3,0))),new THREE.Vector3(2.6,.75,2.1));
    grove(new THREE.ConeGeometry(.6,2.8,6).rotateZ(Math.PI),"#a17aaa",trees.filter((_,i)=>i%3===0).map(p=>p.clone().add(new THREE.Vector3(.8,2.4,.3))),unit);
    grove(new THREE.IcosahedronGeometry(1,1),"#393443",trees.map(p=>p.clone().add(new THREE.Vector3(0,-.7,0))),new THREE.Vector3(3,1.2,3.5));
    torch.castShadows(solid);
    torch.castShadows(environment.getShadowCasters());
    const outsideCasters:THREE.Object3D[]=forest.map(group=>group.mesh);
    if(islandCopies)outsideCasters.push(islandCopies);
    let castingOutside=false;
    const patchMaterials=()=>{
      for(const material of materials)if(material instanceof THREE.MeshBasicMaterial)torch.patch(material);
      environment?.patchMaterials(material=>torch.patch(material));
    };
    patchMaterials();
    const radioMesh=meshes.find(mesh=>mesh.name==="radio");
    if(radioMesh)radioNotes=createRadioNotes(scene,radioMesh);
    const audioForward=new THREE.Vector3();
    const audioUp=new THREE.Vector3();
    const audioPosition=new THREE.Vector3();
    const audioEmitter=radioMesh?new THREE.Box3().setFromObject(radioMesh).getCenter(new THREE.Vector3()):new THREE.Vector3();
    const audioView=new THREE.Matrix4();
    const audioFrame:RadioSpatialFrame={position:audioPosition,forward:audioForward,up:audioUp,emitter:audioEmitter,indoors:true};
    let lastAudioAt=-Infinity;
    const updateRadioSpatial=(now:number,force=false)=>{
      if(!radioMesh||!force&&now-lastAudioAt<50||lastAudioAt!==-Infinity&&audioView.equals(camera.matrixWorld))return;
      lastAudioAt=now;audioView.copy(camera.matrixWorld);audioPosition.copy(camera.position);
      camera.getWorldDirection(audioForward);audioUp.set(0,1,0).applyQuaternion(camera.quaternion);
      audioFrame.indoors=Math.abs(camera.position.x)<1.75&&Math.abs(camera.position.z)<4.5&&camera.position.y<2.8;
      actions.radioSpatial?.(audioFrame);
    };
    void createTrainEquipment(scene,signal).then(loaded=>{
      if(disposed) {loaded.dispose();return;}
      equipment=loaded;
      equipment.setDay(morning);
      for(const material of loaded.materials) {materials.add(material);torch.patch(material);}
      for(const mesh of loaded.meshes) {
        if(mesh.name==="equipment:drawer-cavity")continue;
        solid.push(mesh);
        if(mesh.name==="equipment:drawer")torchOccluders.push(mesh);
        interactive.push(mesh);
      }
      torch.castShadows(loaded.meshes);
      hoverDirty=true;
      return renderer.compileAsync(scene,camera);
    }).catch(()=>{}).then(()=>{if(!disposed)restart();});
    const updateScenery=()=>{
      if(distance===sceneryDistance)return;
      sceneryDistance=distance;
      environment?.update(distance);
      islandSign?.update(distance);
      const offset=tileOffset(distance);
      for(const mesh of scenery) {mesh.position.z=offset;mesh.updateMatrix();mesh.updateMatrixWorld();}
      for(const group of forest) {
        const values=group.mesh.instanceMatrix.array,count=group.points.length;
        for(let copy=0;copy<3;copy++)for(let i=0;i<count;i++)values[(copy*count+i)*16+14]=((group.points[i].z+copy*tileLength+distance+tileLength*4.5)%(tileLength*3))-tileLength*1.5;
        group.mesh.instanceMatrix.needsUpdate=true;
      }
    };
    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1 ? 68 : 55;
      camera.updateProjectionMatrix();
      const profile=trainGraphicsProfile(graphicsQuality,width,height,devicePixelRatio);
      renderer.setPixelRatio(profile.pixelRatio*(graphicsQuality==="low"?adaptiveGraphics.scale:1));
      renderer.setSize(width, height, false);
      canvasRect=canvas.getBoundingClientRect();
      hoverDirty=true;
    };
    const castCamera=(direction:THREE.Vector3,length:number)=>{
      if(length<=0)return 0;
      cameraCollisionRay.set(cameraTarget,direction);
      cameraCollisionRay.far=length;
      cameraHits.length=0;
      const hit=cameraCollisionRay.intersectObjects(cameraOccluders,false,cameraHits)[0];
      return hit?Math.min(length,Math.max(0,hit.distance-.12)):length;
    };
    const render = (now: number) => {
      frame=0;
      if (disposed || switching || !inView || document.hidden || suspended) return;
      const started=performance.now();
      const fresh=!Number.isFinite(timing.lastAt);
      const steps=advanceTrainTiming(timing,now,worldSpeed);
      let strafe = Number(keys.has("KeyD"))-Number(keys.has("KeyA"))+touchX;
      let forward = Number(keys.has("KeyW"))-Number(keys.has("KeyS"))+touchZ;
      const turn = Number(keys.has("ArrowRight"))-Number(keys.has("ArrowLeft"));
      const length = Math.hypot(strafe, forward);
      if (length > 1) { strafe /= length; forward /= length; }
      const locked=shiftLock||cameraMode==="aim"||perspective==="first";
      let sprinting=!player.prone&&canSprint(sprint,keys.has("ControlLeft")||keys.has("ControlRight")||touchSprint,length>0);
      for(let i=0;i<steps;i++) {
        const delta=TRAIN_SIMULATION_STEP;
        simulationTime+=delta*1000;
        yaw -= turn*delta*1.5;
        pitch = THREE.MathUtils.clamp(pitch+(Number(keys.has("ArrowUp"))-Number(keys.has("ArrowDown")))*delta, -1.15, 1.15);
        sprinting=!player.prone&&canSprint(sprint,keys.has("ControlLeft")||keys.has("ControlRight")||touchSprint,length>0);
        const speed = (player.prone?CRAWL_SPEED:sprinting ? SPRINT_SPEED : WALK_SPEED)*delta;
        const dx = (Math.cos(yaw)*strafe-Math.sin(yaw)*forward)*speed;
        const dz = (-Math.sin(yaw)*strafe-Math.cos(yaw)*forward)*speed;
        const outside=Math.abs(player.x)>1.74||player.z>4.45||player.z<-4.45;
        if(!outside)exteriorTravel=0;
        const drift=trainDrift(paused,outside,exteriorTravel);
        if(drift) {
          distance=(distance+delta*drift)%tileLength;
          if(outside)exteriorTravel=Math.min(MAX_EXTERIOR_TRAVEL,exteriorTravel+delta*drift);
        }
        if(!drift||player.grounded&&player.transportZ)player.transportZ=drift;
        movementWorld.driftZ=drift;
        turnPlayer(player,locked?yaw+Math.PI:heading,colliders,outdoorBounds,movementWorld);
        if(player.prone)heading=player.heading!;
        const moved=stepPlayer(player,dx,dz,delta,colliders,outdoorBounds,movementWorld);
        const walked=moved>.0001;
        animationElapsed+=delta;
        animationTravel+=moved;
        stepSprint(sprint,sprinting&&walked,delta);
        if(walked&&player.grounded&&!player.prone&&!outside) {
          const step=stepStride(stride,moved,sprinting);
          if(step!==undefined)actions.sound?.(STEP_SOUNDS[step],{rate:.94+Math.random()*.12,volume:sprinting?1.25:1});
        } else if(!walked)stride.travelled=0;
        const nextStamina=Math.round(sprint.energy*100)*8+(sprint.energy===1?4:0)+(sprinting&&walked?2:0)+(sprint.exhausted?1:0);
        if(nextStamina!==staminaState) {staminaState=nextStamina;actions.stamina?.(sprint.energy,sprinting&&walked,sprint.exhausted);}
        if(locked) {if(!player.prone)heading=yaw+Math.PI;}
        else if(walked&&length>0)heading=dampTrainHeading(heading,Math.atan2(dx,dz),delta);
        if(player.prone&&!turnPlayer(player,heading,colliders,outdoorBounds,movementWorld))heading=player.heading!;
      }
      if(!trainFrameDue(pacer,graphicsQuality,now,fresh)) {frame=requestAnimationFrame(render);return;}
      const outside=Math.abs(player.x)>1.74||player.z>4.45||player.z<-4.45;
      const drift=trainDrift(paused,outside,exteriorTravel);
      const walked=animationTravel>.0001;
      const nominalSpeed=player.prone?CRAWL_SPEED:sprinting?SPRINT_SPEED:WALK_SPEED;
      const locomotionScale=animationElapsed>0?animationTravel/(nominalSpeed*animationElapsed):0;
      updateScenery();
      if(locked&&!player.prone)heading=yaw+Math.PI;
      const eyeHeight=player.prone?PRONE_EYE_HEIGHT:EYE_HEIGHT;
      cameraTarget.set(player.x,eyeHeight+player.feet,player.z);
      orientation.set(pitch,yaw,0);
      camera.quaternion.setFromEuler(orientation);
      camera.position.copy(cameraTarget);
      let boom=0;
      if(perspective==="third") {
        if(shiftLock) {
          cameraRight.set(Math.cos(yaw),0,-Math.sin(yaw));
          const shoulder=castCamera(cameraRight,cameraBoomDistance(cameraTarget,cameraRight,.32,colliders));
          cameraTarget.addScaledVector(cameraRight,shoulder);
          camera.position.copy(cameraTarget);
        }
        cameraDirection.set(0,0,1).applyQuaternion(camera.quaternion);
        boom=castCamera(cameraDirection,cameraBoomDistance(cameraTarget,cameraDirection,player.prone?2.4:2.8,colliders));
        boom=cameraGroundDistance(cameraTarget,cameraDirection,boom,movementWorld.groundHeight);
        camera.position.addScaledVector(cameraDirection,boom);
      }
      const avatarVisible=perspective==="third"&&boom>.55;
      const animating=avatar.update(player,heading,walked&&length>0,sprinting,avatarVisible,animationElapsed,reducedMotion.matches,locomotionScale);
      animationElapsed=animationTravel=0;
      if(outside!==castingOutside) {
        castingOutside=outside;
        for(const object of outsideCasters)if(outside)object.layers.enable(TORCH_SHADOW_LAYER);else object.layers.disable(TORCH_SHADOW_LAYER);
      }
      camera.updateMatrixWorld();
      updateRadioSpatial(now);
      const shadowPending=torch.update(camera,avatar.getHandSocket(),perspective==="first",avatarVisible,torchOccluders,now,heading,locked);
      const equipmentAnimating=equipment?.update(simulationTime,torch.getBeam(),torchOccluders,reducedMotion.matches)??false;
      if(equipmentAnimating)hoverDirty=true;
      if(showHitboxes) {
        charmRegion.enabled=equipment?.getCharmBounds(charmRegion.bounds)??false;
        hitboxes?.update(player,charmRegion);
      }
      const radioAnimating=radioNotes?.update(now,reducedMotion.matches)??false;
      renderer.render(scene,camera);
      if(graphicsQuality==="low") {
        const scale=adaptiveGraphics.scale;
        stepAdaptiveGraphics(adaptiveGraphics,performance.now()-started,trainFrameBudget(graphicsQuality));
        if(adaptiveGraphics.scale!==scale)resize();
      }
      cancelAnimationFrame(hoverFrame);hoverFrame=0;
      updateHover();
      moving = length > 0 || keys.size > 0 || !player.grounded || sprint.energy<1;
      if (drift || moving || animating || shadowPending || equipmentAnimating || radioAnimating) frame = requestAnimationFrame(render);
      else updateRadioSpatial(now,true);
    };
    const restart = () => {
      if(disposed||switching||!inView||document.hidden||suspended) {cancelAnimationFrame(frame);frame=0;resetTrainTiming(timing);animationElapsed=animationTravel=0;return;}
      if(frame)return;
      resetTrainTiming(timing);
      animationElapsed=animationTravel=0;
      cancelAnimationFrame(hoverFrame);hoverFrame=0;
      frame = requestAnimationFrame(render);
    };
    const clearInput = () => { keys.clear();touches.clear();touchOrigin=undefined;touchX=touchZ=0;touchSprint=false;pointer=undefined; };
    const jump = () => { if (!suspended) { jumpPlayer(player); restart(); } };
    const activateEquipment = (name:string) => {
      if(!equipment)return false;
      const event=equipment.activate(name,simulationTime);
      if(event==="none")return false;
      hoverDirty=true;
      actions.equipment?.(event);
      restart();
      return true;
    };
    const use = () => {
      updateHover(true);
      if (!hover) return;
      if (hover.startsWith("equipment:")) activateEquipment(hover);
      else actions.activate(hover);
    };
    const look = (horizontal: number, vertical = 0) => { yaw -= horizontal; pitch = THREE.MathUtils.clamp(pitch-vertical,-1.15,1.15); restart(); };
    let pendingLock=0;
    let lockGeneration=0;
    const lockPointer = async () => {
      if(pendingLock) {lockGeneration=pendingLock;return;}
      if(document.pointerLockElement===canvas||!canvas.requestPointerLock)return;
      const element=canvas;
      const generation=pendingLock=++lockGeneration;
      element.focus({preventScroll:true});
      try {
        await element.requestPointerLock();
        if(generation!==lockGeneration||!shiftLock||suspended||element!==canvas) {if(document.pointerLockElement===element)document.exitPointerLock();}
      } catch {
        if(generation===lockGeneration) {shiftLock=false;restart();}
      } finally {
        if(pendingLock===generation)pendingLock=0;
      }
    };
    const releasePointer=()=>{
      lockGeneration++;
      if(document.pointerLockElement===canvas)document.exitPointerLock();
    };
    const setShiftLock=(value:boolean)=>{
      shiftLock=value;
      if(value&&!suspended&&matchMedia("(pointer: fine)").matches)lockPointer();
      else if(!value)releasePointer();
      restart();
    };
    document.addEventListener("pointerlockchange",()=>{
      if(document.pointerLockElement===canvas&&(suspended||!shiftLock))releasePointer();
      if(document.pointerLockElement!==canvas)shiftLock=false;
      requestHover();
      restart();
    },{signal:events.signal});
    document.addEventListener("keydown",event=>{
      if(event.code==="Escape"&&!suspended) {clearInput();setShiftLock(false);}
    },{signal:events.signal});
    observer = new ResizeObserver(() => { resize(); restart(); });
    visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (!inView) clearInput(); restart(); });
    observer.observe(host);
    visibility.observe(host);
    document.addEventListener("visibilitychange", () => { clearInput(); restart(); }, { signal: events.signal });
    window.addEventListener("blur", clearInput, { signal: events.signal });
    const syncTheme=()=>{updateSky();restart();};
    window.addEventListener("portrait:claimed",syncTheme,{signal:events.signal});
    window.addEventListener("portrait:cleared",syncTheme,{signal:events.signal});
    window.addEventListener("keyup", event => { keys.delete(event.code); }, { signal: events.signal });
    const bindCanvas=()=>{
      const controller=new AbortController();
      const options={signal:controller.signal};
      canvas.addEventListener("blur", clearInput, options);
      canvas.addEventListener("pointerdown", event => {
        if ((!event.isPrimary&&event.pointerType!=="touch") || event.button !== 0 || suspended) return;
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        canvas.focus({ preventScroll: true });
        if(document.pointerLockElement!==canvas) {
          try {canvas.setPointerCapture(event.pointerId);} catch {}
        }
        if(event.pointerType==="touch") {
          touches.set(event.pointerId,[event.clientX,event.clientY]);
          if(touches.size>1) {
            const points=[...touches.values()];
            touchOrigin=[points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
            pointer=undefined;
            lastTap=0;
            return;
          }
        }
        pointerAt = [event.clientX,event.clientY];
        pointer = { id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,dragged:false };
      }, options);
      canvas.addEventListener("pointermove", event => {
        if(touches.has(event.pointerId))touches.set(event.pointerId,[event.clientX,event.clientY]);
        if(touchOrigin&&touches.size>1) {
          const points=[...touches.values()];
          const x=points.reduce((sum,p)=>sum+p[0],0)/points.length-touchOrigin[0];
          const z=touchOrigin[1]-points.reduce((sum,p)=>sum+p[1],0)/points.length;
          touchX=THREE.MathUtils.clamp(x/70,-1,1);
          touchZ=THREE.MathUtils.clamp(z/70,-1,1);
          touchSprint=Math.hypot(x,z)>115;
          restart();
          return;
        }
        pointerAt = [event.clientX,event.clientY];
        if (document.pointerLockElement === canvas) { look(event.movementX*.0025,event.movementY*.0025); return; }
        if (pointer && event.pointerId === pointer.id) {
          if (Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>5) pointer.dragged = true;
          look((event.clientX-pointer.lastX)*.004,(event.clientY-pointer.lastY)*.004);
          pointer.lastX=event.clientX; pointer.lastY=event.clientY;
        }
        requestHover();
      }, options);
      canvas.addEventListener("pointerup", event => {
        touches.delete(event.pointerId);
        if(touchOrigin) {
          touchOrigin=undefined;touchX=touchZ=0;touchSprint=false;pointer=undefined;
          if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
          return;
        }
        if (!pointer || event.pointerId !== pointer.id) return;
        const click = !pointer.dragged;
        pointer = undefined;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (click) {
          use();
          if(event.pointerType==="touch"&&!hover) {
            if(lastTap>0&&performance.now()-lastTap<320) {jump();lastTap=0;}
            else lastTap=performance.now();
          }
        }
      }, options);
      canvas.addEventListener("pointercancel",clearInput,options);
      canvas.addEventListener("lostpointercapture", () => { pointer = undefined; }, options);
      canvas.addEventListener("pointerleave", () => {
        pointerAt = undefined;
        hoverDirty = false;
        if (hover) { hover=null; actions.hover(null); }
      }, options);
      canvas.addEventListener("keydown", event => {
        if (suspended || event.metaKey || event.altKey) return;
        if(event.ctrlKey&&!MOVEMENT_KEYS.includes(event.code))return;
        if (MOVEMENT_KEYS.includes(event.code)||CONTROL_KEYS.includes(event.code)) event.preventDefault();
        if (event.code === "Space" && !event.repeat) jump();
        else if (event.code === "KeyE" && !event.repeat) { pointerAt=undefined; use(); }
        else if (event.code === "Home") reset();
        else if(event.code==="KeyC"&&!event.repeat)toggleProne();
        else if((event.code==="ShiftLeft"||event.code==="ShiftRight")&&!event.repeat)setShiftLock(!shiftLock);
        else if(event.code==="KeyV"&&!event.repeat)perspective=perspective==="third"?"first":"third";
        else if(event.code==="KeyO"&&!event.repeat)cameraMode=cameraMode==="orbit"?"aim":"orbit";
        else if(event.code==="KeyM"&&!event.repeat)actions.activate("avatar");
        else if(event.code==="KeyQ"&&!event.repeat) {torch.setTorch(!torch.getState().torch);actions.sound?.("torch",{rate:torch.getState().torch?1:.88});}
        else if(MOVEMENT_KEYS.includes(event.code))keys.add(event.code);
        if (event.code === "Escape") { clearInput();setShiftLock(false); }
        restart();
      }, options);
      canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); if (!disposed) actions.failed(); }, options);
      return controller;
    };
    canvasEvents=bindCanvas();
    const reset = () => { camera.position.copy(home);Object.assign(player,{x:home.x,z:home.z,feet:0,velocityY:0,grounded:true,transportZ:0,jumps:0,prone:false});Object.assign(sprint,{energy:1,cooldown:0,exhausted:false});yaw=startYaw;heading=startYaw+Math.PI;pitch=0;clearInput();canvas.focus({preventScroll:true});restart(); };
    const releaseGpuResources=()=>{
      const textures=new Set<THREE.Texture>();
      scene.traverse(object=>{
        if(object instanceof THREE.SkinnedMesh&&object.skeleton.boneTexture)textures.add(object.skeleton.boneTexture);
        if(!(object instanceof THREE.Mesh))return;
        object.geometry.dispose();
        for(const material of Array.isArray(object.material)?object.material:[object.material]) {
          material.dispose();
          for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
        }
        if(object instanceof THREE.InstancedMesh)object.dispose();
      });
      for(const texture of textures)texture.dispose();
      return textures;
    };
    const swapRenderer=async(quality:TrainGraphicsQuality)=>{
      if(trainPowerPreference(quality)===trainPowerPreference(graphicsQuality))return true;
      let next:THREE.WebGLRenderer;
      try {next=createRenderer(quality);} catch {return false;}
      switching=true;
      cancelAnimationFrame(frame);frame=0;cancelAnimationFrame(hoverFrame);hoverFrame=0;
      const previous=renderer,previousCanvas=canvas;
      const focused=document.activeElement===previousCanvas;
      if(document.pointerLockElement===previousCanvas)releasePointer();
      const textures=releaseGpuResources();
      torch.setRenderer(next);
      previous.dispose();
      retired=previous;
      renderer=next;canvas=next.domElement;
      updateSky();
      patchMaterials();
      resize();
      for(const texture of textures)if(texture.image)renderer.initTexture(texture);
      try {await renderer.compileAsync(scene,camera);} catch {}
      if(disposed)return false;
      canvasEvents.abort();
      canvasEvents=bindCanvas();
      previousCanvas.replaceWith(canvas);
      retired=undefined;
      previous.forceContextLoss();
      resize();
      if(focused)canvas.focus({preventScroll:true});
      switching=false;
      restart();
      return true;
    };
    host.append(canvas);
    resize();
    try {await renderer.compileAsync(scene,camera);} catch {}
    if(signal.aborted||disposed)throw new DOMException("Aborted","AbortError");
    requestRender=()=>{if(!disposed)restart();};
    restart();
    void torchLoading.then(()=>disposed?undefined:renderer.compileAsync(torch.root,camera,scene)).catch(()=>{}).then(requestRender);
    return {
      dispose, jump, use, reset, look,
      getPosition(){return {x:player.x,y:player.feet+(player.prone?PRONE_EYE_HEIGHT:EYE_HEIGHT),z:player.z,grounded:player.grounded};},
      getAvatarControls(){return {avatar:avatarId,perspective,cameraMode,shiftLock,prone:!!player.prone};},
      getGraphics(){return graphicsQuality;},
      getRadioSpatialFrame(){return radioMesh&&lastAudioAt!==-Infinity?audioFrame:null;},
      setRadioPlaying(value:boolean){radioNotes?.setPlaying(value);restart();},
      activateEquipment,
      getEquipmentState(){return equipment?.getState();},
      setShiftLock,
      async setAvatar(value:AvatarId){
        desired.avatar=value;
        const loaded=await syncAvatar();
        if(!loaded&&desired.avatar===value)desired.avatar=avatarId;
        restart();
        return loaded&&avatarId===value;
      },
      async setGraphics(value:TrainGraphicsQuality){
        if(value===graphicsQuality&&desired.quality===value)return true;
        const previous=graphicsQuality;
        desired.quality=value;
        const loaded=await syncAvatar();
        if(disposed||desired.quality!==value)return false;
        if(!loaded||avatarQuality!==value) {desired.quality=previous;return false;}
        const swapped=await swapRenderer(value);
        if(disposed)return false;
        if(!swapped) {
          desired.quality=previous;
          await syncAvatar();
          restart();
          return false;
        }
        graphicsQuality=value;
        torch.setQuality(value);
        resize();
        restart();
        return true;
      },
      setPerspective(value:"first"|"third"){perspective=value;restart();},
      setCameraMode(value:"orbit"|"aim"){cameraMode=value;restart();},
      toggleProne,
      getEquipment(){return torch.getState();},
      setSkin(id:string){torch.setSkin(id);restart();},
      setTorch(value:boolean){torch.setTorch(value);restart();},
      setDay(value: boolean) {
        morning=value;
        updateSky();
        environment?.setDay(morning);
        islandSign?.setDay(morning);
        equipment?.setDay(morning);
        avatarAmbient.intensity=morning?2.8:2;
        avatarKey.intensity=morning?2.5:2.2;
        tint.setRGB(morning?1.8:1,morning?1.9:1,morning?2:1);
        for (const mesh of meshes) {
          if (mesh.name.startsWith("NT_R02_Lamp")) continue;
          const material=mesh.material as THREE.MeshBasicMaterial;
          material.color.copy(baseColors.get(material)!).multiply(tint);
          if (mesh.name === "sky") mesh.visible=!morning;
        }
        for(const group of forest)(group.mesh.material as THREE.MeshBasicMaterial).color.copy(group.color).multiplyScalar(morning?1.6:1);
        restart();
      },
      setLamp(name: string, enabled: boolean, color: string) {
        const lamp = meshes.find(m=>m.name===name);
        if (!lamp) return;
        const material=lamp.material as THREE.MeshBasicMaterial;
        material.color.set(enabled?color:"#302734");
        restart();
      },
      setPaused(value: boolean) { paused=value; restart(); },
      setWorldSpeed(value:number) {
        const next=trainWorldSpeed(value);
        if(next===worldSpeed)return;
        worldSpeed=next;resetTrainTiming(timing);animationElapsed=animationTravel=0;restart();
      },
      setHitboxes(value:boolean) {
        showHitboxes=value;
        if(value&&!hitboxes)hitboxes=createTrainHitboxes(scene,colliders,regions,interactive);
        hitboxes?.setVisible(value);restart();
      },
      setSuspended(value: boolean) { suspended=value; clearInput(); if(value) {shiftLock=false;releasePointer();} else if(shiftLock&&matchMedia("(pointer: fine)").matches)lockPointer(); requestHover(); restart(); },
      move(x: number,z: number) { touchX=x; touchZ=z; restart(); },
      lockPointer,
    };
  } catch (error) { dispose(); throw error; }
}
