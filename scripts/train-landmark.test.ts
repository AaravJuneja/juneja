import {expect,test} from "bun:test";
import {ISLAND_FLAG,ISLAND_SIGN_SIZE,islandGroundLift,islandSignPosition,islandSurfaceHeight} from "../src/lib/trainLandmark";
import scene from "../public/train/scene.json";

test("the hidden flag sits on a small plaque centered on the island top",()=>{
  const bounds=scene.landmarks.island;
  const position=islandSignPosition(bounds as {min:[number,number,number];max:[number,number,number]},5);
  expect(ISLAND_FLAG).toBe("encryptid{y0u_g0t_1t}");
  expect(ISLAND_SIGN_SIZE[0]).toBeLessThan(2);
  expect(ISLAND_SIGN_SIZE[1]).toBeLessThan(.5);
  expect(position[0]).toBeCloseTo((bounds.min[0]+bounds.max[0])/2,6);
  expect(position[1]).toBeCloseTo(bounds.max[1]+5+.035,6);
  expect(position[2]).toBeCloseTo((bounds.min[2]+bounds.max[2])/2,6);
});

test("the island settles below terrain across its full footprint",()=>{
  const bounds=scene.landmarks.island as {min:[number,number,number];max:[number,number,number]};
  const lift=islandGroundLift(bounds,309.216);
  expect(bounds.min[1]+lift).toBeLessThan(-3.9);
});

test("the island has a continuous walkable top and no support outside its rock",()=>{
  const bounds=scene.landmarks.island as {min:[number,number,number];max:[number,number,number]};
  const period=309.216,lift=islandGroundLift(bounds,period);
  const centerX=(bounds.min[0]+bounds.max[0])/2,centerZ=(bounds.min[2]+bounds.max[2])/2;
  expect(islandSurfaceHeight(centerX,centerZ,bounds,lift,period)).toBeCloseTo(bounds.max[1]+lift,6);
  expect(islandSurfaceHeight(bounds.max[0]+1,centerZ,bounds,lift,period)).toBeUndefined();
  expect(islandSurfaceHeight(centerX,centerZ+period,bounds,lift,period)).toBeCloseTo(bounds.max[1]+lift,6);
});
