export interface CarriageCollider {
  min: [number,number];
  max: [number,number];
  bottom: number;
  top: number;
}

export interface PlayerState {
  x: number;
  z: number;
  feet: number;
  velocityY: number;
  grounded: boolean;
  transportZ?: number;
  jumps?: number;
  prone?: boolean;
  heading?: number;
}

export const WALK_SPEED=2.2;
export const SPRINT_SPEED=3.8;
export const EYE_HEIGHT=1.12;
export const BODY_HEIGHT=1.32;
export const PRONE_HEIGHT=.66;
export const PRONE_EYE_HEIGHT=.3;
export const CRAWL_SPEED=.85;
export const MAX_EXTERIOR_TRAVEL=48;
const RADIUS=.16;

export function trainDrift(paused:boolean,outside:boolean,exteriorTravel:number) {
  return paused||outside&&exteriorTravel>=MAX_EXTERIOR_TRAVEL?0:1.6;
}

export function exteriorMovementBounds(period:number,islandHalfDepth=0):{min:[number,number];max:[number,number]} {
  const reach=Math.max(140,Math.ceil(period/2+islandHalfDepth+MAX_EXTERIOR_TRAVEL+.32));
  return {min:[-140,-reach],max:[140,reach]};
}

export interface MovementWorld {
  groundHeight: (x:number,z:number)=>number;
  ceilingHeight: (x:number,z:number)=>number;
  driftZ: number;
}

interface CarriagePart extends CarriageCollider {
  visible:boolean;
}

export function carriageStructure():CarriagePart[] {
  const slab=(min:[number,number],max:[number,number],bottom:number,top:number,visible=true)=>({min,max,bottom,top,visible});
  return [
    slab([-1.68,-4.4],[1.68,4.4],-.15,0),
    slab([-1.74,-4.4],[-1.58,4.4],0,2.7,false),
    slab([1.58,-4.4],[1.74,4.4],0,2.7,false),
    slab([-1.68,-4.45],[1.68,-4.3],0,2.7,false),
    slab([-1.68,4.3],[-.52,4.45],0,2.7),
    slab([.52,4.3],[1.68,4.45],0,2.7),
    slab([-.52,4.3],[.52,4.45],2.25,2.7),
    slab([-1.68,-4.4],[1.68,4.4],2.7,2.78,false),
    slab([-.7,4.4],[.7,5.2],-.18,0),
    slab([-.7,5.2],[.7,5.8],-.62,-.46),
    slab([-.7,5.8],[.7,6.4],-1.08,-.92),
    slab([-.7,6.4],[.7,7],-1.54,-1.38),
  ];
}

const overlaps=(x:number,z:number,box:CarriageCollider,radius=RADIUS)=>{
  const dx=x-Math.max(box.min[0],Math.min(x,box.max[0]));
  const dz=z-Math.max(box.min[1],Math.min(z,box.max[1]));
  return dx*dx+dz*dz<radius*radius;
};

const bodyOverlaps=(state:PlayerState,x:number,z:number,box:CarriageCollider)=>{
  if(!state.prone)return overlaps(x,z,box);
  const heading=state.heading??0;
  return [-.4,0,.4].some(offset=>overlaps(x+Math.sin(heading)*offset,z+Math.cos(heading)*offset,box,.2));
};

export function jumpPlayer(state:PlayerState) {
  if(state.prone)return false;
  if(!state.grounded&&(state.jumps??1)>=2)return false;
  state.jumps=state.grounded?1:2;
  state.velocityY=state.jumps===2?5.2:4.8;
  state.grounded=false;
  return true;
}

export function canStand(state:PlayerState,colliders:CarriageCollider[],ceiling=Infinity) {
  return state.feet+BODY_HEIGHT<=ceiling+.01&&!colliders.some(box=>state.feet<box.top-.015&&state.feet+BODY_HEIGHT>box.bottom+.015&&overlaps(state.x,state.z,box));
}

export function stepPlayer(state:PlayerState,dx:number,dz:number,elapsed:number,colliders:CarriageCollider[],bounds:{min:[number,number];max:[number,number]},world?:MovementWorld) {
  const height=state.prone?PRONE_HEIGHT:BODY_HEIGHT;
  const steps=Math.max(1,Math.ceil(elapsed/(1/90)));
  const dt=elapsed/steps;
  const canMove=(x:number,z:number)=>{
    if(x<bounds.min[0]||x>bounds.max[0]||z<bounds.min[1]||z>bounds.max[1])return false;
    if(world&&world.groundHeight(x,z)>state.feet+.22)return false;
    if(state.feet+height>(world?world.ceilingHeight(x,z):Math.abs(x)>1.24?2.35:2.61)+.01)return false;
    return !colliders.some(box=>state.feet<box.top-.015&&state.feet+height>box.bottom+.015&&bodyOverlaps(state,x,z,box));
  };
  for(let step=0;step<steps;step++) {
    if(canMove(state.x+dx/steps,state.z))state.x+=dx/steps;
    const travel=dz/steps+(state.transportZ??0)*dt;
    if(canMove(state.x,state.z+travel))state.z+=travel;
    state.velocityY-=12*dt;
    const previous=state.feet;
    let next=previous+state.velocityY*dt;
    let ceiling=world?world.ceilingHeight(state.x,state.z):Math.abs(state.x)>1.24?2.35:2.61;
    for(const box of colliders)if(previous+height<=box.bottom+.015&&overlaps(state.x,state.z,box))ceiling=Math.min(ceiling,box.bottom);
    if(next+height>ceiling) {next=ceiling-height;state.velocityY=Math.min(0,state.velocityY);}
    const ground=world?.groundHeight(state.x,state.z)??0;
    let support=ground;
    if(state.velocityY<=0) {
      for(const box of colliders)if(previous>=box.top-.02&&next<=box.top&&box.top>support&&overlaps(state.x,state.z,box,.12))support=box.top;
    }
    if(state.velocityY<=0&&next<=support) {
      state.feet=support;state.velocityY=0;state.grounded=true;
      state.jumps=0;
      state.transportZ=support===ground?(world?.driftZ??0):0;
    } else {state.feet=next;state.grounded=false;}
  }
}
