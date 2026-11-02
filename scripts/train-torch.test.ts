import {describe,expect,test} from "bun:test";
import * as THREE from "three";
import {torchAimDirection} from "../src/lib/trainTorch";

describe("flashlight aiming",()=>{
  test("free orbit follows the character even when the camera faces back at them",()=>{
    const camera=new THREE.PerspectiveCamera();
    camera.position.set(0,2,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
    const direction=torchAimDirection(camera,0,false);
    expect(direction.x).toBeCloseTo(0,6);
    expect(direction.y).toBe(0);
    expect(direction.z).toBeCloseTo(1,6);
    expect(direction.dot(camera.getWorldDirection(new THREE.Vector3()))).toBeLessThan(0);
  });
  test("orbiting and tilting the camera cannot redirect a freely facing character's beam",()=>{
    const camera=new THREE.PerspectiveCamera();
    for(const yaw of [-Math.PI,-1,0,1,Math.PI]) {
      camera.rotation.set(-.8,yaw,0,"YXZ");camera.updateMatrixWorld(true);
      const direction=torchAimDirection(camera,Math.PI/2,false);
      expect(direction.x).toBeCloseTo(1,6);
      expect(direction.y).toBe(0);
      expect(direction.z).toBeCloseTo(0,6);
    }
  });
  test("first-person and locked aiming retain the camera direction and pitch",()=>{
    const camera=new THREE.PerspectiveCamera();
    camera.rotation.set(-.5,1.2,0,"YXZ");camera.updateMatrixWorld(true);
    const direction=torchAimDirection(camera,0,true);
    expect(direction.distanceTo(camera.getWorldDirection(new THREE.Vector3()))).toBeLessThan(1e-6);
    expect(direction.y).toBeLessThan(0);
  });
});
