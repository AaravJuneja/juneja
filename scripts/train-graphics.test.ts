import {expect,test} from "bun:test";
import {stepAdaptiveGraphics,trainFrameBudget,trainFrameDue,trainGraphicsProfile,trainPowerPreference} from "../src/lib/trainGraphics";

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

test("low graphics reduces resolution only after sustained slow work and recovers gradually",()=>{
  const state={scale:1,slowFrames:0,fastFrames:0};
  for(let i=0;i<8;i++)expect(stepAdaptiveGraphics(state,45)).toBe(state);
  expect(state.scale).toBe(.9);
  for(let i=0;i<120;i++)stepAdaptiveGraphics(state,33.3);
  expect(state.scale).toBe(.9);
  for(let i=0;i<120;i++)stepAdaptiveGraphics(state,12);
  expect(state.scale).toBe(.95);
  for(let i=0;i<8;i++)stepAdaptiveGraphics(state,45);
  expect(state.scale).toBe(.85);
  state.scale=.61;
  for(let i=0;i<100;i++)stepAdaptiveGraphics(state,45);
  expect(state.scale).toBe(.6);
  stepAdaptiveGraphics(state,45);
  for(let i=0;i<7;i++)stepAdaptiveGraphics(state,8);
  expect(state.slowFrames).toBe(0);
});

test("frame caps keep their target rate on common refresh rates despite vsync jitter",()=>{
  const rate=(quality:"low"|"high",hz:number,jitter=0)=>{
    const pacer={nextAt:NaN};
    let rendered=0;
    for(let i=1;i<=hz*10;i++) {
      const now=i*1000/hz+(i%2?jitter:-jitter);
      if(trainFrameDue(pacer,quality,now))rendered++;
    }
    return rendered/10;
  };
  for(const hz of [60,75,90,120,144,165,240]) {
    expect(Math.abs(rate("low",hz)-30)).toBeLessThanOrEqual(1);
    expect(Math.abs(rate("high",hz)-60)).toBeLessThanOrEqual(1);
    expect(Math.abs(rate("low",hz,.4)-30)).toBeLessThanOrEqual(1);
    expect(Math.abs(rate("high",hz,.4)-60)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(rate("low",59.94)-30)).toBeLessThanOrEqual(1);
  expect(rate("high",30)).toBe(30);
  const pacer={nextAt:500};
  expect(trainFrameDue(pacer,"low",0,true)).toBe(true);
  expect(pacer.nextAt).toBeCloseTo(1000/30);
  expect(trainFrameDue(pacer,"high",5000)).toBe(true);
  expect(pacer.nextAt).toBeCloseTo(5000+1000/60);
  expect(trainFrameBudget("high")).toBeCloseTo(1000/60,6);
});

test("high graphics asks for the discrete GPU and low graphics for the integrated one",()=>{
  expect(trainPowerPreference("high")).toBe("high-performance");
  expect(trainPowerPreference("low")).toBe("low-power");
});
