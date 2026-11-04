import {expect,test} from "bun:test";
import {beamContains,beamVisible} from "../src/lib/trainBeam";

test("the flashlight beam requires range and aim rather than tagging everything ahead",()=>{
  const origin={x:0,y:1,z:0},direction={x:0,y:0,z:-1};
  expect(beamContains(origin,direction,{x:0,y:1,z:-5},8,.2)).toBe(true);
  expect(beamContains(origin,direction,{x:0,y:1,z:-9},8,.2)).toBe(false);
  expect(beamContains(origin,direction,{x:3,y:1,z:-5},8,.2)).toBe(false);
  expect(beamContains(origin,direction,{x:0,y:1,z:3},8,.2)).toBe(false);
  expect(beamContains(origin,{x:0,y:0,z:0},origin,8,.2)).toBe(false);
});

test("solid objects block a flashlight tag",()=>{
  expect(beamVisible(5,2)).toBe(false);
  expect(beamVisible(5,5)).toBe(true);
  expect(beamVisible(5,undefined)).toBe(true);
});
