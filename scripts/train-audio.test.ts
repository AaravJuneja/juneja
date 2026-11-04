import {expect,test} from "bun:test";
import {existsSync,statSync} from "node:fs";
import {SOUND_STORAGE_KEY,readSoundPreference,stepStride} from "../src/lib/trainAudio";

test("footsteps fire once per stride, faster strides when sprinting, never the same sample twice in a row",()=>{
  const state={travelled:0,last:-1};
  expect(stepStride(state,.3,false,()=>0)).toBeUndefined();
  expect(stepStride(state,.35,false,()=>0)).toBe(0);
  expect(state.travelled).toBeCloseTo(.03);
  expect(stepStride(state,.62,false,()=>0)).toBe(1);
  const sprint={travelled:0,last:-1};
  expect(stepStride(sprint,.7,true)).toBeUndefined();
  expect(stepStride(sprint,.1,true)).toBeDefined();
  expect(stepStride({travelled:0,last:-1},-5,false)).toBeUndefined();
});

test("sound defaults on, respects a stored opt-out and survives storage errors",()=>{
  expect(readSoundPreference(undefined)).toBe(true);
  expect(readSoundPreference({getItem:key=>key===SOUND_STORAGE_KEY?"off":null})).toBe(false);
  expect(readSoundPreference({getItem:()=>"on"})).toBe(true);
  expect(readSoundPreference({getItem:()=>{throw new Error("blocked");}})).toBe(true);
});

test("every train sound ships as opus webm with an mp3 fallback within budget",()=>{
  const names=["torch","key","drawer-open","drawer-close","charm","tick","equip","step-1","step-2","step-3","step-4"];
  for(const name of names)for(const ext of ["webm","mp3"]) {
    const path=new URL(`../public/train/audio/${name}.${ext}`,import.meta.url);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeLessThan(25_000);
  }
  expect(statSync(new URL("../public/train/audio/ambience.webm",import.meta.url)).size).toBeLessThan(400_000);
  expect(existsSync(new URL("../public/train/audio/ambience.mp3",import.meta.url))).toBe(true);
});
