import {expect,test} from "bun:test";
import {readFileSync,statSync} from "node:fs";
import * as THREE from "three";
import {createTrainMedia,frontMediaFrame,FRONT_FRAME_COUNT,FRONT_FRAME_MS,FRONT_MEDIA_POSITION,FRONT_MEDIA_SIZE} from "../src/lib/trainMedia";

test("the front animation keeps the source GIF timing and freezes under reduced motion",()=>{
  expect(frontMediaFrame(0,false)).toBe(0);
  expect(frontMediaFrame(FRONT_FRAME_MS,false)).toBe(1);
  expect(frontMediaFrame(FRONT_FRAME_COUNT*FRONT_FRAME_MS-1,false)).toBe(130);
  expect(frontMediaFrame(FRONT_FRAME_COUNT*FRONT_FRAME_MS,false)).toBe(0);
  expect(frontMediaFrame(1000,true)).toBe(0);
  expect(frontMediaFrame(NaN,false)).toBe(0);
  expect(frontMediaFrame(-10,false)).toBe(0);
  expect(FRONT_MEDIA_POSITION).toEqual([0,2.7/2,-4.25]);
  expect(FRONT_MEDIA_SIZE[0]/FRONT_MEDIA_SIZE[1]).toBeCloseTo(45/51);
});

test("scene media switches full-image sun and moon textures and disposes loaded resources",async()=>{
  const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap;
  let closed=0,loaded=0,resolve!:()=>void;
  const ready=new Promise<void>(done=>{resolve=done;});
  globalThis.fetch=async()=>new Response(new Uint8Array([1]));
  globalThis.createImageBitmap=async()=>({width:128,height:100,close(){closed++;}} as ImageBitmap);
  const scene=new THREE.Scene(),abort=new AbortController();
  const media=createTrainMedia(scene,abort.signal,()=>{if(++loaded===3)resolve();});
  try {
    await ready;
    const celestial=scene.getObjectByName("train-celestial") as THREE.Sprite;
    const display=scene.getObjectByName("train-front-media") as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
    const moon=celestial.material;
    expect(media.update(0,false)).toBe(true);
    expect(celestial.scale.toArray()).toEqual([12.8,10,1]);
    expect(moon.map?.repeat.toArray()).toEqual([1,1]);
    media.setDay(true);expect(celestial.material).not.toBe(moon);
    expect(celestial.material.map?.repeat.toArray()).toEqual([1,1]);
    media.setDay(false);expect(celestial.material).toBe(moon);
    media.update(130*FRONT_FRAME_MS,false);
    expect(display.material.map?.offset.toArray()).toEqual([2/16,0]);
    expect(display.material.map?.repeat.toArray()).toEqual([1/16,1/9]);
    expect(media.update(1000,true)).toBe(false);
    expect(display.material.map?.offset.toArray()).toEqual([0,8/9]);
    media.dispose();
    expect(closed).toBe(3);expect(scene.children).toHaveLength(0);
  } finally {abort.abort();globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;}
});

test("late image decodes are closed rather than reviving a disposed scene",async()=>{
  const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap;
  let closed=0,ready=0,resolve!:()=>void;
  const finished=new Promise<void>(done=>{resolve=done;});
  globalThis.fetch=async()=>new Response(new Uint8Array([1]));
  globalThis.createImageBitmap=async()=>({close(){if(++closed===3)resolve();}} as ImageBitmap);
  const scene=new THREE.Scene(),abort=new AbortController();
  try {
    const media=createTrainMedia(scene,abort.signal,()=>ready++);media.dispose();
    await finished;expect(ready).toBe(0);expect(closed).toBe(3);expect(scene.children).toHaveLength(0);
  } finally {abort.abort();globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;}
});

test("the charm surprise loads on drawer intent and has motion-safe dismissal and teardown",()=>{
  const template=readFileSync(new URL("../src/components/TrainCarriage.astro",import.meta.url),"utf8");
  expect(template).toContain('if(event==="open")prepareScare()');
  expect(template).toContain('if(event==="charm")showScare()');
  expect(template).toContain('muted playsinline preload="none"');
  expect(template).toContain('scareVideo.addEventListener("ended",()=>closeDialog(scareDialog)');
  expect(template).toContain('scareDialog.addEventListener("close",()=>{scareVideo.pause()');
  expect(template).toContain('scareVideo.removeAttribute("src")');
  expect(template).toContain('animation:charm-scare-in 180ms');
  expect(template).toContain('transform:scale(0)');expect(template).toContain('transform-origin:50% 50%');
  expect(template).toContain('animation:charm-scare-fade 120ms');
  expect(template).toContain('aria-label="Close surprise"');
  for(const asset of ["moon.webp","sun.webp","front-atlas.webp","charm-scare.webp","charm-scare.mp4"]) {
    expect(statSync(new URL(`../public/train/${asset}`,import.meta.url)).size).toBeGreaterThan(0);
    expect(statSync(new URL(`../public/train/${asset}`,import.meta.url)).size).toBeLessThan(500_000);
  }
});
