import * as THREE from "three";

export function terrainHeight(x:number,z:number,period:number) {
  const bank=Math.min(1,Math.max(0,(Math.abs(x)-4)/30));
  const phase=z/period*Math.PI*2;
  return -1.9+bank*(Math.sin(x*.035)*2.5+Math.cos(phase)*1.3+Math.sin(phase*2+x*.02)*.8);
}

export function terrainSurfaceHeight(x:number,z:number,period:number) {
  const localZ=((z+period/2)%period+period)%period-period/2;
  const gx=Math.max(0,Math.min(99.999999,(x+550)/11));
  const gz=(localZ+period/2)/period*52;
  const ix=Math.floor(gx),iz=Math.floor(gz);
  const u=gx-ix,v=gz-iz;
  const x0=ix*11-550,z0=iz*period/52-period/2;
  const a=terrainHeight(x0,z0,period),b=terrainHeight(x0+11,z0,period);
  const c=terrainHeight(x0,z0+period/52,period),d=terrainHeight(x0+11,z0+period/52,period);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

export function lowestTerrainHeight(bounds:{min:[number,number,number];max:[number,number,number]},period:number) {
  const xs=[bounds.min[0],bounds.max[0]];
  const firstX=Math.ceil((bounds.min[0]+550)/11);
  for(let i=firstX,x=i*11-550;x<bounds.max[0];i++,x=i*11-550)xs.push(x);
  const zs=[bounds.min[2],bounds.max[2]];
  const step=period/52;
  const firstZ=Math.ceil((bounds.min[2]+period/2)/step);
  for(let i=firstZ,z=i*step-period/2;z<bounds.max[2];i++,z=i*step-period/2)zs.push(z);
  let lowest=Infinity;
  for(const x of xs)for(const z of zs)lowest=Math.min(lowest,terrainSurfaceHeight(x,z,period));
  return lowest;
}

export function createTrainEnvironment(scene:THREE.Scene,period:number) {
  const geometries:THREE.BufferGeometry[]=[];
  const materials:THREE.MeshBasicMaterial[]=[];
  const instances:THREE.InstancedMesh[]=[];
  const objects:THREE.Object3D[]=[];
  const matrix=new THREE.Matrix4();
  const material=(color:string,vertexColors=false)=>{
    const mat=new THREE.MeshBasicMaterial({color,vertexColors});materials.push(mat);return mat;
  };
  const geometry=new THREE.PlaneGeometry(1100,period,100,52).rotateX(-Math.PI/2);
  const positions=geometry.getAttribute("position");
  const colors=new Float32Array(positions.count*3);
  const soil=new THREE.Color("#423d39");
  const moss=new THREE.Color("#354b42");
  const color=new THREE.Color();
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),z=positions.getZ(i);
    positions.setY(i,terrainHeight(x,z,period));
    const shade=.7+.2*Math.sin(x*.09)+.1*Math.cos(z/period*Math.PI*2);
    color.copy(soil).lerp(moss,Math.min(1,Math.abs(x)/26)).multiplyScalar(shade);
    colors.set([color.r,color.g,color.b],i*3);
  }
  geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
  geometries.push(geometry);
  const terrain=new THREE.InstancedMesh(geometry,material("#ffffff",true),5);
  terrain.frustumCulled=false;scene.add(terrain);instances.push(terrain);
  const solidBox=(size:[number,number,number],position:[number,number,number],tint:string)=>{
    const geo=new THREE.BoxGeometry(...size);geometries.push(geo);
    const mesh=new THREE.Mesh(geo,material(tint));mesh.position.set(...position);scene.add(mesh);objects.push(mesh);
  };
  solidBox([3.5,.8,period*5],[0,-1.5,0],"#494347");
  for(const x of [-.72,.72])solidBox([.095,.14,period*5],[x,-.99,0],"#77727c");
  const tiesPerTile=Math.ceil(period/.85);
  const tieSpacing=period/tiesPerTile;
  const tieGeo=new THREE.BoxGeometry(2.2,.13,.19);geometries.push(tieGeo);
  const ties=new THREE.InstancedMesh(tieGeo,material("#45302d"),tiesPerTile*5);
  ties.frustumCulled=false;scene.add(ties);instances.push(ties);
  const baseColors=materials.map(mat=>mat.color.clone());
  const update=(distance:number)=>{
    for(let copy=0;copy<5;copy++) {
      const offset=((copy*period+distance+period*2.5)%(period*5))-period*2.5;
      terrain.setMatrixAt(copy,matrix.makeTranslation(0,0,offset));
      for(let i=0;i<tiesPerTile;i++)ties.setMatrixAt(copy*tiesPerTile+i,matrix.makeTranslation(0,-1.09,(i+.5)*tieSpacing-period/2+offset));
    }
    terrain.instanceMatrix.needsUpdate=true;ties.instanceMatrix.needsUpdate=true;
  };
  update(0);
  return {
    update,
    patchMaterials(patch:(material:THREE.MeshBasicMaterial)=>void){for(const mat of new Set(materials))patch(mat);},
    getOccluders():THREE.Object3D[]{return [...instances,...objects];},
    setDay(morning:boolean){materials.forEach((mat,i)=>mat.color.copy(baseColors[i]).multiplyScalar(morning?1.65:.8));},
    dispose(){for(const mesh of instances){scene.remove(mesh);mesh.dispose();}for(const object of objects)scene.remove(object);for(const geo of geometries)geo.dispose();for(const mat of materials)mat.dispose();},
  };
}
