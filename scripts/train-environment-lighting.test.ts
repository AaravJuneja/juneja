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
      expect(instanced.some(mesh=>mesh.geometry instanceof THREE.PlaneGeometry)).toBe(true);
      expect(instanced.some(mesh=>mesh.geometry instanceof THREE.BoxGeometry)).toBe(true);
      const solids=occluders.filter((object):object is THREE.Mesh=>object instanceof THREE.Mesh&&!(object instanceof THREE.InstancedMesh));
      expect(solids).toHaveLength(3);
      expect(solids.filter(mesh=>mesh.geometry instanceof THREE.BoxGeometry&&mesh.geometry.parameters.width===3.5)).toHaveLength(1);
      expect(solids.filter(mesh=>mesh.geometry instanceof THREE.BoxGeometry&&mesh.geometry.parameters.width===.095)).toHaveLength(2);
    } finally {
      environment.dispose();
    }
  });
});
