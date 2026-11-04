import * as THREE from "three";
import {BODY_HEIGHT,PRONE_HEIGHT,RADIUS,PRONE_RADIUS,PRONE_OFFSETS,type CarriageCollider,type PlayerState} from "./trainPhysics";
import type {InteractionRegion} from "./trainInteraction";

export function createTrainHitboxes(scene:THREE.Scene,colliders:CarriageCollider[],regions:InteractionRegion[],interactive:THREE.Mesh[]=[]) {
  const group=new THREE.Group();group.name="train-hitboxes";group.visible=false;
  const positions:number[]=[],colors:number[]=[];
  const color=new THREE.Color();
  const edges=[0,1,0,2,0,4,1,3,1,5,2,3,2,6,3,7,4,5,4,6,5,7,6,7];
  const box=(min:THREE.Vector3,max:THREE.Vector3,tint:string)=>{
    color.set(tint);
    for(const corner of edges) {
      positions.push(corner&1?max.x:min.x,corner&2?max.y:min.y,corner&4?max.z:min.z);
      colors.push(color.r,color.g,color.b);
    }
  };
  for(const collider of colliders)box(new THREE.Vector3(collider.min[0],collider.bottom,collider.min[1]),new THREE.Vector3(collider.max[0],collider.top,collider.max[1]),"#ffb347");
  for(const region of regions)if(region.name!=="equipment:charm"&&!region.bounds.isEmpty())box(region.bounds.min,region.bounds.max,"#65e6ff");
  const meshBounds=new THREE.Box3();
  for(const mesh of interactive)if(!mesh.name.startsWith("equipment:")&&!mesh.name.startsWith("NT_R02_Lamp")) {
    meshBounds.setFromObject(mesh);box(meshBounds.min,meshBounds.max,"#65e6ff");
  }
  const staticGeometry=new THREE.BufferGeometry();
  staticGeometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  staticGeometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  const staticMaterial=new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,opacity:.65});
  const outlines=new THREE.LineSegments(staticGeometry,staticMaterial);
  outlines.name="world-hitboxes";
  const playerMaterial=new THREE.LineBasicMaterial({color:"#ff81cb",depthTest:false});
  const cylinder=(radius:number)=>{
    const points:number[]=[];
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
      for(const y of [-.5,.5])points.push(Math.sin(a)*radius,y,Math.cos(a)*radius,Math.sin(b)*radius,y,Math.cos(b)*radius);
      if(i%4===0)points.push(Math.sin(a)*radius,-.5,Math.cos(a)*radius,Math.sin(a)*radius,.5,Math.cos(a)*radius);
    }
    return new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(points,3));
  };
  const standingGeometry=cylinder(RADIUS),proneGeometry=cylinder(PRONE_RADIUS);
  const standing=new THREE.LineSegments(standingGeometry,playerMaterial);
  standing.name="player-standing-hitbox";
  const prone=PRONE_OFFSETS.map(offset=>({offset,mesh:new THREE.LineSegments(proneGeometry,playerMaterial)}));
  for(const part of prone)part.mesh.name=`player-prone-hitbox:${part.offset}`;
  const equipment=["equipment:key","equipment:drawer","equipment:charm"].map(name=>{
    const bounds=new THREE.Box3(),helper=new THREE.Box3Helper(bounds,new THREE.Color("#65e6ff"));
    (helper.material as THREE.LineBasicMaterial).depthTest=false;
    helper.name=`hitbox:${name}`;
    return {name,bounds,helper};
  });
  group.add(outlines,standing,...equipment.map(part=>part.helper),...prone.map(part=>part.mesh));
  for(const object of group.children) {object.renderOrder=1000;object.frustumCulled=false;}
  scene.add(group);
  return {
    setVisible(value:boolean){group.visible=value;},
    update(player:PlayerState,region:InteractionRegion) {
      if(!group.visible)return;
      standing.visible=!player.prone;
      standing.position.set(player.x,player.feet+BODY_HEIGHT/2,player.z);standing.scale.y=BODY_HEIGHT;
      const sin=Math.sin(player.heading??0),cos=Math.cos(player.heading??0);
      for(const part of prone) {
        part.mesh.visible=!!player.prone;
        part.mesh.position.set(player.x+sin*part.offset,player.feet+PRONE_HEIGHT/2,player.z+cos*part.offset);part.mesh.scale.y=PRONE_HEIGHT;
      }
      for(const part of equipment) {
        part.helper.visible=false;
        for(const mesh of interactive)if(mesh.name===part.name) {
          part.helper.visible=mesh.visible&&(part.name!=="equipment:charm"||region.enabled===true);
          if(part.name==="equipment:charm")part.bounds.copy(region.bounds);
          else part.bounds.setFromObject(mesh);
          break;
        }
      }
    },
    dispose() {
      scene.remove(group);
      staticGeometry.dispose();standingGeometry.dispose();proneGeometry.dispose();
      staticMaterial.dispose();playerMaterial.dispose();
      for(const part of equipment) {part.helper.geometry.dispose();(part.helper.material as THREE.Material).dispose();}
    },
  };
}
