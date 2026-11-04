import * as THREE from "three";
import {radioNotePhase} from "./trainRadio";

export function createRadioNotes(scene:THREE.Scene,radio:THREE.Object3D) {
  const root=new THREE.Group();root.name="RadioMusicNotes";
  const bounds=new THREE.Box3().setFromObject(radio);
  bounds.getCenter(root.position);root.position.y=bounds.max.y+.08;
  const textures=["♪","♫","♬","♪"].map((symbol,index)=>{
    const canvas=document.createElement("canvas");canvas.width=canvas.height=96;
    const context=canvas.getContext("2d")!;
    context.fillStyle="#f2c57d";context.textAlign="center";context.textBaseline="middle";context.font="64px serif";context.fillText(symbol,48,48);
    if(index===3) {context.strokeStyle="#f2c57d";context.lineWidth=5;context.beginPath();context.moveTo(24,76);context.lineTo(72,20);context.stroke();}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  });
  const notes=Array.from({length:6},(_,index)=>{
    const material=new THREE.SpriteMaterial({map:textures[index%3],transparent:true,opacity:0,depthWrite:false});
    const sprite=new THREE.Sprite(material);sprite.scale.setScalar(.16);root.add(sprite);return sprite;
  });
  const pausedMaterial=new THREE.SpriteMaterial({map:textures[3],transparent:true,opacity:.45,depthWrite:false,color:"#948c9d"});
  const paused=new THREE.Sprite(pausedMaterial);paused.scale.setScalar(.11);root.add(paused);
  scene.add(root);
  let audible=false;
  return {
    setPlaying(value:boolean){audible=value;},
    update(now:number,reducedMotion:boolean) {
      paused.visible=!audible||reducedMotion;
      pausedMaterial.color.set(audible?"#f2c57d":"#948c9d");
      pausedMaterial.map=audible?textures[0]:textures[3];
      for(let index=0;index<notes.length;index++) {
        const note=notes[index];note.visible=audible&&!reducedMotion;
        if(!note.visible)continue;
        const phase=radioNotePhase(now,index);
        const side=index%2?1:-1;
        note.position.set(side*(.035+phase*.22)+Math.sin(phase*5+index)*.035,phase*.68,0);
        note.material.opacity=Math.sin(phase*Math.PI)*.8;
        note.material.rotation=side*(phase-.5)*.5;
        note.scale.setScalar(.10+phase*.10);
      }
      return audible&&!reducedMotion;
    },
    dispose(){scene.remove(root);for(const texture of textures)texture.dispose();for(const note of notes)note.material.dispose();pausedMaterial.dispose();},
  };
}
