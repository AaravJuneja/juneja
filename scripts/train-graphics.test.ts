import {expect,test} from "bun:test";
import {stepAdaptiveGraphics,trainGraphicsProfile} from "../src/lib/trainGraphics";

test("low graphics caps render and texture resolution and skips torch shadows",()=>{
  expect(trainGraphicsProfile("low",1920,1080,2)).toEqual({
    pixelRatio:Math.sqrt(720_000/(1920*1080)),
    torchSkinSize:64,
    torchShadowSize:256,
    torchShadows:false,
  });
});

test("high graphics supersamples, keeps full textures and raises torch shadow detail",()=>{
  expect(trainGraphicsProfile("high",800,600,2)).toEqual({
    pixelRatio:2,
    torchSkinSize:256,
    torchShadowSize:768,
    torchShadows:true,
  });
  expect(trainGraphicsProfile("high",1920,1080,1).pixelRatio).toBe(1.5);
  expect(trainGraphicsProfile("high",3840,2160,1).pixelRatio).toBe(Math.sqrt(10_000_000/(3840*2160)));
});

test("low graphics reduces resolution only after sustained slow frames and recovers gradually",()=>{
  let state={scale:1,slowFrames:0,fastFrames:0};
  for(let i=0;i<8;i++)state=stepAdaptiveGraphics(state,45);
  expect(state.scale).toBe(.9);
  for(let i=0;i<120;i++)state=stepAdaptiveGraphics(state,33.3);
  expect(state.scale).toBe(.95);
  for(let i=0;i<8;i++)state=stepAdaptiveGraphics(state,45);
  expect(state.scale).toBe(.85);
  state={...state,scale:.61};
  for(let i=0;i<100;i++)state=stepAdaptiveGraphics(state,45);
  expect(state.scale).toBe(.6);
});
