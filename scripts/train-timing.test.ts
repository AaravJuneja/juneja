import {describe,expect,test} from "bun:test";
import {advanceTrainTiming,dampTrainHeading,resetTrainTiming,trainWorldSpeed,TRAIN_MAX_CATCHUP,TRAIN_SIMULATION_STEP,type TrainTimingState} from "../src/lib/trainTiming";
import {trainFrameDue,type TrainGraphicsQuality} from "../src/lib/trainGraphics";
import {CRAWL_SPEED,SPRINT_SPEED,WALK_SPEED,jumpPlayer,stepPlayer,type PlayerState} from "../src/lib/trainPhysics";
import {stepSprint,type SprintState} from "../src/lib/trainSprint";

const clock=():TrainTimingState=>({lastAt:NaN,remainder:0});

describe("active train simulation timing",()=>{
  const worldSpeeds=Array.from({length:12},(_,i)=>(i+1)/4);
  test("retains fractional steps and treats timestamp zero as an initialized clock",()=>{
    const state=clock();
    expect(advanceTrainTiming(state,0)).toBe(0);
    expect(advanceTrainTiming(state,4)).toBe(0);
    expect(advanceTrainTiming(state,8)).toBe(0);
    expect(advanceTrainTiming(state,9)).toBe(1);
    expect(state.remainder).toBeCloseTo(.009-TRAIN_SIMULATION_STEP,10);
    expect(advanceTrainTiming(state,10)).toBe(0);
    expect(advanceTrainTiming(state,100)).toBe(11);
    expect(state.remainder).toBeCloseTo(0,10);
  });

  test("bounds pathological catchup without replaying discarded time in later frames",()=>{
    const state=clock();
    advanceTrainTiming(state,0);
    expect(advanceTrainTiming(state,60_000)).toBe(Math.round(TRAIN_MAX_CATCHUP/TRAIN_SIMULATION_STEP));
    expect(state.remainder).toBeLessThan(TRAIN_SIMULATION_STEP);
    expect(advanceTrainTiming(state,60_000)).toBe(0);
    expect(advanceTrainTiming(state,60_000+1000/60)).toBe(2);
    const previous={...state};
    expect(advanceTrainTiming(state,NaN)).toBe(0);
    expect(state).toEqual(previous);
    expect(advanceTrainTiming(state,10)).toBe(0);
    expect(state.remainder).toBe(0);
  });

  test("pause reset discards both the suspended interval and fractional remainder",()=>{
    const state=clock();
    advanceTrainTiming(state,0);
    advanceTrainTiming(state,4);
    resetTrainTiming(state);
    expect(state.remainder).toBe(0);
    expect(advanceTrainTiming(state,60_000)).toBe(0);
    expect(advanceTrainTiming(state,60_004)).toBe(0);
    expect(advanceTrainTiming(state,60_009)).toBe(1);
  });

  const simulate=(fps:number,quality:TrainGraphicsQuality,speed:number,stall=false,worldSpeed=1)=>{
    const timing=clock(),pacer={nextAt:NaN};
    const player:PlayerState={x:0,z:0,feet:0,velocityY:0,grounded:true};
    const sprint:SprintState={energy:1,cooldown:0,exhausted:false};
    const bounds={min:[-100,-100] as [number,number],max:[100,100] as [number,number]};
    const world={groundHeight:()=>0,ceilingHeight:()=>Infinity,driftZ:0};
    let steps=0,renders=0,animationElapsed=0,renderedAnimationElapsed=0,heading=0;
    for(let i=0;i<=fps;i++) {
      const now=i*1000/fps;
      if(stall&&now>100&&now<300)continue;
      const fresh=!Number.isFinite(timing.lastAt);
      const count=advanceTrainTiming(timing,now,worldSpeed);
      for(let step=0;step<count;step++) {
        const moved=stepPlayer(player,speed*TRAIN_SIMULATION_STEP,0,TRAIN_SIMULATION_STEP,[],bounds,world);
        stepSprint(sprint,speed===SPRINT_SPEED&&moved>0,TRAIN_SIMULATION_STEP);
        heading=dampTrainHeading(heading,Math.PI/2,TRAIN_SIMULATION_STEP);
      }
      steps+=count;
      animationElapsed+=count*TRAIN_SIMULATION_STEP;
      if(!trainFrameDue(pacer,quality,now,fresh))continue;
      renders++;
      renderedAnimationElapsed+=animationElapsed;
      animationElapsed=0;
    }
    return {position:player.x,energy:sprint.energy,steps,renders,animationElapsed:renderedAnimationElapsed+animationElapsed,heading};
  };

  test("walk, sprint and crawl retain wall-clock speed across FPS and graphics caps",()=>{
    for(const speed of [WALK_SPEED,SPRINT_SPEED,CRAWL_SPEED]) {
      const reference=simulate(60,"high",speed);
      for(const fps of [5,10,15,30,60,120,144])for(const quality of ["low","high"] as const) {
        const result=simulate(fps,quality,speed);
        expect(result.steps).toBe(120);
        expect(result.position).toBeCloseTo(speed,10);
        expect(result.energy).toBeCloseTo(reference.energy,10);
        expect(result.heading).toBeCloseTo(reference.heading,10);
        expect(result.animationElapsed).toBeCloseTo(1,10);
      }
    }
    expect(simulate(120,"low",WALK_SPEED).renders).toBeLessThan(simulate(120,"high",WALK_SPEED).renders);
  });

  test("an isolated 200 ms stall retains movement, stamina and animation time",()=>{
    const regular=simulate(60,"low",SPRINT_SPEED);
    const stalled=simulate(60,"low",SPRINT_SPEED,true);
    expect(stalled.steps).toBe(regular.steps);
    expect(stalled.position).toBeCloseTo(regular.position,10);
    expect(stalled.energy).toBeCloseTo(regular.energy,10);
    expect(stalled.animationElapsed).toBeCloseTo(regular.animationElapsed,10);
  });

  test("world speed scales all movement and stamina without changing physics steps or graphics pacing",()=>{
    for(const worldSpeed of worldSpeeds)for(const fps of [5,30,60,144])for(const quality of ["low","high"] as const) {
      for(const speed of [WALK_SPEED,SPRINT_SPEED,CRAWL_SPEED]) {
        const result=simulate(fps,quality,speed,false,worldSpeed);
        expect(result.steps).toBe(120*worldSpeed);
        expect(result.position).toBeCloseTo(speed*worldSpeed,9);
        expect(result.animationElapsed).toBeCloseTo(worldSpeed,9);
        expect(result.energy).toBeCloseTo(speed===SPRINT_SPEED?1-worldSpeed/4.5:1,9);
      }
    }
  });

  test("fractional world speeds are not rounded to slider presets",()=>{
    const timing=clock();
    let steps=0;
    for(let frame=0;frame<=300;frame++)steps+=advanceTrainTiming(timing,frame*1000/60,.83);
    expect(steps).toBe(498);
    expect(timing.remainder).toBeCloseTo(0,10);
  });

  test("world speed is bounded and long frames remain bounded at maximum speed",()=>{
    expect(trainWorldSpeed(NaN)).toBe(1);expect(trainWorldSpeed(Infinity)).toBe(1);
    expect(trainWorldSpeed(-1)).toBe(.25);expect(trainWorldSpeed(100)).toBe(3);
    const state=clock();advanceTrainTiming(state,0,3);
    expect(advanceTrainTiming(state,60_000,3)).toBe(90);
    expect(advanceTrainTiming(state,60_000,3)).toBe(0);
  });

  test("faster worlds preserve jump height and collision accuracy while scaling train travel",()=>{
    let referencePeak=0;
    for(const worldSpeed of worldSpeeds) {
      const timing=clock(),player:PlayerState={x:0,z:0,feet:0,velocityY:0,grounded:true};
      const bounds={min:[-10,-10] as [number,number],max:[10,10] as [number,number]};
      const world={groundHeight:()=>0,ceilingHeight:()=>Infinity,driftZ:0};
      let peak=0,travel=0;
      jumpPlayer(player);
      for(let i=0;i<=120;i++) {
        const steps=advanceTrainTiming(timing,i*1000/60,worldSpeed);
        for(let step=0;step<steps;step++) {
          stepPlayer(player,0,0,TRAIN_SIMULATION_STEP,[],bounds,world);
          peak=Math.max(peak,player.feet);travel+=1.6*TRAIN_SIMULATION_STEP;
        }
      }
      if(!referencePeak)referencePeak=peak;
      expect(peak).toBeCloseTo(referencePeak,10);
      expect(travel).toBeCloseTo(3.2*worldSpeed,10);
    }
  });
});

describe("train heading damping",()=>{
  test("matches equal elapsed time across frame rates and preserves the previous 60 FPS response",()=>{
    const start=.2,target=1.4;
    for(const fps of [10,15,30,60,120]) {
      let heading=start;
      for(let i=0;i<fps;i++)heading=dampTrainHeading(heading,target,1/fps);
      expect(heading).toBeCloseTo(dampTrainHeading(start,target,1),12);
    }
    expect(dampTrainHeading(start,target,1/60)).toBeCloseTo(start+(target-start)*14/60,12);
    expect(dampTrainHeading(start,target,0)).toBe(start);
    expect(dampTrainHeading(start,target,-1)).toBe(start);
  });

  test("takes the shortest turn across the angle wrap",()=>{
    const heading=dampTrainHeading(Math.PI-.1,-Math.PI+.1,.1);
    expect(heading).toBeGreaterThan(Math.PI-.1);
    expect(heading).toBeLessThan(Math.PI+.1);
  });
});
