import {afterEach,describe,expect,test} from "bun:test";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {avatarClip,createTrainAvatar} from "../src/lib/trainAvatar";
import {BODY_HEIGHT,canStand,PRONE_HEIGHT,stepPlayer,type CarriageCollider,type PlayerState} from "../src/lib/trainPhysics";

const originalFetch=globalThis.fetch;
const gltf=()=>new Response(JSON.stringify({asset:{version:"2.0"},scene:0,scenes:[{nodes:[]}],nodes:[]}));
const player=():PlayerState=>({x:0,z:0,feet:0,velocityY:0,grounded:true});

afterEach(()=>{globalThis.fetch=originalFetch;});

describe("avatar animation state",()=>{
  test("maps grounded movement, airborne velocity, and prone movement to clips",()=>{
    const state=player();
    expect(avatarClip(state,false,false)).toBe("Idle");
    expect(avatarClip(state,true,false)).toBe("Walk");
    expect(avatarClip(state,true,true)).toBe("Run");
    state.grounded=false;state.velocityY=1;
    expect(avatarClip(state,false,false)).toBe("Jump");
    state.velocityY=0;
    expect(avatarClip(state,false,false)).toBe("Fall");
    state.prone=true;
    expect(avatarClip(state,false,false)).toBe("Prone");
    expect(avatarClip(state,true,true)).toBe("Crawl");
  });

  test("prone height clears a low obstruction that standing height cannot clear",()=>{
    const obstruction:CarriageCollider={min:[-.5,-.5],max:[.5,.5],bottom:.74,top:.85};
    const state=player();state.prone=true;
    expect(PRONE_HEIGHT).toBeLessThan(BODY_HEIGHT);
    expect(canStand(state,[obstruction])).toBe(false);
    expect(canStand(state,[],1.32)).toBe(true);
    expect(canStand(state,[],1.3)).toBe(false);
    state.z=-1;
    stepPlayer(state,0,2,1,[obstruction],{min:[-2,-2],max:[2,2]});
    expect(state.z).toBeGreaterThan(.5);
    const standing=player();standing.z=-1;
    stepPlayer(standing,0,2,1,[obstruction],{min:[-2,-2],max:[2,2]});
    expect(standing.z).toBeLessThan(-.5);
  });
  test("prone clearance includes the rendered male headwear",()=>{
    const state=player();state.prone=true;state.z=-1;
    const obstruction:CarriageCollider={min:[-.5,-.5],max:[.5,.5],bottom:.6,top:.72};
    stepPlayer(state,0,2,1,[obstruction],{min:[-2,-2],max:[2,2]});
    expect(state.z).toBeLessThan(-.5);
  });
  test("crawl collision accounts for the body length toward a wall",()=>{
    const state=player();state.prone=true;state.heading=0;state.z=-1;
    const wall:CarriageCollider={min:[-.5,0],max:[.5,.2],bottom:0,top:2};
    stepPlayer(state,0,1,1,[wall],{min:[-2,-2],max:[2,2]});
    expect(state.z).toBeLessThanOrEqual(-.59);
  });
});

describe("avatar loading lifecycle",()=>{
  test("loads the single character from static assets",async()=>{
    const urls:string[]=[];
    globalThis.fetch=async(input)=>{urls.push(String(input));return gltf();};
    const scene=new THREE.Scene(),controller=new AbortController(),messages:string[]=[];
    const avatar=createTrainAvatar(scene,controller.signal,message=>messages.push(message));
    await avatar.load();
    expect(urls).toEqual(["/train/avatars/sniqr.glb.gz"]);
    expect(avatar.group.children).toHaveLength(1);
    expect(avatar.getHandSocket()).toBeUndefined();
    expect(avatar.update(player(),0,false,false,true,1/60)).toBe(false);
    expect(messages).toEqual(["Loading avatar…",""]);
    avatar.dispose();avatar.dispose();
    expect(scene.children).not.toContain(avatar.group);
  });

  test("loads the same character at either graphics quality",async()=>{
    const urls:string[]=[];
    globalThis.fetch=async(input)=>{urls.push(String(input));return gltf();};
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    await avatar.load("low");
    await avatar.load("high");
    expect(urls).toEqual(["/train/avatars/sniqr-low.glb.gz","/train/avatars/sniqr.glb.gz"]);
    avatar.dispose();
  });

  test("reports failed downloads and allows retry",async()=>{
    const urls:string[]=[];let attempts=0;
    globalThis.fetch=async(input)=>{
      urls.push(String(input));attempts++;
      return attempts===1?new Response("",{status:503}):gltf();
    };
    const scene=new THREE.Scene(),controller=new AbortController(),messages:string[]=[];
    const avatar=createTrainAvatar(scene,controller.signal,message=>messages.push(message));
    expect(await avatar.load()).toBe(false);
    expect(messages.at(-1)).toContain("Avatar download failed");
    expect(messages.at(-1)).toContain("Reload the page to try again");
    expect(avatar.group.children).toHaveLength(0);
    expect(await avatar.load()).toBe(true);
    expect(urls).toEqual(["/train/avatars/sniqr.glb.gz","/train/avatars/sniqr.glb.gz"]);
    expect(avatar.group.children).toHaveLength(1);
    expect(messages.at(-1)).toBe("");
    avatar.dispose();
  });

  test("a failed replacement preserves the loaded model identity",async()=>{
    let attempts=0;
    globalThis.fetch=async()=>++attempts===1?gltf():new Response("",{status:503});
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    expect(await avatar.load("low")).toBe(true);
    const displayed=avatar.group.children[0];
    expect(await avatar.load("high")).toBe(false);
    expect(avatar.group.children).toEqual([displayed]);
    avatar.dispose();
  });

  test("a late response from a prior quality request cannot replace the latest model",async()=>{
    const pending=new Map<string,(response:Response)=>void>();
    globalThis.fetch=(input)=>new Promise(resolve=>pending.set(String(input),resolve));
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    const first=avatar.load("low");
    const second=avatar.load("high");
    pending.get("/train/avatars/sniqr.glb.gz")!(gltf());
    await second;
    const selectedModel=avatar.group.children[0];
    pending.get("/train/avatars/sniqr-low.glb.gz")!(gltf());
    await first;
    expect(avatar.group.children).toHaveLength(1);
    expect(avatar.group.children[0]).toBe(selectedModel);
    avatar.dispose();
  });

  test("disposing before a response resolves prevents a stale model from attaching",async()=>{
    let resolveFetch:((response:Response)=>void)|undefined;
    globalThis.fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    const loading=avatar.load();
    avatar.dispose();
    resolveFetch!(gltf());
    await loading;
    expect(scene.children).not.toContain(avatar.group);
    expect(avatar.group.children).toHaveLength(0);
  });

  test("quality changes while parsing release the stale model instead of attaching it",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    const originalDescriptor=Object.getOwnPropertyDescriptor(globalThis,"ImageBitmap");
    let closes=0;
    class FakeBitmap {close(){closes++;}}
    Object.defineProperty(globalThis,"ImageBitmap",{configurable:true,value:FakeBitmap});
    const disposed=new Set<string>();
    const staleGeometry=new THREE.BoxGeometry(),staleTexture=new THREE.Texture(),staleMaterial=new THREE.MeshBasicMaterial({map:staleTexture});
    staleTexture.source.data=new FakeBitmap() as unknown as ImageBitmap;
    staleGeometry.addEventListener("dispose",()=>disposed.add("geometry"));
    staleMaterial.addEventListener("dispose",()=>disposed.add("material"));
    staleTexture.addEventListener("dispose",()=>disposed.add("texture"));
    const staleScene=new THREE.Group();staleScene.add(new THREE.Mesh(staleGeometry,staleMaterial));
    let parseCount=0,markStarted=()=>{},resolveFirst:((gltf:Awaited<ReturnType<GLTFLoader["parseAsync"]>>)=>void)|undefined;
    const firstParseStarted=new Promise<void>(resolve=>{markStarted=resolve;});
    const parsed=(scene=new THREE.Group())=>({scene,animations:[]} as unknown as Awaited<ReturnType<GLTFLoader["parseAsync"]>>);
    GLTFLoader.prototype.parseAsync=async function() {
      parseCount++;
      if(parseCount===1) {
        markStarted();
        return await new Promise(resolve=>{resolveFirst=resolve;});
      }
      return parsed();
    };
    globalThis.fetch=async()=>new Response("");
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    try {
      const stale=avatar.load("low");
      await firstParseStarted;
      const latest=avatar.load("high");
      await latest;
      const selectedModel=avatar.group.children[0];
      resolveFirst!(parsed(staleScene));
      expect(await stale).toBe(false);
      expect(avatar.group.children).toHaveLength(1);
      expect(avatar.group.children[0]).toBe(selectedModel);
      expect([...disposed].sort()).toEqual(["geometry","material","texture"]);
      expect(closes).toBe(1);
      expect(staleScene.parent).toBeNull();
    } finally {
      avatar.dispose();
      GLTFLoader.prototype.parseAsync=originalParse;
      if(originalDescriptor)Object.defineProperty(globalThis,"ImageBitmap",originalDescriptor);
      else Reflect.deleteProperty(globalThis,"ImageBitmap");
    }
  });

  test("models are prepared for upload before they attach and stale preparations are released",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    GLTFLoader.prototype.parseAsync=async function() {
      const scene=new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
      return {scene,animations:[]} as unknown as Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
    };
    globalThis.fetch=async()=>new Response("");
    const prepared:THREE.Object3D[]=[];
    let finishFirst=()=>{};
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{},model=>{
      prepared.push(model);
      expect(model.parent).toBeNull();
      if(prepared.length===1)return new Promise<void>(resolve=>{finishFirst=resolve;});
    });
    try {
      const first=avatar.load("low");
      while(prepared.length<1)await new Promise(resolve=>setTimeout(resolve,0));
      const second=avatar.load("high");
      expect(await second).toBe(true);
      finishFirst();
      expect(await first).toBe(false);
      expect(prepared).toHaveLength(2);
      expect(avatar.group.children).toEqual([prepared[1]]);
      expect(prepared[0].parent).toBeNull();
    } finally {
      avatar.dispose();
      GLTFLoader.prototype.parseAsync=originalParse;
    }
  });

  test("a pre-aborted owner signal never leaves the avatar group in the scene",()=>{
    const scene=new THREE.Scene(),controller=new AbortController();controller.abort();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    expect(scene.children).not.toContain(avatar.group);
    expect(avatar.update(player(),0,false,false,true,1/60)).toBe(false);
  });

  test("crossfades stop outgoing actions after their fade, including rapid state changes",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    GLTFLoader.prototype.parseAsync=async function() {
      const scene=new THREE.Group(),hand=new THREE.Bone(),root=new THREE.Object3D();
      hand.name="HandR";root.name="root";scene.add(hand,root);
      const track=new THREE.VectorKeyframeTrack("root.position",[0,1],[0,0,0,1,0,0]);
      const animations=["Idle","Walk","Run"].map(name=>new THREE.AnimationClip(name,1,[track]));
      return {scene,animations} as Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
    };
    globalThis.fetch=async()=>new Response("");
    const originalStop=THREE.AnimationAction.prototype.stop;
    let stopped=0;
    THREE.AnimationAction.prototype.stop=function() {stopped++;return originalStop.call(this);};
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    try {
      await avatar.load();
      const state=player();
      expect(avatar.getHandSocket()?.name).toBe("HandR");
      expect(avatar.update(state,0,false,false,true,0)).toBe(true);
      expect(avatar.update(state,0,true,false,true,0)).toBe(true);
      expect(avatar.update(state,0,true,true,true,0)).toBe(true);
      expect(stopped).toBe(0);
      avatar.update(state,0,true,true,true,.17);
      expect(stopped).toBe(2);
      expect(avatar.update(state,0,false,false,true,1/60,true)).toBe(false);
      avatar.update(state,0,false,false,true,1/60);
      avatar.dispose();
    } finally {
      THREE.AnimationAction.prototype.stop=originalStop;
      GLTFLoader.prototype.parseAsync=originalParse;
      avatar.dispose();
    }
  });

  test("shared image bitmaps close once after their final model is disposed",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    const originalDescriptor=Object.getOwnPropertyDescriptor(globalThis,"ImageBitmap");
    let closes=0;
    class FakeBitmap {close(){closes++;}}
    Object.defineProperty(globalThis,"ImageBitmap",{configurable:true,value:FakeBitmap});
    const bitmap=new FakeBitmap();
    GLTFLoader.prototype.parseAsync=async function() {
      const scene=new THREE.Group(),first=new THREE.Texture(),second=new THREE.Texture();
      first.source.data=bitmap as unknown as ImageBitmap;
      second.source.data=bitmap as unknown as ImageBitmap;
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({map:first,alphaMap:second})));
      return {scene,animations:[]} as Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
    };
    globalThis.fetch=async()=>new Response("");
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    try {
      await avatar.load("low");
      await avatar.load("high");
      expect(closes).toBe(0);
      avatar.dispose();
      expect(closes).toBe(1);
    } finally {
      avatar.dispose();
      GLTFLoader.prototype.parseAsync=originalParse;
      if(originalDescriptor)Object.defineProperty(globalThis,"ImageBitmap",originalDescriptor);
      else Reflect.deleteProperty(globalThis,"ImageBitmap");
    }
  });

  test("locomotion playback follows partial movement speed without slowing idle or airborne clips",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    GLTFLoader.prototype.parseAsync=async function() {
      const scene=new THREE.Group(),root=new THREE.Object3D();
      root.name="root";scene.add(root);
      const animations=["Idle","Walk","Run","Jump","Fall","Prone","Crawl"].map(name=>new THREE.AnimationClip(name,4,[new THREE.VectorKeyframeTrack("root.position",[0,4],[0,0,0,4,0,0])]));
      return {scene,animations} as Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
    };
    globalThis.fetch=async()=>new Response("");
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    try {
      await avatar.load();
      const state=player(),root=avatar.group.getObjectByName("root")!;
      avatar.update(state,0,true,false,true,.5,false,.25);
      expect(root.position.x).toBeCloseTo(.125,6);
      avatar.update(state,0,true,false,true,.5,false,.5);
      expect(root.position.x).toBeCloseTo(.375,6);
      avatar.update(state,0,true,true,true,.5,false,.5);
      expect(root.position.x).toBeCloseTo(.25,6);
      state.prone=true;
      avatar.update(state,0,true,false,true,.5,false,.5);
      expect(root.position.x).toBeCloseTo(.25,6);
      avatar.update(state,0,false,false,true,.5,false,.1);
      expect(root.position.x).toBeCloseTo(.5,6);
      state.prone=false;
      avatar.update(state,0,false,false,true,.5,false,.1);
      expect(root.position.x).toBeCloseTo(.5,6);
      state.grounded=false;state.velocityY=1;
      avatar.update(state,0,true,false,true,.5,false,.1);
      expect(root.position.x).toBeCloseTo(.5,6);
      state.velocityY=-1;
      avatar.update(state,0,true,false,true,.5,false,.1);
      expect(root.position.x).toBeCloseTo(.5,6);
    } finally {
      avatar.dispose();
      GLTFLoader.prototype.parseAsync=originalParse;
    }
  });

  test("partial-speed locomotion advances equally across FPS and still respects reduced motion",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    GLTFLoader.prototype.parseAsync=async function() {
      const scene=new THREE.Group(),root=new THREE.Object3D();
      root.name="root";scene.add(root);
      return {scene,animations:[new THREE.AnimationClip("Walk",4,[new THREE.VectorKeyframeTrack("root.position",[0,4],[0,0,0,4,0,0])])]} as Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
    };
    globalThis.fetch=async()=>new Response("");
    try {
      for(const fps of [5,15,30,60]) {
        const scene=new THREE.Scene(),controller=new AbortController();
        const avatar=createTrainAvatar(scene,controller.signal,()=>{});
        try {
          await avatar.load();
          const state=player(),root=avatar.group.getObjectByName("root")!;
          for(let i=0;i<fps;i++)avatar.update(state,0,true,false,true,1/fps,false,.25);
          expect(root.position.x).toBeCloseTo(.25,6);
          avatar.update(state,0,true,false,true,.5,true,.25);
          expect(root.position.x).toBeCloseTo(.25,6);
          avatar.update(state,0,true,false,true,.5,false,.25);
          expect(root.position.x).toBeCloseTo(.375,6);
        } finally {avatar.dispose();}
      }
    } finally {GLTFLoader.prototype.parseAsync=originalParse;}
  });
});
