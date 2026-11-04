import {describe,expect,test} from "bun:test";
import {canSprint,stepSprint,type SprintState} from "../src/lib/trainSprint";

const fresh=():SprintState=>({energy:1,cooldown:0,exhausted:false});

describe("sprint stamina",()=>{
  test("holding sprint while idle does not drain stamina",()=>{
    const state=fresh();
    for(let i=0;i<600;i++)stepSprint(state,canSprint(state,true,false),1/60);
    expect(state.energy).toBe(1);expect(state.exhausted).toBe(false);
  });
  test("a full bar supports 4.5 seconds of sprinting",()=>{
    for(const fps of [30,60,90,120,144]) {
      const state=fresh();
      for(let i=0;i<4.5*fps;i++)stepSprint(state,canSprint(state,true,true),1/fps);
      expect(state.energy).toBe(0);
      expect(state.exhausted).toBe(true);expect(canSprint(state,true,true)).toBe(false);
    }
  });
  test("stamina recovers after a delay instead of instantly on release",()=>{
    const state=fresh();stepSprint(state,true,2.25);expect(state.energy).toBeCloseTo(.5,6);
    stepSprint(state,false,.4);expect(state.energy).toBeCloseTo(.5,6);
    stepSprint(state,false,.4);expect(state.energy).toBeCloseTo(.5,6);
    stepSprint(state,false,1.75);expect(state.energy).toBe(1);
  });
  test("exhaustion prevents tiny repeated sprints until enough stamina returns",()=>{
    const state=fresh();stepSprint(state,true,5);
    stepSprint(state,false,.8+.7);expect(state.energy).toBeCloseTo(.2,6);
    expect(canSprint(state,true,true)).toBe(false);
    stepSprint(state,false,.36);expect(canSprint(state,true,true)).toBe(true);
  });
  test("stamina stays bounded across long frames and repeated cycles",()=>{
    const state=fresh();
    for(let i=0;i<100;i++) {
      stepSprint(state,true,10);expect(state.energy).toBe(0);
      stepSprint(state,false,10);expect(state.energy).toBe(1);
    }
  });
});
