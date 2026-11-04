import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {createTrainInteractionRegions,pickTrainInteraction,type InteractionRegion} from "../src/lib/trainInteraction";
import {createTrainEquipment,DRAWER_DURATION} from "../src/lib/trainEquipment";

const buffer=(name:string)=>{
  const bytes=gunzipSync(readFileSync(new URL(`../public/train/${name}.glb.gz`,import.meta.url)));
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
};
const loadCarriage=async()=>{
  const gltf=await new GLTFLoader().parseAsync(buffer("carriage"),"");
  gltf.scene.updateMatrixWorld(true);
  const meshes:THREE.Mesh[]=[];
  gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh&&!["realm","sky","water","island"].includes(object.name))meshes.push(object);});
  return meshes;
};
const pick=(origin:number[],target:number[],meshes:THREE.Object3D[],regions=createTrainInteractionRegions())=>{
  const start=new THREE.Vector3(...origin),direction=new THREE.Vector3(...target).sub(start).normalize();
  const ray=new THREE.Raycaster(start,direction,0,4);
  const hits=ray.intersectObjects(meshes,false);
  const name=pickTrainInteraction(ray.ray,hits,regions,name=>name.startsWith("equipment:")||name.startsWith("NT_R02_Lamp"),new THREE.Vector3());
  return {name,hits};
};

test("all eight windows are clickable through the actual carriage openings",async()=>{
  const meshes=await loadCarriage();
  for(const side of [-1,1])for(const z of [-3.1,-1.025,1.025,3.1]) {
    expect(pick([0,1.5,z],[side*1.625,1.5,z],meshes).name).toBe("windows");
  }
});

test("every pendant and sconce includes its baked fixture, not only its bulb",async()=>{
  const meshes=await loadCarriage();
  for(const [i,z] of [2.7,-.75,-3.35].entries()) {
    expect(pick([0,1.12,z+1],[.1,2.66,z],meshes).name).toBe(`NT_R02_Lamp_Pendant_0${i+1}`);
  }
  for(const [i,[x,z]] of [[-1.54,-.08],[1.54,-1.3],[-1.54,-3.82]].entries()) {
    expect(pick([0,1.7,z],[x,1.88,z],meshes).name).toBe(`NT_R02_Lamp_Sconce_0${i+1}`);
  }
});

test("the desk, original books, luggage racks and front door reuse small interactions",async()=>{
  const meshes=await loadCarriage();
  expect(pick([0,1.12,-2],[1,.83,-2],meshes).name).toBe("desk");
  expect(pick([0,1.3,-2.6],[1.03,1,-2.6],meshes).name).toBe("notebooks");
  for(const side of [-1,1])expect(pick([0,1.6,.5],[side*1.55,2.34,.5],meshes).name).toBe("luggage");
  expect(pick([0,1.12,-3],[0,1.12,-4.3],meshes).name).toBe("door");
});

test("picking respects solid occlusion, range and hidden objects",()=>{
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.1,2,2),new THREE.MeshBasicMaterial());
  wall.position.set(1,1,0);wall.updateMatrixWorld();
  expect(pick([0,1.5,0],[2,1.5,0],[wall]).name).toBeNull();
  expect(pick([-5,1.5,3.1],[-1.6,1.5,3.1],[]).name).toBe("windows");
  expect(pick([-6,1.5,3.1],[-1.6,1.5,3.1],[]).name).toBeNull();
  wall.name="equipment:key";wall.visible=false;
  expect(pick([0,1.5,0],[2,1.5,0],[wall]).name).toBeNull();
  expect(pick([0,1.5,1.025],[2,1.5,1.025],[wall]).name).toBe("windows");
  const parent=new THREE.Group();parent.visible=false;parent.add(wall);wall.visible=true;
  expect(pick([0,1.5,1.025],[2,1.5,1.025],[wall]).name).toBe("windows");
  wall.geometry.dispose();(wall.material as THREE.Material).dispose();
});

test("the open charm can be clicked through its center without hitting the drawer floor",async()=>{
  const scene=new THREE.Scene(),controller=new AbortController();
  const equipment=await createTrainEquipment(scene,controller.signal,async()=>buffer("equipment"));
  const meshes=await loadCarriage();
  const region:InteractionRegion={name:"equipment:charm",bounds:new THREE.Box3()};
  try {
    expect(equipment.getCharmBounds(region.bounds)).toBe(false);
    equipment.activate("equipment:key",0);equipment.activate("equipment:drawer",0);
    equipment.update(DRAWER_DURATION,undefined,[],true);
    expect(equipment.getCharmBounds(region.bounds)).toBe(true);
    const target=region.bounds.getCenter(new THREE.Vector3()).toArray();
    const hit=pick([0,1.12,-2.5],target,[...meshes,...equipment.meshes],[region]);
    expect(hit.hits[0].object.name).toBe("equipment:drawer");
    expect(hit.name).toBe("equipment:charm");
    expect(equipment.activate(hit.name!)).toBe("charm");
    expect(pick([1.1,1.12,-2],target,[...meshes,...equipment.meshes],[region]).name).toBeNull();
    equipment.activate("equipment:drawer",DRAWER_DURATION);
    expect(equipment.getCharmBounds(region.bounds)).toBe(false);
  } finally {equipment.dispose();controller.abort();}
});
