import {expect,test} from "bun:test";
import {parseTrainManifest} from "../src/lib/trainManifest";
import scene from "../public/train/scene.json";

const clone=()=>JSON.parse(JSON.stringify(scene));

test("the published scene manifest validates and keeps every collider",()=>{
  const manifest=parseTrainManifest(clone());
  expect(manifest.colliders).toHaveLength(scene.colliders.length);
  expect(manifest.camera.position).toEqual(scene.camera.position as [number,number,number]);
  expect(manifest.landmarks?.island.min).toEqual(scene.landmarks.island.min as [number,number,number]);
});

test("malformed manifests fail before the scene uses them",()=>{
  const cases:((value:ReturnType<typeof clone>)=>void)[]=[
    value=>{value.camera.position[1]="1";},
    value=>{value.camera.target=[0,0];},
    value=>{value.camera.horizontal_fov=Number.NaN;},
    value=>{value.camera.target=[...value.camera.position];},
    value=>{value.bounds.min=[value.bounds.max[0],value.bounds.min[1]];},
    value=>{value.colliders[0].top=value.colliders[0].bottom-1;},
    value=>{value.colliders[0].min=[value.colliders[0].max[0]+1,value.colliders[0].min[1]];},
    value=>{value.colliders[0].bottom=null;},
    value=>{value.colliders="none";},
    value=>{value.landmarks.island.max[2]=value.landmarks.island.min[2];},
    value=>{value.landmarks={};},
  ];
  for(const mutate of cases) {
    const value=clone();
    mutate(value);
    expect(()=>parseTrainManifest(value)).toThrow(TypeError);
  }
  expect(()=>parseTrainManifest(null)).toThrow(TypeError);
  expect(()=>parseTrainManifest([])).toThrow(TypeError);
  const withoutLandmarks=clone();
  delete withoutLandmarks.landmarks;
  expect(parseTrainManifest(withoutLandmarks).landmarks).toBeUndefined();
});
