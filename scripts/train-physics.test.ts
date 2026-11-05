import { describe,expect,test } from "bun:test";
import { BODY_HEIGHT,EYE_HEIGHT,MAX_EXTERIOR_TRAVEL,SPRINT_SPEED,WALK_SPEED,carriageStructure,exteriorMovementBounds,jumpPlayer,lieDown,stepPlayer,trainDrift,turnPlayer,type CarriageCollider,type MovementWorld,type PlayerState } from "../src/lib/trainPhysics";
import { terrainHeight,terrainSurfaceHeight } from "../src/lib/trainEnvironment";
import {islandGroundLift,islandSurfaceHeight} from "../src/lib/trainLandmark";
import scene from "../public/train/scene.json";

const bounds={min:[-1.38,-4.05] as [number,number],max:[1.38,4.05] as [number,number]};
const player=():PlayerState=>({x:0,z:0,feet:0,velocityY:0,grounded:true});
const bench:CarriageCollider={min:[-.6,-1.1],max:[.6,-.7],bottom:.1,top:.5};

describe("carriage movement",()=>{
  test("walking and sprinting cover their configured distances",()=>{
    for(const speed of [WALK_SPEED,SPRINT_SPEED]) {
      const p=player();for(let i=0;i<60;i++)stepPlayer(p,0,-speed/60,1/60,[],bounds);
      expect(p.z).toBeCloseTo(-speed,4);
    }
  });
  test("benches block grounded walking",()=>{
    const p=player();for(let i=0;i<60;i++)stepPlayer(p,0,-WALK_SPEED/60,1/60,[bench],bounds);
    expect(p.z).toBeGreaterThan(-.7);
  });
  test("jumping can clear furniture and land on its top",()=>{
    const p=player();p.z=-.4;jumpPlayer(p);
    for(let i=0;i<12;i++)stepPlayer(p,0,0,1/60,[bench],bounds);
    expect(p.feet).toBeGreaterThan(bench.top);
    for(let i=0;i<15;i++)stepPlayer(p,0,-.6/15,1/60,[bench],bounds);
    for(let i=0;i<90;i++)stepPlayer(p,0,0,1/60,[bench],bounds);
    expect(p.z).toBeLessThan(-.7);expect(p.feet).toBeCloseTo(.5,4);expect(p.grounded).toBe(true);
  });
  test("walking off furniture lands on the floor",()=>{
    const p=player();p.z=-.9;p.feet=.5;
    for(let i=0;i<90;i++)stepPlayer(p,0,WALK_SPEED/60,1/60,[bench],bounds);
    expect(p.feet).toBe(0);expect(p.grounded).toBe(true);
  });
  test("the real carriage bench can be jumped onto and walked off",()=>{
    const p=player();p.x=.5;p.z=1.1;jumpPlayer(p);
    for(let i=0;i<12;i++)stepPlayer(p,0,0,1/60,scene.colliders,scene.bounds as typeof bounds);
    for(let i=0;i<15;i++)stepPlayer(p,.65/15,0,1/60,scene.colliders,scene.bounds as typeof bounds);
    for(let i=0;i<90;i++)stepPlayer(p,0,0,1/60,scene.colliders,scene.bounds as typeof bounds);
    expect(p.x).toBeCloseTo(1.15,3);expect(p.feet).toBeGreaterThan(.49);expect(p.feet).toBeLessThan(.55);
    for(let i=0;i<30;i++)stepPlayer(p,-.65/30,0,1/60,scene.colliders,scene.bounds as typeof bounds);
    for(let i=0;i<60;i++)stepPlayer(p,0,0,1/60,scene.colliders,scene.bounds as typeof bounds);
    expect(p.feet).toBe(0);
  });
  test("a double jump is allowed, a third is blocked, and ceilings stay solid",()=>{
    const p=player();expect(jumpPlayer(p)).toBe(true);expect(jumpPlayer(p)).toBe(true);
    const velocity=p.velocityY;expect(jumpPlayer(p)).toBe(false);expect(p.velocityY).toBe(velocity);
    p.feet=.8;p.velocityY=8;
    for(let i=0;i<10;i++)stepPlayer(p,0,0,1/60,[],bounds);
    expect(p.feet+BODY_HEIGHT).toBeLessThanOrEqual(2.62);
  });
  test("a timed double jump reaches higher and resets only on landing",()=>{
    const p=player();const open={groundHeight:()=>0,ceilingHeight:()=>Infinity,driftZ:0};
    jumpPlayer(p);
    for(let i=0;i<24;i++)stepPlayer(p,0,0,1/60,[],bounds,open);
    jumpPlayer(p);let peak=p.feet;
    for(let i=0;i<120;i++) {stepPlayer(p,0,0,1/60,[],bounds,open);peak=Math.max(peak,p.feet);}
    expect(peak).toBeGreaterThan(4.7);expect(peak).toBeLessThan(4.8);
    expect(p.jumps).toBe(0);expect(p.grounded).toBe(true);expect(jumpPlayer(p)).toBe(true);
  });
  test("walking off an edge grants only one air jump",()=>{
    const p=player();p.feet=1;p.grounded=false;
    expect(jumpPlayer(p)).toBe(true);expect(p.jumps).toBe(2);expect(jumpPlayer(p)).toBe(false);
  });
  test("substeps prevent sprinting through thin furniture at low frame rates",()=>{
    const p=player();p.z=-.3;
    const thin={...bench,min:[-.6,-.7] as [number,number],max:[.6,-.68] as [number,number]};
    stepPlayer(p,0,-SPRINT_SPEED*.1,.1,[thin],bounds);expect(p.z).toBeGreaterThan(-.68);
  });
  test("returned movement counts accepted input separately from transport",()=>{
    const world:MovementWorld={groundHeight:()=>0,ceilingHeight:()=>Infinity,driftZ:1};
    const room={min:[-2,-2] as [number,number],max:[2,2] as [number,number]};
    const p=player();p.transportZ=1;
    expect(stepPlayer(p,0,0,.1,[],room,world)).toBe(0);
    expect(p.z).toBeCloseTo(.1);
    const q=player();q.transportZ=1;
    expect(stepPlayer(q,0,-.1,.1,[],room,world)).toBeCloseTo(.1);
    expect(q.z).toBeCloseTo(0);
    const wall:CarriageCollider={min:[-2,.5],max:[2,.6],bottom:0,top:2};
    const r=player();r.z=.339;r.transportZ=1;
    expect(stepPlayer(r,.1,0,.1,[wall],room,world)).toBeCloseTo(.1);
    expect(r.z).toBeCloseTo(.339);
    expect(stepPlayer(r,0,.1,.1,[wall],room,world)).toBe(0);
    const s=player();
    expect(stepPlayer(s,.3,.4,.1,[],room)).toBeCloseTo(.5);
  });
  test("prone turns cannot sweep beyond movement bounds or through terrain",()=>{
    const room={min:[-2,-2] as [number,number],max:[2,2] as [number,number]};
    const p={...player(),x:1.8,prone:true,heading:0};
    expect(turnPlayer(p,Math.PI,[],room)).toBe(false);
    expect(p.heading).toBe(0);
    const q={...player(),prone:true,heading:0};
    const world:MovementWorld={groundHeight:(x)=>x>.25?1:0,ceilingHeight:()=>Infinity,driftZ:0};
    expect(turnPlayer(q,Math.PI,[],room,world)).toBe(false);
    expect(q.heading).toBe(0);
    const low:MovementWorld={groundHeight:()=>0,ceilingHeight:(x)=>x>.25?.5:Infinity,driftZ:0};
    expect(turnPlayer(q,Math.PI,[],room,low)).toBe(false);
    expect(turnPlayer(q,Math.PI/6,[],room,world)).toBe(true);
  });
  test("terrain repeats without cracks and supports the whole rail corridor",()=>{
    for(const x of [-500,-100,-20,0,20,100,500])expect(terrainHeight(x,-150,300)).toBeCloseTo(terrainHeight(x,150,300),8);
    for(const x of [-3,0,3])for(const z of [-200,0,200])expect(terrainHeight(x,z,300)).toBe(-1.9);
  });
  test("the character is shorter without making roof lamps solid",()=>{
    expect(EYE_HEIGHT).toBe(1.12);expect(BODY_HEIGHT).toBe(1.32);
    const p=player();p.z=.75;p.feet=.63;jumpPlayer(p);
    let peak=0;
    for(let i=0;i<60;i++) {stepPlayer(p,0,0,1/60,scene.colliders,scene.bounds as typeof bounds);peak=Math.max(peak,p.feet);}
    expect(peak).toBeGreaterThan(1.2);expect(peak+BODY_HEIGHT).toBeGreaterThan(2.5);
    expect(p.feet).toBeCloseTo(.63,3);
    Object.assign(p,{x:-.15,z:2.7,feet:1.24,velocityY:0,grounded:false});
    for(let i=0;i<3;i++)stepPlayer(p,.1,0,1/60,scene.colliders,scene.bounds as typeof bounds);
    expect(p.x).toBeCloseTo(.15,4);expect(p.feet+EYE_HEIGHT).toBeGreaterThan(2.3);
  });
  test("terrain collision follows rendered triangles and wraps continuously",()=>{
    for(const x of [-140,-32,0,26,140])for(const z of [-149,-40,0,88,149]) {
      expect(terrainSurfaceHeight(x,z,300)).toBeCloseTo(terrainSurfaceHeight(x,z+300,300),8);
    }
    for(let i=0;i<=100;i+=5)for(let j=0;j<=52;j+=4) {
      const x=i*11-550,z=j*300/52-150;
      expect(terrainSurfaceHeight(x,z,300)).toBeCloseTo(terrainHeight(x,z,300),5);
    }
  });
});

describe("lying flat beside walls",()=>{
  const room={min:[-2,-2] as [number,number],max:[2,2] as [number,number]};
  const wall:CarriageCollider={min:[-1,.3],max:[1,.5],bottom:0,top:2.7};
  const side:CarriageCollider={min:[.25,-2],max:[.45,2],bottom:0,top:2.7};
  const blocked=(p:PlayerState,colliders:CarriageCollider[])=>colliders.some(box=>[-.4,0,.4].some(offset=>{
    const x=p.x+Math.sin(p.heading??0)*offset,z=p.z+Math.cos(p.heading??0)*offset;
    const dx=x-Math.max(box.min[0],Math.min(x,box.max[0])),dz=z-Math.max(box.min[1],Math.min(z,box.max[1]));
    return dx*dx+dz*dz<.04;
  }));
  test("lying down facing a wall slides the body clear instead of trapping it",()=>{
    const p=player();p.heading=0;
    expect(lieDown(p,[wall],room)).toBe(true);
    expect(p.prone).toBe(true);expect(p.z).toBeLessThanOrEqual(-.3+1e-9);expect(blocked(p,[wall])).toBe(false);
    const before=p.z;
    stepPlayer(p,0,-.3,.2,[wall],room);expect(p.z).toBeLessThan(before);
    stepPlayer(p,.3,0,.2,[wall],room);expect(p.x).toBeGreaterThan(0);
  });
  test("lying down is refused when no nearby footprint fits",()=>{
    const p=player();p.heading=0;
    const closet=[wall,{...wall,min:[-1,-.5] as [number,number],max:[1,-.3] as [number,number]}];
    expect(lieDown(p,closet,room)).toBe(false);
    expect(p.prone).toBeUndefined();expect(p.z).toBe(0);
    const airborne=player();airborne.grounded=false;
    expect(lieDown(airborne,[],room)).toBe(false);
  });
  test("turning while prone cannot swing the body into a wall",()=>{
    const p=player();p.heading=0;
    expect(lieDown(p,[side],room)).toBe(true);
    expect(turnPlayer(p,Math.PI/2,[side])).toBe(false);
    expect(p.heading).toBe(0);
    expect(turnPlayer(p,Math.PI,[side])).toBe(false);
    expect(p.heading).toBe(0);
    const standing=player();standing.heading=0;
    expect(turnPlayer(standing,Math.PI/2,[side])).toBe(true);
  });
  test("prone turns use the shortest arc and check an undefined starting heading",()=>{
    const p=player();p.prone=true;
    expect(turnPlayer(p,Math.PI,[side])).toBe(false);
    expect(p.heading).toBeUndefined();
    p.heading=Math.PI-.1;
    expect(turnPlayer(p,-Math.PI+.1,[side])).toBe(true);
    expect(p.heading).toBeCloseTo(-Math.PI+.1);
  });
  test("prone footprint stays within center-based bounds and samples terrain",()=>{
    const p=player();p.x=1.8;p.heading=Math.PI/2;
    const world:MovementWorld={groundHeight:()=>0,ceilingHeight:()=>Infinity,driftZ:0};
    expect(lieDown(p,[],room,world)).toBe(true);
    expect(p.x).toBeLessThanOrEqual(1.6);
    const start=p.x;
    stepPlayer(p,.5,0,.5,[],room,world);
    expect(p.x).toBeCloseTo(start);
    const blockedGround:MovementWorld={...world,groundHeight:(x)=>x>.45?1:0};
    const q=player();q.prone=true;q.heading=Math.PI/2;
    stepPlayer(q,.1,0,.1,[],room,blockedGround);
    expect(q.x).toBeGreaterThan(0);expect(q.x).toBeLessThanOrEqual(.05);
  });
  test("prone ends collide with supports and ceilings",()=>{
    const world:MovementWorld={groundHeight:()=>0,ceilingHeight:()=>Infinity,driftZ:0};
    const support:CarriageCollider={min:[-.1,.3],max:[.1,.5],bottom:.5,top:.8};
    const p=player();Object.assign(p,{prone:true,heading:0,feet:1,velocityY:-1,grounded:false});
    for(let i=0;i<120;i++)stepPlayer(p,0,0,1/60,[support],room,world);
    expect(p.feet).toBeCloseTo(.8);expect(p.grounded).toBe(true);
    const ceiling:CarriageCollider={...support,bottom:1,top:1.2};
    const q=player();Object.assign(q,{prone:true,heading:0,velocityY:4,grounded:false});
    for(let i=0;i<10;i++)stepPlayer(q,0,0,1/60,[ceiling],room,world);
    expect(q.feet+.66).toBeLessThanOrEqual(1+1e-8);
    const r=player();r.prone=true;r.heading=0;r.velocityY=4;r.grounded=false;
    const lowCeiling:MovementWorld={...world,ceilingHeight:(_x,z)=>z>.3?1:Infinity};
    for(let i=0;i<10;i++)stepPlayer(r,0,0,1/60,[],room,lowCeiling);
    expect(r.feet+.66).toBeLessThanOrEqual(1+1e-8);
  });
  test("an overlapping prone body can crawl out but never deeper",()=>{
    const p=player();Object.assign(p,{prone:true,heading:0,z:-.05});
    expect(blocked(p,[wall])).toBe(true);
    stepPlayer(p,0,.2,.2,[wall],room);expect(p.z).toBe(-.05);
    stepPlayer(p,.3,0,.2,[wall],room);expect(p.x).toBe(0);
    stepPlayer(p,0,-.5,.5,[wall],room);
    expect(p.z).toBeLessThan(-.3);expect(blocked(p,[wall])).toBe(false);
    stepPlayer(p,.3,0,.2,[wall],room);expect(p.x).toBeGreaterThan(0);
  });
  test("lying down near the real carriage end wall still allows crawling",()=>{
    const shell=carriageStructure();
    const p=player();p.z=-4.05;p.heading=Math.PI;
    expect(lieDown(p,[...scene.colliders,...shell],scene.bounds as typeof bounds)).toBe(true);
    const start=p.z;
    for(let i=0;i<30;i++)stepPlayer(p,0,.6/30,1/60,[...scene.colliders,...shell],scene.bounds as typeof bounds);
    expect(p.z).toBeGreaterThan(start);
  });
});

describe("leaving and reboarding the train",()=>{
  const shell=carriageStructure();
  const outside={min:[-140,-140] as [number,number],max:[140,140] as [number,number]};
  const world:MovementWorld={groundHeight:(x)=>Math.abs(x)<1.75?-1.1:-1.9,ceilingHeight:(x,z)=>Math.abs(x)<1.58&&Math.abs(z)<4.3?2.61:Infinity,driftZ:0};
  const tick=(p:PlayerState,dx=0,dz=0,frames=60,context=world)=>{for(let i=0;i<frames;i++)stepPlayer(p,dx/frames,dz/frames,1/60,shell,outside,context);};
  test("the rear opening leads to a real platform and a jump down to terrain",()=>{
    const p=player();p.z=3.8;
    tick(p,0,1.2);expect(p.z).toBeCloseTo(5,3);expect(p.feet).toBe(0);
    jumpPlayer(p);tick(p,2.8,0);tick(p);
    expect(p.x).toBeCloseTo(2.8,3);expect(p.feet).toBe(-1.9);expect(p.grounded).toBe(true);
  });
  test("steps allow jumping back aboard through the same opening",()=>{
    const p=player();p.z=6.8;p.feet=-1.1;
    jumpPlayer(p);tick(p,0,-.8);expect(p.z).toBeCloseTo(6,3);expect(p.feet).toBeCloseTo(-.92,3);
    jumpPlayer(p);tick(p,0,-.5);expect(p.feet).toBeCloseTo(-.46,3);
    jumpPlayer(p);tick(p,0,-.6);expect(p.feet).toBe(0);
    tick(p,0,-1.2);expect(p.z).toBeLessThan(4);expect(p.z).toBeGreaterThan(3.5);expect(p.feet).toBe(0);
  });
  test("walls remain solid instead of allowing escape through windows",()=>{
    const p=player();tick(p,3,0);expect(p.x).toBeLessThan(1.58);
    tick(p,0,-7);expect(p.z).toBeGreaterThan(-4.3);
  });
  test("double jumping inside cannot pass through the carriage roof",()=>{
    const p=player();
    jumpPlayer(p);
    for(let i=0;i<20;i++)stepPlayer(p,0,0,1/60,shell,outside,world);
    expect(jumpPlayer(p)).toBe(true);
    let peak=p.feet;
    for(let i=0;i<90;i++) {
      stepPlayer(p,0,0,1/60,shell,outside,world);
      peak=Math.max(peak,p.feet);
    }
    expect(peak+BODY_HEIGHT).toBeLessThanOrEqual(2.61+1e-8);
    expect(p.feet).toBe(0);
  });
  test("a timed exterior double jump reaches and lands on the roof",()=>{
    for(const fps of [5,15,30,60]) {
      const p=player();p.x=2.15;p.feet=-1.9;
      const movement:MovementWorld={
        groundHeight:()=>-1.9,
        ceilingHeight:(x,z)=>Math.abs(x)<1.58&&Math.abs(z)<4.3&&p.feet<2.5?(Math.abs(x)>1.24?2.35:2.61):Infinity,
        driftZ:0,
      };
      expect(jumpPlayer(p)).toBe(true);
      for(let i=0;i<Math.round(.4*fps);i++)stepPlayer(p,0,0,1/fps,shell,outside,movement);
      expect(jumpPlayer(p)).toBe(true);expect(jumpPlayer(p)).toBe(false);
      for(let i=0;i<fps*2;i++)stepPlayer(p,p.x>1?-WALK_SPEED/fps:0,0,1/fps,shell,outside,movement);
      expect(p.x).toBeLessThan(1.58);expect(p.feet).toBeCloseTo(2.78);expect(p.grounded).toBe(true);
      expect(p.transportZ).toBe(0);
      for(let i=0;i<fps/2;i++)stepPlayer(p,-WALK_SPEED/fps,0,1/fps,shell,outside,movement);
      expect(p.feet).toBeCloseTo(2.78);expect(p.grounded).toBe(true);
      expect(jumpPlayer(p)).toBe(true);
      for(let i=0;i<fps*2;i++)stepPlayer(p,-WALK_SPEED/fps,0,1/fps,shell,outside,movement);
      expect(p.x).toBeLessThan(-1.74);expect(p.feet).toBeCloseTo(-1.9);expect(p.grounded).toBe(true);
    }
  });
  test("the rear platform allows relaxed double jump timing onto the roof",()=>{
    for(const delay of [.15,.3,.4,.55]) {
      const p=player();p.z=5.1;
      const movement:MovementWorld={...world,ceilingHeight:(x,z)=>Math.abs(x)<1.58&&Math.abs(z)<4.3&&p.feet<2.5?2.61:Infinity};
      expect(jumpPlayer(p)).toBe(true);
      for(let i=0;i<Math.round(delay*120);i++)stepPlayer(p,0,0,1/120,shell,outside,movement);
      expect(jumpPlayer(p)).toBe(true);
      for(let i=0;i<240;i++)stepPlayer(p,0,p.z>3.5?-WALK_SPEED/120:0,1/120,shell,outside,movement);
      expect(p.z).toBeLessThan(4.3);expect(p.feet).toBeCloseTo(2.78);expect(p.grounded).toBe(true);
    }
  });
  test("off-track double jumps only narrowly clear roof height near the first apex",()=>{
    for(const delay of [.1,.3,.4,.5,.7]) {
      const p=player();p.x=3;p.feet=-1.9;
      const movement:MovementWorld={groundHeight:()=>-1.9,ceilingHeight:()=>Infinity,driftZ:0};
      jumpPlayer(p);
      for(let i=0;i<Math.round(delay*120);i++)stepPlayer(p,0,0,1/120,[],outside,movement);
      jumpPlayer(p);let peak=p.feet;
      for(let i=0;i<240;i++) {stepPlayer(p,0,0,1/120,[],outside,movement);peak=Math.max(peak,p.feet);}
      expect(peak).toBeLessThan(2.88);
      if(delay>=.3&&delay<=.4)expect(peak).toBeGreaterThan(2.78);
      else expect(peak).toBeLessThan(2.78);
    }
  });
  test("outside terrain does not act as an invisible carriage floor or ceiling",()=>{
    const p=player();p.x=3;p.z=5;p.feet=3;p.grounded=false;
    tick(p);tick(p);expect(p.feet).toBe(-1.9);
    jumpPlayer(p);tick(p);expect(p.feet).toBe(-1.9);
  });
  test("terrain carries an outside passenger away as the train moves",()=>{
    const p=player();p.x=3;p.z=5;p.feet=-1.9;
    tick(p,0,0,60,{...world,driftZ:1.6});
    expect(p.z).toBeGreaterThan(6.5);expect(p.feet).toBe(-1.9);
    const passenger=player();passenger.z=3;
    tick(passenger,0,0,60,{...world,driftZ:1.6});expect(passenger.z).toBe(3);expect(passenger.feet).toBe(0);
  });
  test("outside travel stops carrying the player once the train is far away",()=>{
    expect(trainDrift(false,true,0)).toBe(1.6);
    expect(trainDrift(false,true,MAX_EXTERIOR_TRAVEL-.01)).toBe(1.6);
    expect(trainDrift(false,true,MAX_EXTERIOR_TRAVEL)).toBe(0);
    expect(trainDrift(true,true,0)).toBe(0);
    expect(trainDrift(false,false,MAX_EXTERIOR_TRAVEL)).toBe(1.6);
  });
  test("walking up the island lands on its surface and stays grounded",()=>{
    const island=scene.landmarks.island as {min:[number,number,number];max:[number,number,number]};
    const period=309.216,lift=islandGroundLift(island,period);
    const centerX=(island.min[0]+island.max[0])/2,centerZ=(island.min[2]+island.max[2])/2;
    const ground=(x:number,z:number)=>Math.max(terrainSurfaceHeight(x,z,period),islandSurfaceHeight(x,z,island,lift,period)??-Infinity);
    const p=player();p.x=centerX;p.z=centerZ+9;p.feet=ground(p.x,p.z);
    const movement:MovementWorld={groundHeight:ground,ceilingHeight:()=>Infinity,driftZ:0};
    for(let i=0;i<240;i++)stepPlayer(p,0,-WALK_SPEED/60,1/60,[],outside,movement);
    for(let i=0;i<60;i++)stepPlayer(p,0,0,1/60,[],outside,movement);
    expect(p.z).toBeCloseTo(centerZ,0);
    expect(p.feet).toBeCloseTo(island.max[1]+lift,2);
    expect(p.grounded).toBe(true);
  });
  test("jumping outside cannot cut through the platform underside",()=>{
    const p=player();p.z=4.9;p.feet=-1.9;jumpPlayer(p);
    tick(p,0,0,12,{...world,groundHeight:()=>-1.9});expect(p.feet+BODY_HEIGHT).toBeLessThanOrEqual(-.18);
  });
  test("the moving island stays reachable past the old boundary and full exterior drift",()=>{
    const island=scene.landmarks.island as {min:[number,number,number];max:[number,number,number]};
    const period=309.216,lift=islandGroundLift(island,period);
    const movementBounds=exteriorMovementBounds(period,(island.max[2]-island.min[2])/2);
    expect(movementBounds.max[1]).toBe(215);
    const centerX=(island.min[0]+island.max[0])/2,centerZ=(island.min[2]+island.max[2])/2;
    let distance=179.608,travel=0;
    const ground=(x:number,z:number)=>Math.max(terrainSurfaceHeight(x,z-distance,period),islandSurfaceHeight(x,z-distance,island,lift,period)??-Infinity);
    const p=player();p.x=centerX;p.z=138;p.feet=ground(p.x,p.z);
    for(let i=0;i<2500;i++) {
      const drift=trainDrift(false,true,travel);
      distance+=drift/60;travel=Math.min(MAX_EXTERIOR_TRAVEL,travel+drift/60);
      if(!drift||p.transportZ)p.transportZ=drift;
      const dz=i<1801?0:Math.min(WALK_SPEED/60,Math.max(0,centerZ+distance-p.z));
      stepPlayer(p,0,dz,1/60,[],movementBounds,{groundHeight:ground,ceilingHeight:()=>Infinity,driftZ:drift});
    }
    expect(travel).toBe(MAX_EXTERIOR_TRAVEL);
    expect(p.z).toBeGreaterThan(200);
    expect(p.z).toBeCloseTo(centerZ+distance,2);
    expect(p.feet).toBeCloseTo(island.max[1]+lift,2);
    expect(p.grounded).toBe(true);
  });
});
