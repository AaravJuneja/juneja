export interface SprintState {
  energy:number;
  cooldown:number;
  exhausted:boolean;
}

export function canSprint(state:SprintState,requested:boolean,moving:boolean) {
  return requested&&moving&&!state.exhausted&&state.energy>0;
}

export function stepSprint(state:SprintState,sprinting:boolean,elapsed:number) {
  if(sprinting) {
    state.energy=Math.max(0,state.energy-elapsed/4.5);
    state.cooldown=.8;
    if(state.energy===0)state.exhausted=true;
  } else {
    const recovery=Math.max(0,elapsed-state.cooldown);
    state.cooldown=Math.max(0,state.cooldown-elapsed);
    state.energy=Math.min(1,state.energy+recovery/3.5);
    if(state.energy>=.3)state.exhausted=false;
  }
}
