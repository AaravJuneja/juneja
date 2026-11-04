import type { CarriageCollider } from "./trainPhysics";
import type { IslandBounds } from "./trainLandmark";

type Point=[number,number];
type Vector=[number,number,number];
export interface TrainManifest {
  camera:{position:Vector;target:Vector;horizontal_fov:number};
  colliders:CarriageCollider[];
  bounds:{min:Point;max:Point};
  landmarks?:{island:IslandBounds};
}

const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const tuple=<T extends number[]>(value:unknown,length:number,path:string)=>{
  if(!Array.isArray(value)||value.length!==length||!value.every(finite))throw new TypeError(`Invalid scene manifest: ${path}`);
  return [...value] as T;
};
const ordered=(min:number[],max:number[],path:string,strict=true)=>{
  if(min.some((value,i)=>strict?value>=max[i]:value>max[i]))throw new TypeError(`Invalid scene manifest: ${path} bounds are out of order`);
};

export function parseTrainManifest(value:unknown):TrainManifest {
  if(!record(value)||!record(value.camera)||!record(value.bounds)||!Array.isArray(value.colliders))throw new TypeError("Invalid scene manifest");
  const position=tuple<Vector>(value.camera.position,3,"camera.position");
  const target=tuple<Vector>(value.camera.target,3,"camera.target");
  const fov=value.camera.horizontal_fov;
  if(!finite(fov)||fov<=0||fov>=180)throw new TypeError("Invalid scene manifest: camera.horizontal_fov");
  if(position.every((axis,i)=>axis===target[i]))throw new TypeError("Invalid scene manifest: camera target matches its position");
  const bounds={min:tuple<Point>(value.bounds.min,2,"bounds.min"),max:tuple<Point>(value.bounds.max,2,"bounds.max")};
  ordered(bounds.min,bounds.max,"bounds");
  const colliders=value.colliders.map((collider,i):CarriageCollider=>{
    if(!record(collider)||!finite(collider.bottom)||!finite(collider.top))throw new TypeError(`Invalid scene manifest: colliders[${i}]`);
    const result={min:tuple<Point>(collider.min,2,`colliders[${i}].min`),max:tuple<Point>(collider.max,2,`colliders[${i}].max`),bottom:collider.bottom,top:collider.top};
    ordered([...result.min,result.bottom],[...result.max,result.top],`colliders[${i}]`,false);
    return result;
  });
  const manifest:TrainManifest={camera:{position,target,horizontal_fov:fov},colliders,bounds};
  if(value.landmarks!==undefined) {
    if(!record(value.landmarks)||!record(value.landmarks.island))throw new TypeError("Invalid scene manifest: landmarks");
    const island={min:tuple<Vector>(value.landmarks.island.min,3,"landmarks.island.min"),max:tuple<Vector>(value.landmarks.island.max,3,"landmarks.island.max")};
    ordered(island.min,island.max,"landmarks.island");
    manifest.landmarks={island};
  }
  return manifest;
}
