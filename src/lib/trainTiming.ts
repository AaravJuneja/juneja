export const TRAIN_SIMULATION_STEP=1/120;
export const TRAIN_MAX_CATCHUP=.25;
export const TRAIN_MAX_WORLD_SPEED=3;
const MAX_STEPS=Math.round(TRAIN_MAX_CATCHUP*TRAIN_MAX_WORLD_SPEED/TRAIN_SIMULATION_STEP);
const HEADING_RATE=-60*Math.log(1-14/60);

export interface TrainTimingState {lastAt:number;remainder:number;}

export function resetTrainTiming(state:TrainTimingState) {
  state.lastAt=NaN;
  state.remainder=0;
}

export function trainWorldSpeed(value:number) {
  return Number.isFinite(value)?Math.max(.25,Math.min(TRAIN_MAX_WORLD_SPEED,value)):1;
}

export function advanceTrainTiming(state:TrainTimingState,now:number,speed=1) {
  if(!Number.isFinite(now))return 0;
  if(!Number.isFinite(state.lastAt)||now<state.lastAt) {
    state.lastAt=now;
    state.remainder=0;
    return 0;
  }
  state.remainder+=Math.min(TRAIN_MAX_CATCHUP,(now-state.lastAt)/1000)*trainWorldSpeed(speed);
  state.lastAt=now;
  const steps=Math.min(MAX_STEPS,Math.floor((state.remainder+1e-10)/TRAIN_SIMULATION_STEP));
  state.remainder=Math.max(0,state.remainder-steps*TRAIN_SIMULATION_STEP);
  return steps;
}

export function dampTrainHeading(heading:number,target:number,elapsed:number) {
  return heading+Math.atan2(Math.sin(target-heading),Math.cos(target-heading))*(-Math.expm1(-HEADING_RATE*Math.max(0,elapsed)));
}
