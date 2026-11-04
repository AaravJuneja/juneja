import {expect,test} from "bun:test";
import * as THREE from "three";
import {createTrainHitboxes} from "../src/lib/trainHitboxes";
import {BODY_HEIGHT,PRONE_HEIGHT,type PlayerState} from "../src/lib/trainPhysics";
import type {InteractionRegion} from "../src/lib/trainInteraction";

test("hitboxes show solid and clickable regions and follow standing and crawling footprints",()=>{
  const scene=new THREE.Scene();
  const region:InteractionRegion={name:"windows",bounds:new THREE.Box3(new THREE.Vector3(1,1,1),new THREE.Vector3(2,2,2))};
  const charm:InteractionRegion={name:"equipment:charm",bounds:region.bounds.clone(),enabled:true};
  const overlay=createTrainHitboxes(scene,[{min:[-1,-1],max:[1,1],bottom:0,top:1}],[region,charm]);
  const root=scene.getObjectByName("train-hitboxes")!;
  const standing=root.getObjectByName("player-standing-hitbox")!;
  const world=root.getObjectByName("world-hitboxes") as THREE.LineSegments;
  const player:PlayerState={x:3,z:4,feet:2,velocityY:0,grounded:true,heading:Math.PI/2};
  try {
    expect(root.visible).toBe(false);
    expect(world.geometry.getAttribute("position").count).toBe(48);
    overlay.setVisible(true);overlay.update(player,charm);
    expect(standing.visible).toBe(true);
    expect(standing.position.toArray()).toEqual([3,2+BODY_HEIGHT/2,4]);
    expect(standing.scale.y).toBe(BODY_HEIGHT);
    player.prone=true;overlay.update(player,charm);
    expect(standing.visible).toBe(false);
    const front=root.getObjectByName("player-prone-hitbox:0.4")!;
    expect(front.visible).toBe(true);
    expect(front.position.x).toBeCloseTo(3.4);expect(front.position.z).toBeCloseTo(4);
    expect(front.position.y).toBe(2+PRONE_HEIGHT/2);expect(front.scale.y).toBe(PRONE_HEIGHT);
    overlay.setVisible(false);player.x=7;overlay.update(player,charm);
    expect(front.position.x).toBeCloseTo(3.4);
  } finally {overlay.dispose();}
});

test("equipment outlines can load later, follow movement and disappear when unavailable",()=>{
  const scene=new THREE.Scene(),meshes:THREE.Mesh[]=[];
  const region:InteractionRegion={name:"equipment:charm",bounds:new THREE.Box3(),enabled:false};
  const overlay=createTrainHitboxes(scene,[],[],meshes);
  const root=scene.getObjectByName("train-hitboxes")!;
  const key=root.getObjectByName("hitbox:equipment:key")!;
  const charm=root.getObjectByName("hitbox:equipment:charm") as THREE.Box3Helper;
  const player:PlayerState={x:0,z:0,feet:0,velocityY:0,grounded:true};
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial());mesh.name="equipment:key";
  try {
    overlay.setVisible(true);overlay.update(player,region);expect(key.visible).toBe(false);
    meshes.push(mesh);overlay.update(player,region);expect(key.visible).toBe(true);
    mesh.visible=false;overlay.update(player,region);expect(key.visible).toBe(false);
    mesh.visible=true;mesh.name="equipment:charm";
    region.enabled=true;region.bounds.set(new THREE.Vector3(1,2,3),new THREE.Vector3(2,3,4));
    overlay.update(player,region);expect(charm.visible).toBe(true);expect(charm.box.equals(region.bounds)).toBe(true);
    region.bounds.translate(new THREE.Vector3(0,0,.18));overlay.update(player,region);
    expect(charm.box.min.z).toBeCloseTo(3.18);
    region.enabled=false;overlay.update(player,region);expect(charm.visible).toBe(false);
  } finally {overlay.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}
});

test("hitbox teardown removes the overlay and disposes every owned GPU resource once",()=>{
  const scene=new THREE.Scene(),overlay=createTrainHitboxes(scene,[],[]);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  scene.traverse(object=>{
    if(object instanceof THREE.LineSegments) {geometries.add(object.geometry);materials.add(object.material as THREE.Material);}
  });
  let disposedGeometry=0,disposedMaterial=0;
  for(const geometry of geometries)geometry.addEventListener("dispose",()=>disposedGeometry++);
  for(const material of materials)material.addEventListener("dispose",()=>disposedMaterial++);
  overlay.dispose();
  expect(scene.children).toHaveLength(0);
  expect(disposedGeometry).toBe(geometries.size);expect(disposedMaterial).toBe(materials.size);
});
