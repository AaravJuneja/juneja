import {afterEach,describe,expect,test} from "bun:test";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {avatarClip,createTrainAvatar,type AvatarId} from "../src/lib/trainAvatar";
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
  test("uses the authenticated private endpoint",async()=>{
    const urls:string[]=[];
    globalThis.fetch=async(input)=>{urls.push(String(input));return gltf();};
    const scene=new THREE.Scene(),controller=new AbortController(),messages:string[]=[];
    const avatar=createTrainAvatar(scene,controller.signal,message=>messages.push(message));
    await avatar.select("private");
    expect(urls).toEqual(["/api/train/avatar"]);
    expect(avatar.group.children).toHaveLength(1);
    expect(avatar.getHandSocket()).toBeUndefined();
    expect(avatar.update(player(),0,false,false,true,1/60)).toBe(false);
    expect(messages).toEqual(["Loading avatar…",""]);
    avatar.dispose();avatar.dispose();
    expect(scene.children).not.toContain(avatar.group);
  });

  test("keeps the male asset path and allows retry after a failed request",async()=>{
    const urls:string[]=[];let attempts=0;
    globalThis.fetch=async(input)=>{
      urls.push(String(input));attempts++;
      return attempts===1?new Response("",{status:503}):gltf();
    };
    const scene=new THREE.Scene(),controller=new AbortController(),messages:string[]=[];
    const avatar=createTrainAvatar(scene,controller.signal,message=>messages.push(message));
    await avatar.select("sniqr");
    expect(messages.at(-1)).toContain("Select an avatar to retry");
    expect(avatar.getCurrentId()).toBeUndefined();
    await avatar.select("sniqr");
    expect(urls).toEqual(["/train/avatars/sniqr.glb","/train/avatars/sniqr.glb"]);
    expect(avatar.group.children).toHaveLength(1);
    expect(avatar.getCurrentId()).toBe("sniqr");
    expect(messages.at(-1)).toBe("");
    avatar.dispose();
  });

  test("a failed replacement preserves the loaded model identity",async()=>{
    let attempts=0;
    globalThis.fetch=async()=>++attempts===1?gltf():new Response("",{status:503});
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    expect(await avatar.select("sniqr")).toBe(true);
    const displayed=avatar.group.children[0];
    expect(await avatar.select("private")).toBe(false);
    expect(avatar.getCurrentId()).toBe("sniqr");
    expect(avatar.group.children).toEqual([displayed]);
    avatar.dispose();
  });

  test("a late response from a prior selection cannot replace the latest model",async()=>{
    const pending=new Map<AvatarId,(response:Response)=>void>();
    globalThis.fetch=(input)=>new Promise(resolve=>pending.set(String(input).includes("api/train")?"private":"sniqr",resolve));
    const scene=new THREE.Scene(),controller=new AbortController();
    const avatar=createTrainAvatar(scene,controller.signal,()=>{});
    const first=avatar.select("sniqr");
    const second=avatar.select("private");
    pending.get("private")!(gltf());
    await second;
    const selectedModel=avatar.group.children[0];
    pending.get("sniqr")!(gltf());
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
    const loading=avatar.select("sniqr");
    avatar.dispose();
    resolveFetch!(gltf());
    await loading;
    expect(scene.children).not.toContain(avatar.group);
    expect(avatar.group.children).toHaveLength(0);
  });

  test("reselection while parsing releases the stale model instead of attaching it",async()=>{
    const originalParse=GLTFLoader.prototype.parseAsync;
    let parseCount=0,markStarted=()=>{},resolveFirst:((gltf:Awaited<ReturnType<GLTFLoader["parseAsync"]>>)=>void)|undefined;
    const firstParseStarted=new Promise<void>(resolve=>{markStarted=resolve;});
    const parsed=()=>({scene:new THREE.Group(),animations:[]} as Awaited<ReturnType<GLTFLoader["parseAsync"]>>);
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
      const stale=avatar.select("sniqr");
      await firstParseStarted;
      const latest=avatar.select("private");
      await latest;
      const selectedModel=avatar.group.children[0];
      resolveFirst!(parsed());
      await stale;
      expect(avatar.group.children).toHaveLength(1);
      expect(avatar.group.children[0]).toBe(selectedModel);
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
      await avatar.select("sniqr");
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
      await avatar.select("sniqr");
      await avatar.select("private");
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
});
