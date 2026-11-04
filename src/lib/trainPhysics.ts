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

const PRONE_RADIUS=.2;
const PRONE_OFFSETS=[-.4,0,.4];
const PRONE_SHIFTS=[0,-.1,.1,-.2,.2,-.3,.3,-.4,.4];
type Bounds={min:[number,number];max:[number,number]};

const overlaps=(x:number,z:number,box:CarriageCollider,radius=RADIUS)=>{
  const dx=x-Math.max(box.min[0],Math.min(x,box.max[0]));
  const dz=z-Math.max(box.min[1],Math.min(z,box.max[1]));
  return dx*dx+dz*dz<radius*radius;
};

const circlePenetration=(x:number,z:number,box:CarriageCollider,radius:number)=>{
  const dx=x-Math.max(box.min[0],Math.min(x,box.max[0]));
  const dz=z-Math.max(box.min[1],Math.min(z,box.max[1]));
  const squared=dx*dx+dz*dz;
  if(squared>=radius*radius)return 0;
  if(squared>0)return radius-Math.sqrt(squared);
  return radius+Math.min(x-box.min[0],box.max[0]-x,z-box.min[1],box.max[1]-z);
};

function footprintPenetration(state:PlayerState,x:number,z:number,colliders:CarriageCollider[],height:number,heading=state.heading??0) {
  const sin=Math.sin(heading),cos=Math.cos(heading);
  let total=0;
  for(const box of colliders) {
    if(state.feet>=box.top-.015||state.feet+height<=box.bottom+.015)continue;
    if(!state.prone) {total+=circlePenetration(x,z,box,RADIUS);continue;}
    for(const offset of PRONE_OFFSETS)total+=circlePenetration(x+sin*offset,z+cos*offset,box,PRONE_RADIUS);
  }
  return total;
}

function footprintOverlaps(state:PlayerState,box:CarriageCollider,radius=RADIUS) {
  if(!state.prone)return overlaps(state.x,state.z,box,radius);
  const sin=Math.sin(state.heading??0),cos=Math.cos(state.heading??0);
  for(const offset of PRONE_OFFSETS)if(overlaps(state.x+sin*offset,state.z+cos*offset,box,PRONE_RADIUS))return true;
  return false;
}

function blocked(state:PlayerState,x:number,z:number,height:number,bounds:Bounds,world?:MovementWorld,heading=state.heading??0) {
  const sin=state.prone?Math.sin(heading):0,cos=state.prone?Math.cos(heading):0;
  const count=state.prone?PRONE_OFFSETS.length:1;
  for(let i=0;i<count;i++) {
    const offset=state.prone?PRONE_OFFSETS[i]:0,px=x+sin*offset,pz=z+cos*offset;
    if(px<bounds.min[0]||px>bounds.max[0]||pz<bounds.min[1]||pz>bounds.max[1])return true;
    if(world&&world.groundHeight(px,pz)>state.feet+.22)return true;
    if(state.feet+height>(world?world.ceilingHeight(px,pz):Math.abs(px)>1.24?2.35:2.61)+.01)return true;
  }
  return false;
}

function canMove(state:PlayerState,x:number,z:number,height:number,colliders:CarriageCollider[],bounds:Bounds,world?:MovementWorld) {
  if(blocked(state,x,z,height,bounds,world))return false;
  const penetration=footprintPenetration(state,x,z,colliders,height);
  return penetration===0||penetration<footprintPenetration(state,state.x,state.z,colliders,height)-1e-6;
}

export function lieDown(state:PlayerState,colliders:CarriageCollider[],bounds:Bounds,world?:MovementWorld) {
  if(state.prone||!state.grounded)return false;
  const heading=state.heading??0,sin=Math.sin(heading),cos=Math.cos(heading);
  const prone={...state,prone:true};
  for(const shift of PRONE_SHIFTS) {
    const x=state.x+sin*shift,z=state.z+cos*shift;
    if(blocked(prone,x,z,PRONE_HEIGHT,bounds,world)||footprintPenetration(prone,x,z,colliders,PRONE_HEIGHT,heading)>0)continue;
    state.x=x;state.z=z;state.prone=true;
    return true;
  }
  return false;
}

export function turnPlayer(state:PlayerState,heading:number,colliders:CarriageCollider[],bounds?:Bounds,world?:MovementWorld) {
  if(!state.prone) {state.heading=heading;return true;}
  const start=state.heading??0;
  const delta=Math.atan2(Math.sin(heading-start),Math.cos(heading-start));
  const steps=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/36)));
  let penetration=footprintPenetration(state,state.x,state.z,colliders,PRONE_HEIGHT,start);
  for(let i=1;i<=steps;i++) {
    const angle=start+delta*i/steps;
    if(bounds&&blocked(state,state.x,state.z,PRONE_HEIGHT,bounds,world,angle))return false;
    const next=footprintPenetration(state,state.x,state.z,colliders,PRONE_HEIGHT,angle);
    if(next>penetration+1e-6)return false;
    penetration=next;
  }
  state.heading=heading;
  return true;
}

export function jumpPlayer(state:PlayerState) {
  if(state.prone)return false;
  if(!state.grounded&&(state.jumps??1)>=2)return false;
  state.jumps=state.grounded?1:2;
  state.velocityY=state.jumps===2?10:4.8;
  state.grounded=false;
  return true;
}

export function canStand(state:PlayerState,colliders:CarriageCollider[],ceiling=Infinity) {
  return state.feet+BODY_HEIGHT<=ceiling+.01&&!colliders.some(box=>state.feet<box.top-.015&&state.feet+BODY_HEIGHT>box.bottom+.015&&overlaps(state.x,state.z,box));
}

export function stepPlayer(state:PlayerState,dx:number,dz:number,elapsed:number,colliders:CarriageCollider[],bounds:Bounds,world?:MovementWorld) {
  const height=state.prone?PRONE_HEIGHT:BODY_HEIGHT;
  const steps=Math.max(1,Math.ceil(elapsed/(1/90)));
  const dt=elapsed/steps;
  let distance=0;
  for(let step=0;step<steps;step++) {
    let movedX=0,movedZ=0;
    const inputX=dx/steps,inputZ=dz/steps;
    if(inputX&&canMove(state,state.x+inputX,state.z,height,colliders,bounds,world)) {state.x+=inputX;movedX=inputX;}
    if(inputZ&&canMove(state,state.x,state.z+inputZ,height,colliders,bounds,world)) {state.z+=inputZ;movedZ=inputZ;}
    distance+=Math.hypot(movedX,movedZ);
    const travel=(state.transportZ??0)*dt;
    if(travel&&canMove(state,state.x,state.z+travel,height,colliders,bounds,world))state.z+=travel;
    state.velocityY-=12*dt;
    const previous=state.feet;
    let next=previous+state.velocityY*dt;
    const sin=state.prone?Math.sin(state.heading??0):0,cos=state.prone?Math.cos(state.heading??0):0;
    const count=state.prone?PRONE_OFFSETS.length:1;
    let ceiling=Infinity,ground=-Infinity;
    for(let i=0;i<count;i++) {
      const offset=state.prone?PRONE_OFFSETS[i]:0,x=state.x+sin*offset,z=state.z+cos*offset;
      ceiling=Math.min(ceiling,world?world.ceilingHeight(x,z):Math.abs(x)>1.24?2.35:2.61);
      ground=Math.max(ground,world?.groundHeight(x,z)??0);
    }
    for(const box of colliders)if(previous+height<=box.bottom+.015&&footprintOverlaps(state,box))ceiling=Math.min(ceiling,box.bottom);
    if(next+height>ceiling) {next=ceiling-height;state.velocityY=Math.min(0,state.velocityY);}
    let support=ground;
    if(state.velocityY<=0) {
      for(const box of colliders)if(previous>=box.top-.02&&next<=box.top&&box.top>support&&footprintOverlaps(state,box,.12))support=box.top;
    }
    if(state.velocityY<=0&&next<=support) {
      state.feet=support;state.velocityY=0;state.grounded=true;
      state.jumps=0;
      state.transportZ=support===ground?(world?.driftZ??0):0;
    } else {state.feet=next;state.grounded=false;}
  }
  return distance;
}
