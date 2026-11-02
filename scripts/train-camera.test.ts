import {describe,expect,test} from "bun:test";
import * as THREE from "three";
import {cameraBoomDistance} from "../src/lib/trainCamera";
import type {CarriageCollider} from "../src/lib/trainPhysics";

describe("third-person camera collision",()=>{
  test("retracts the shift-lock shoulder offset beside a wall",()=>{
    const wall:CarriageCollider={min:[.25,-1],max:[.5,1],bottom:0,top:3};
    const eye=new THREE.Vector3(0,1.12,0),right=new THREE.Vector3(1,0,0);
    expect(cameraBoomDistance(eye,right,.32,[wall])).toBeCloseTo(.09,6);
    expect(cameraBoomDistance(eye,right,.32,[])).toBe(.32);
  });
  test("limits the boom before a carriage wall",()=>{
    const wall:CarriageCollider={min:[-.7,.3],max:[.7,.5],bottom:.4,top:2.8};
    const distance=cameraBoomDistance(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),3,[wall]);
    expect(distance).toBeCloseTo(.14,6);
  });

  test("keeps the requested boom when every collider misses",()=>{
    const wall:CarriageCollider={min:[2,2],max:[3,3],bottom:0,top:2};
    expect(cameraBoomDistance(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),2.8,[wall])).toBe(2.8);
  });

  test("returns zero when the camera starts inside the collision margin",()=>{
    const wall:CarriageCollider={min:[-.7,-.7],max:[.7,.7],bottom:0,top:2};
    expect(cameraBoomDistance(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),3,[wall])).toBe(0);
  });

  test("respects low clearance along the prone camera ray",()=>{
    const roof:CarriageCollider={min:[-.8,.5],max:[.8,.7],bottom:.34,top:.52};
    const proneEye=new THREE.Vector3(0,.3,0);
    const towardRoof=new THREE.Vector3(0,.03,1).normalize();
    expect(cameraBoomDistance(proneEye,towardRoof,2.4,[roof])).toBeCloseTo(.34,3);
  });
});
