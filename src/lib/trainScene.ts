import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EYE_HEIGHT, PRONE_EYE_HEIGHT, CRAWL_SPEED, WALK_SPEED, SPRINT_SPEED, MAX_EXTERIOR_TRAVEL, canStand, carriageStructure, exteriorMovementBounds, jumpPlayer, stepPlayer, trainDrift, type CarriageCollider, type PlayerState } from "./trainPhysics";
import { createTrainEnvironment, terrainSurfaceHeight } from "./trainEnvironment";
import { canSprint,stepSprint,type SprintState } from "./trainSprint";
import { createIslandSign,islandGroundLift,islandSignPosition,islandSurfaceHeight,type IslandBounds } from "./trainLandmark";
import { createTrainAvatar, type AvatarId } from "./trainAvatar";
import { cameraBoomDistance } from "./trainCamera";
import { createTrainTorch } from "./trainTorch";

type Point = [number, number];
interface Manifest {
  camera: { position: [number, number, number]; target: [number, number, number]; horizontal_fov: number };
  colliders: CarriageCollider[];
  bounds: { min: Point; max: Point };
  landmarks?:{island:IslandBounds};
}
export interface TrainActions {
  failed: () => void;
  activate: (object: string) => void;
  hover: (object: string | null) => void;
  stamina?: (energy:number,sprinting:boolean,exhausted:boolean)=>void;
  avatarStatus?: (message:string)=>void;
}

export async function mountTrainScene(host: HTMLElement, signal: AbortSignal, actions: TrainActions) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, .05, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor("#171322");
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "group");
  canvas.setAttribute("aria-label", "Interactive train carriage. Drag to look, WASD to walk, Control to sprint, Shift to toggle shift lock, C to lie flat or stand, V to switch perspective, O to switch free orbit and character aim, M for the catalog, Q to toggle the flashlight, arrows to turn, Space to double jump, E to interact with the object ahead. Click objects directly to use them. On touch screens, drag with two fingers to walk, drag farther to sprint, and double tap empty space to jump. Home returns to your seat, Escape releases controls");
  canvas.setAttribute("aria-keyshortcuts", "W A S D Control Shift C V O M Q ArrowLeft ArrowRight ArrowUp ArrowDown Space E Home Escape");
  const events = new AbortController();
  const meshes: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const baseColors = new Map<THREE.Material,THREE.Color>();
  const exteriorInstances: THREE.InstancedMesh[] = [];
  const scenery:THREE.InstancedMesh[]=[];
  let environment:ReturnType<typeof createTrainEnvironment> | undefined;
  let islandSign:ReturnType<typeof createIslandSign> | undefined;
  const avatar=createTrainAvatar(scene,signal,message=>actions.avatarStatus?.(message));
  const torch=createTrainTorch(scene,renderer,signal);
  const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let frame = 0;
  let observer: ResizeObserver | undefined;
  let visibility: IntersectionObserver | undefined;
  const keys = new Set<string>();
  let moving = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    visibility?.disconnect();
    events.abort();
    keys.clear();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
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
  };
  signal.addEventListener("abort", dispose, { once: true, signal: events.signal });
  try {
    const [response, metadata] = await Promise.all([fetch("/train/carriage.glb.gz", { signal }), fetch("/train/scene.json", { signal })]);
    if (!response.ok || !metadata.ok) throw new Error("Scene download failed");
    const manifest: Manifest = await metadata.json();
    const bytes = await response.arrayBuffer();
    const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    const data = magic[0] === 0x1f && magic[1] === 0x8b
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : bytes;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const gltf = await new GLTFLoader().parseAsync(data, "/train/");
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
    if (signal.aborted) { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); throw new DOMException("Aborted", "AbortError"); }
    scene.add(gltf.scene);
    const addMesh = (name:string,geometry:THREE.BufferGeometry,position:[number,number,number],color:string) => {
      const material=new THREE.MeshBasicMaterial({color});
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=name;mesh.position.set(...position);scene.add(mesh);meshes.push(mesh);geometries.add(geometry);materials.add(material);baseColors.set(material,material.color.clone());
      return mesh;
    };
    const box = (name:string,size:[number,number,number],position:[number,number,number],color:string) => addMesh(name,new THREE.BoxGeometry(...size),position,color);
    const structure=carriageStructure();
    for(const part of structure) {
      if(!part.visible)continue;
      const top=part===structure[0]?-.035:part.top;
      box("carriage",[part.max[0]-part.min[0],top-part.bottom,part.max[1]-part.min[1]],[(part.max[0]+part.min[0])/2,(top+part.bottom)/2,(part.max[1]+part.min[1])/2],part.top===0?"#3b2727":"#4f2a2a");
    }
    const colliders=[...manifest.colliders,...structure];
    for(const z of [-2.95,2.95])box("carriage",[1.8,.32,1.15],[0,-.31,z],"#28232d");
    for(const z of [-3.25,-2.65,2.65,3.25]) {
      box("carriage",[1.5,.08,.08],[0,-.62,z],"#49414c");
      for(const x of [-.72,.72]) {
        addMesh("carriage",new THREE.CylinderGeometry(.3,.3,.14,16).rotateZ(Math.PI/2),[x,-.62,z],"#27242c");
        addMesh("carriage",new THREE.CylinderGeometry(.09,.09,.17,10).rotateZ(Math.PI/2),[x,-.62,z],"#706975");
      }
    }
    for(const x of [-.6,.6])box("carriage",[.09,.09,2],[x,-.8,5.96],"#493735").rotation.x=.65;
    for(let i=0;i<3;i++) {
      box("notebooks",[.28,.045,.36],[1.05,.90,-1.85-i*.48],["#65405a","#46554a","#72523a"][i]);
      box("notebooks",[.25,.025,.33],[1.05,.925,-1.85-i*.48],"#c6b39b");
    }
    camera.position.fromArray(manifest.camera.position);
    camera.position.y=EYE_HEIGHT;
    const home = camera.position.clone();
    const player:PlayerState={x:home.x,z:home.z,feet:0,velocityY:0,grounded:true};
    let avatarId:AvatarId="sniqr";
    let perspective:"first"|"third"="third";
    let cameraMode:"orbit"|"aim"="orbit";
    let shiftLock=false;
    let heading=0;
    const sprint:SprintState={energy:1,cooldown:0,exhausted:false};
    let staminaState="";
    const homeDirection = new THREE.Vector3().fromArray(manifest.camera.target).sub(home);
    const startYaw = Math.atan2(-homeDirection.x, -homeDirection.z);
    let yaw = startYaw;
    heading=startYaw+Math.PI;
    let pitch = 0;
    let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let suspended = false;
    let inView = true;
    let last = 0;
    let distance = 0;
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
    const avatarAmbient=new THREE.HemisphereLight("#e9dcff","#493334",2);
    const avatarKey=new THREE.DirectionalLight("#ffe3bd",2.2);
    avatarKey.position.set(-3,7,3);
    scene.add(avatarAmbient,avatarKey);
    const ray = new THREE.Raycaster();
    ray.far = 4;
    const pointerPosition = new THREE.Vector2();
    const interactive = meshes.filter(m => ["case", "radio", "cord", "notebooks"].includes(m.name) || m.name.startsWith("NT_R02_Lamp"));
    const solid = meshes.filter(m => !["realm", "island", "sky", "water"].includes(m.name));
    const ceilingHeight=(x:number,z:number)=>Math.abs(x)<1.58&&Math.abs(z)<4.3&&player.feet<2.5?(Math.abs(x)>1.24?2.35:2.61):Infinity;
    const toggleProne=()=>{
      if(player.prone&&!canStand(player,colliders,ceilingHeight(player.x,player.z)))return false;
      if(!player.prone&&!player.grounded)return false;
      player.prone=!player.prone;
      restart();
      return true;
    };
    let hover: string | null = null;
    let pointer: { id: number; x: number; y: number; lastX: number; lastY: number; dragged: boolean } | undefined;
    let pointerAt: Point | undefined;
    const updateHover = () => {
      if (suspended || document.hidden) return;
      if (pointerAt && document.pointerLockElement !== canvas) {
        const rect = canvas.getBoundingClientRect();
        pointerPosition.set((pointerAt[0]-rect.left)/rect.width*2-1, -(pointerAt[1]-rect.top)/rect.height*2+1);
      } else pointerPosition.set(0, 0);
      ray.setFromCamera(pointerPosition, camera);
      const hit = ray.intersectObjects(solid, false)[0];
      const name = hit && hit.distance < 4 && interactive.includes(hit.object as THREE.Mesh) ? hit.object.name : null;
      if (hover !== name) { hover = name; actions.hover(name); }
    };
    const realm = meshes.find(m => m.name === "realm");
    let tileLength = 1;
    const matrix = new THREE.Matrix4();
    if (realm) {
      realm.geometry.computeBoundingBox();
      const box = realm.geometry.boundingBox!;
      tileLength = box.max.z - box.min.z + 30;
    }
    const islandBounds=manifest.landmarks?.island;
    const outdoorBounds=exteriorMovementBounds(tileLength,islandBounds?(islandBounds.max[2]-islandBounds.min[2])/2:0);
    const island=meshes.find(mesh=>mesh.name==="island");
    let islandGround:{bounds:IslandBounds;lift:number}|undefined;
    if(island&&manifest.landmarks?.island) {
      const bounds=manifest.landmarks.island;
      const lift=islandGroundLift(bounds,tileLength);
      islandGround={bounds,lift};
      island.geometry.translate(0,lift,0);
      await document.fonts.load("500 30px Outfit");
      if(signal.aborted)throw new DOMException("Aborted","AbortError");
      islandSign=createIslandSign(scene,islandSignPosition(bounds,lift),tileLength);
    }
    for(const mesh of [realm,island]) {
      if(!mesh)continue;
      const instances=new THREE.InstancedMesh(mesh.geometry,mesh.material,5);
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.frustumCulled=false;
      mesh.visible=false;scene.add(instances);scenery.push(instances);
    }
    const fog = new THREE.FogExp2("#171322", .0055);
    scene.fog = fog;
    let morning=false;
    const updateSky=()=>{
      const color=morning?"#7994a6":document.documentElement.hasAttribute("data-portrait")?"#0d0906":"#171322";
      renderer.setClearColor(color);fog.color.set(color);
    };
    updateSky();
    environment=createTrainEnvironment(scene,tileLength);
    environment.patchMaterials(material=>torch.patch(material));
    const torchOccluders=[...solid,...environment.getOccluders()];
    const water=meshes.find(mesh=>mesh.name==="water");
    if(water)water.visible=false;
    const forest: { mesh: THREE.InstancedMesh; points: THREE.Vector3[]; scale: THREE.Vector3; color: THREE.Color }[] = [];
    let seed=173;
    const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    const trees=Array.from({length:64},(_,i)=>{
      const x=i%3===0?10+random()*16:-10-random()*20;
      const z=(random()-.5)*tileLength;
      return new THREE.Vector3(x,terrainSurfaceHeight(x,z,tileLength),z);
    });
    const grove=(geometry: THREE.BufferGeometry,color: string,points: THREE.Vector3[],scale: THREE.Vector3) => {
      const material=new THREE.MeshBasicMaterial({color});
      const mesh=new THREE.InstancedMesh(geometry,material,points.length*3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);
      geometries.add(geometry);materials.add(material);exteriorInstances.push(mesh);forest.push({mesh,points,scale,color:material.color.clone()});
    };
    grove(new THREE.CylinderGeometry(.13,.22,3.8,7),"#342732",trees.map(p=>p.clone().add(new THREE.Vector3(0,1.8,0))),new THREE.Vector3(1,1,1));
    grove(new THREE.ConeGeometry(1.7,5,8),"#283d3a",trees.filter((_,i)=>i%3!==0).map(p=>p.clone().add(new THREE.Vector3(0,4.1,0))),new THREE.Vector3(1,1,1));
    grove(new THREE.ConeGeometry(2.1,2.8,9),"#233831",trees.filter((_,i)=>i%3!==0).map(p=>p.clone().add(new THREE.Vector3(0,2.9,0))),new THREE.Vector3(1,1,1));
    grove(new THREE.IcosahedronGeometry(1,1),"#7d608b",trees.filter((_,i)=>i%3===0).map(p=>p.clone().add(new THREE.Vector3(0,3.3,0))),new THREE.Vector3(2.6,.75,2.1));
    grove(new THREE.ConeGeometry(.6,2.8,6).rotateZ(Math.PI),"#a17aaa",trees.filter((_,i)=>i%3===0).map(p=>p.clone().add(new THREE.Vector3(.8,2.4,.3))),new THREE.Vector3(1,1,1));
    grove(new THREE.IcosahedronGeometry(1,1),"#393443",trees.map(p=>p.clone().add(new THREE.Vector3(0,-.7,0))),new THREE.Vector3(3,1.2,3.5));
    const rotation=new THREE.Quaternion();
    const translation=new THREE.Vector3();
    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1 ? 68 : 55;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5, Math.sqrt(1_600_000/(width*height))));
      renderer.setSize(width, height, false);
    };
    const render = (now: number) => {
      frame=0;
      if (disposed || !inView || document.hidden || suspended) return;
      const delta = last ? Math.min((now-last)/1000, .1) : 0;
      last = now;
      let strafe = Number(keys.has("KeyD"))-Number(keys.has("KeyA"))+touchX;
      let forward = Number(keys.has("KeyW"))-Number(keys.has("KeyS"))+touchZ;
      const turn = Number(keys.has("ArrowRight"))-Number(keys.has("ArrowLeft"));
      yaw -= turn*delta*1.5;
      pitch = THREE.MathUtils.clamp(pitch+(Number(keys.has("ArrowUp"))-Number(keys.has("ArrowDown")))*delta, -1.15, 1.15);
      const length = Math.hypot(strafe, forward);
      if (length > 1) { strafe /= length; forward /= length; }
       const sprinting=!player.prone&&canSprint(sprint,keys.has("ControlLeft")||keys.has("ControlRight")||touchSprint,length>0);
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
       const beforeX=player.x,beforeZ=player.z;
       player.heading=shiftLock||cameraMode==="aim"||perspective==="first"?yaw+Math.PI:heading;
      stepPlayer(player,dx,dz,delta,colliders,outdoorBounds,{
        groundHeight:(x,z)=>{
          if(Math.abs(x)<1.75)return -1.1;
          const localZ=z-distance;
          const terrain=terrainSurfaceHeight(x,localZ,tileLength);
          const islandHeight=islandGround&&islandSurfaceHeight(x,localZ,islandGround.bounds,islandGround.lift,tileLength);
          return islandHeight===undefined?terrain:Math.max(terrain,islandHeight);
        },
        ceilingHeight,
        driftZ:drift,
      });
      const walked=Math.hypot(player.x-beforeX,player.z-beforeZ-(player.transportZ??0)*delta)>.0001;
      stepSprint(sprint,sprinting&&walked,delta);
      const nextStamina=`${Math.round(sprint.energy*100)}:${sprint.energy===1}:${sprinting&&walked}:${sprint.exhausted}`;
      if(nextStamina!==staminaState) {staminaState=nextStamina;actions.stamina?.(sprint.energy,sprinting&&walked,sprint.exhausted);}
       if(shiftLock||cameraMode==="aim"||perspective==="first")heading=yaw+Math.PI;
       else if(walked&&length>0) {
         const targetHeading=Math.atan2(dx,dz);
         heading+=Math.atan2(Math.sin(targetHeading-heading),Math.cos(targetHeading-heading))*Math.min(1,delta*14);
       }
       const eyeHeight=player.prone?PRONE_EYE_HEIGHT:EYE_HEIGHT;
       cameraTarget.set(player.x,eyeHeight+player.feet,player.z);
       orientation.set(pitch,yaw,0);
       camera.quaternion.setFromEuler(orientation);
       camera.position.copy(cameraTarget);
       let boom=0;
       if(perspective==="third") {
         if(shiftLock) {
           cameraRight.set(Math.cos(yaw),0,-Math.sin(yaw));
           let shoulder=cameraBoomDistance(cameraTarget,cameraRight,.32,colliders);
           cameraCollisionRay.set(cameraTarget,cameraRight);cameraCollisionRay.far=shoulder;
           const shoulderHit=cameraCollisionRay.intersectObjects(solid,false)[0];
           if(shoulderHit)shoulder=Math.max(0,shoulderHit.distance-.12);
           cameraTarget.addScaledVector(cameraRight,shoulder);
           camera.position.copy(cameraTarget);
         }
         cameraDirection.set(0,0,1).applyQuaternion(camera.quaternion);
         boom=cameraBoomDistance(cameraTarget,cameraDirection,player.prone?2.4:2.8,colliders);
         cameraCollisionRay.set(cameraTarget,cameraDirection);
         cameraCollisionRay.far=boom;
         const obstruction=cameraCollisionRay.intersectObjects(solid,false)[0];
         if(obstruction)boom=Math.min(boom,Math.max(0,obstruction.distance-.12));
         camera.position.addScaledVector(cameraDirection,boom);
       }
       const avatarVisible=perspective==="third"&&boom>.55;
       const animating=avatar.update(player,heading,walked&&length>0,sprinting,avatarVisible,delta,reducedMotion.matches);
      environment?.update(distance);
      islandSign?.update(distance);
      for(const mesh of scenery) {
        for (let i=0;i<5;i++) {
          const z = ((i*tileLength+distance+tileLength*2.5)%(tileLength*5))-tileLength*2.5;
          mesh.setMatrixAt(i,matrix.makeTranslation(0,0,z));
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
      for(const group of forest) {
        for(let copy=0;copy<3;copy++)for(let i=0;i<group.points.length;i++) {
          const point=group.points[i];
          translation.copy(point);translation.z=((point.z+copy*tileLength+distance+tileLength*4.5)%(tileLength*3))-tileLength*1.5;
          group.mesh.setMatrixAt(copy*group.points.length+i,matrix.compose(translation,rotation,group.scale));
        }
        group.mesh.instanceMatrix.needsUpdate=true;
      }
       camera.updateMatrixWorld(true);
       torch.update(camera,avatar.getHandSocket(),perspective==="first",avatarVisible,torchOccluders,[avatar.group],now,heading,perspective==="first"||shiftLock||cameraMode==="aim");
       renderer.render(scene,camera);
      updateHover();
      moving = length > 0 || keys.size > 0 || !player.grounded || sprint.energy<1;
       if (!paused || moving || animating) frame = requestAnimationFrame(render);
    };
    const restart = () => {
      if(disposed||!inView||document.hidden||suspended) {cancelAnimationFrame(frame);frame=0;last=0;return;}
      if(frame)return;
      last = 0;
      frame = requestAnimationFrame(render);
    };
    const clearInput = () => { keys.clear();touches.clear();touchOrigin=undefined;touchX=touchZ=0;touchSprint=false;pointer=undefined; };
    const jump = () => { if (!suspended) { jumpPlayer(player); restart(); } };
    const use = () => { updateHover(); if (hover) actions.activate(hover); };
    const look = (horizontal: number, vertical = 0) => { yaw -= horizontal; pitch = THREE.MathUtils.clamp(pitch-vertical,-1.15,1.15); restart(); };
    let pointerLockPending=false;
    const lockPointer = async () => {
      if(pointerLockPending||document.pointerLockElement===canvas||!canvas.requestPointerLock)return;
      pointerLockPending=true;
      canvas.focus({preventScroll:true});
      try {await canvas.requestPointerLock();}
      catch {shiftLock=false;restart();}
      finally {pointerLockPending=false;}
    };
    const setShiftLock=(value:boolean)=>{
      shiftLock=value;
      if(value&&!suspended&&matchMedia("(pointer: fine)").matches)lockPointer();
      else if(!value&&document.pointerLockElement===canvas)document.exitPointerLock();
      restart();
    };
    document.addEventListener("pointerlockchange",()=>{
      if(suspended&&document.pointerLockElement===canvas)document.exitPointerLock();
      if(document.pointerLockElement!==canvas)shiftLock=false;
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
    canvas.addEventListener("blur", clearInput, { signal: events.signal });
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
    }, { signal: events.signal });
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
      updateHover();
    }, { signal: events.signal });
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
    }, { signal: events.signal });
    canvas.addEventListener("pointercancel",clearInput,{signal:events.signal});
    canvas.addEventListener("lostpointercapture", () => { pointer = undefined; }, { signal: events.signal });
    canvas.addEventListener("pointerleave", () => {
      pointerAt = undefined;
      if (hover) { hover=null; actions.hover(null); }
    }, { signal: events.signal });
    canvas.addEventListener("keydown", event => {
      if (suspended || event.metaKey || event.altKey) return;
      const movement=["KeyW","KeyA","KeyS","KeyD","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","ControlLeft","ControlRight","Space"];
      const controls=["ShiftLeft","ShiftRight","KeyC","KeyV","KeyO","KeyM","KeyQ","KeyE","Home"];
      if(event.ctrlKey&&!movement.includes(event.code))return;
      if ([...movement,...controls].includes(event.code)) event.preventDefault();
      if (event.code === "Space" && !event.repeat) jump();
      else if (event.code === "KeyE" && !event.repeat) { pointerAt=undefined; use(); }
      else if (event.code === "Home") reset();
      else if(event.code==="KeyC"&&!event.repeat)toggleProne();
      else if((event.code==="ShiftLeft"||event.code==="ShiftRight")&&!event.repeat)setShiftLock(!shiftLock);
      else if(event.code==="KeyV"&&!event.repeat)perspective=perspective==="third"?"first":"third";
      else if(event.code==="KeyO"&&!event.repeat)cameraMode=cameraMode==="orbit"?"aim":"orbit";
      else if(event.code==="KeyM"&&!event.repeat)actions.activate("avatar");
      else if(event.code==="KeyQ"&&!event.repeat)torch.setTorch(!torch.getState().torch);
      else if(movement.includes(event.code))keys.add(event.code);
      if (event.code === "Escape") { clearInput();setShiftLock(false); }
      restart();
    }, { signal: events.signal });
    window.addEventListener("keyup", event => { keys.delete(event.code); }, { signal: events.signal });
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); if (!disposed) actions.failed(); }, { signal: events.signal });
    const reset = () => { camera.position.copy(home);Object.assign(player,{x:home.x,z:home.z,feet:0,velocityY:0,grounded:true,transportZ:0,jumps:0,prone:false});Object.assign(sprint,{energy:1,cooldown:0,exhausted:false});yaw=startYaw;heading=startYaw+Math.PI;pitch=0;clearInput();canvas.focus({preventScroll:true});restart(); };
    host.append(canvas);
    for(const material of materials)if(material instanceof THREE.MeshBasicMaterial)torch.patch(material);
    resize();
    restart();
     void avatar.select(avatarId).then(loaded=>{if(loaded)restart();});
    void torch.load().then(restart);
    return {
      dispose, jump, use, reset, look,
      getPosition(){return {x:player.x,y:player.feet+(player.prone?PRONE_EYE_HEIGHT:EYE_HEIGHT),z:player.z,grounded:player.grounded};},
      getAvatarControls(){return {avatar:avatarId,perspective,cameraMode,shiftLock,prone:!!player.prone};},
      setShiftLock,
       async setAvatar(value:AvatarId){
         const loaded=await avatar.select(value);
         if(loaded)avatarId=value;
         restart();
         return loaded;
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
        avatarAmbient.intensity=morning?2.8:2;
        avatarKey.intensity=morning?2.5:2.2;
        for (const mesh of meshes) {
          if (mesh.name.startsWith("NT_R02_Lamp")) continue;
          const material=mesh.material as THREE.MeshBasicMaterial;
          material.color.copy(baseColors.get(material)!).multiply(new THREE.Color(morning?1.8:1,morning?1.9:1,morning?2:1));
          if (mesh.name === "sky") mesh.visible=!morning;
        }
        for(const group of forest)(group.mesh.material as THREE.MeshBasicMaterial).color.copy(group.color).multiplyScalar(morning?1.6:1);
        restart();
      },
      setLamp(name: string, enabled: boolean, tint: string) {
        const lamp = meshes.find(m=>m.name===name);
        if (!lamp) return;
        const material=lamp.material as THREE.MeshBasicMaterial;
        material.color.set(enabled?tint:"#302734");
        restart();
      },
      setPaused(value: boolean) { paused=value; restart(); },
      setSuspended(value: boolean) { suspended=value; clearInput(); if(value)shiftLock=false;if (value && document.pointerLockElement===canvas) document.exitPointerLock();else if(!value&&shiftLock&&matchMedia("(pointer: fine)").matches)lockPointer();restart(); },
      move(x: number,z: number) { touchX=x; touchZ=z; restart(); },
      lockPointer,
    };
  } catch (error) { dispose(); throw error; }
}
