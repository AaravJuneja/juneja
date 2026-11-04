import {describe,expect,test} from "bun:test";
import * as THREE from "three";
import {createTrainEnvironment} from "../src/lib/trainEnvironment";

describe("train environment lighting",()=>{
  test("exposes every unique material and all exterior occluders",()=>{
    const scene=new THREE.Scene();
    const environment=createTrainEnvironment(scene,300);
    try {
      const sceneMaterials=new Set<THREE.Material>();
      scene.traverse(object=>{
        if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])sceneMaterials.add(material);
      });
      const patched:THREE.MeshBasicMaterial[]=[];
      environment.patchMaterials(material=>patched.push(material));
      expect(patched).toHaveLength(sceneMaterials.size);
      expect(new Set(patched).size).toBe(sceneMaterials.size);
      for(const material of sceneMaterials)expect(patched).toContain(material);

      const occluders=environment.getOccluders();
      expect(occluders).toHaveLength(5);
      expect(occluders).toEqual(expect.arrayContaining(scene.children));
      const instanced=occluders.filter((object):object is THREE.InstancedMesh=>object instanceof THREE.InstancedMesh);
      expect(instanced).toHaveLength(2);
      expect(instanced.every(mesh=>mesh.count===5&&!mesh.matrixAutoUpdate)).toBe(true);
      expect(instanced.some(mesh=>mesh.geometry instanceof THREE.PlaneGeometry)).toBe(true);
      const ties=instanced.find(mesh=>mesh.geometry.name==="ties")!;
      expect(ties.geometry.index!.count).toBe(Math.ceil(300/.85)*36);
      const solids=occluders.filter((object):object is THREE.Mesh=>object instanceof THREE.Mesh&&!(object instanceof THREE.InstancedMesh));
      expect(solids).toHaveLength(3);
      expect(solids.filter(mesh=>mesh.geometry instanceof THREE.BoxGeometry&&mesh.geometry.parameters.width===3.5)).toHaveLength(1);
      expect(solids.filter(mesh=>mesh.geometry instanceof THREE.BoxGeometry&&mesh.geometry.parameters.width===.095)).toHaveLength(2);
    } finally {
      environment.dispose();
    }
  });

  test("scrolling moves each tiled layer once without rewriting instance matrices",()=>{
    const scene=new THREE.Scene();
    const environment=createTrainEnvironment(scene,300);
    try {
      const instanced=environment.getOccluders().filter((object):object is THREE.InstancedMesh=>object instanceof THREE.InstancedMesh);
      const versions=instanced.map(mesh=>mesh.instanceMatrix.version);
      const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
      for(const [distance,expected] of [[0,0],[100,100],[200,-100],[299,-1],[450,-150]] as const) {
        environment.update(distance);
        for(const mesh of instanced) {
          expect(mesh.position.z).toBeCloseTo(expected,6);
          expect(mesh.matrix.elements[14]).toBeCloseTo(expected,6);
          const copies=Array.from({length:5},(_,i)=>{mesh.getMatrixAt(i,matrix);return position.setFromMatrixPosition(matrix).z+expected;}).sort((a,b)=>a-b);
          expect(copies[0]).toBeGreaterThanOrEqual(-750);expect(copies[4]).toBeLessThan(750);
          for(let i=1;i<5;i++)expect(copies[i]-copies[i-1]).toBeCloseTo(300,6);
        }
      }
      expect(instanced.map(mesh=>mesh.instanceMatrix.version)).toEqual(versions);
    } finally {
      environment.dispose();
    }
  });
});
