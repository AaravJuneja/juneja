export type TrainGraphicsQuality="low"|"high";
export interface AdaptiveGraphicsState {scale:number;slowFrames:number;fastFrames:number;}

export function stepAdaptiveGraphics(state:AdaptiveGraphicsState,frameDurationMs:number):AdaptiveGraphicsState {
  if(!Number.isFinite(frameDurationMs)||frameDurationMs<=0)return state;
  if(frameDurationMs>40) {
    const slowFrames=state.slowFrames+1;
    return slowFrames>=8
      ?{scale:Math.max(.6,Math.round((state.scale-.1)*100)/100),slowFrames:0,fastFrames:0}
      :{...state,slowFrames,fastFrames:0};
  }
  if(frameDurationMs<=34) {
    const fastFrames=state.fastFrames+1;
    return fastFrames>=120
      ?{scale:Math.min(1,Math.round((state.scale+.05)*100)/100),slowFrames:0,fastFrames:0}
      :{...state,slowFrames:0,fastFrames};
  }
  return {...state,slowFrames:0,fastFrames:0};
}

const settings={
  low:{maxPixelRatio:.8,maxPixels:720_000,torchSkinSize:64,torchShadowSize:256,torchShadows:false},
  high:{maxPixelRatio:2,maxPixels:10_000_000,torchSkinSize:256,torchShadowSize:768,torchShadows:true},
} as const;

export function trainGraphicsProfile(quality:TrainGraphicsQuality,width:number,height:number,devicePixelRatio:number) {
  const profile=settings[quality];
  const safeWidth=Number.isFinite(width)?Math.max(1,width):1;
  const safeHeight=Number.isFinite(height)?Math.max(1,height):1;
  const safeRatio=Number.isFinite(devicePixelRatio)?Math.max(.1,devicePixelRatio):1;
  const requestedRatio=quality==="high"?Math.max(safeRatio,1.5):safeRatio;
  return {
    pixelRatio:Math.min(requestedRatio,profile.maxPixelRatio,Math.sqrt(profile.maxPixels/(safeWidth*safeHeight))),
    torchSkinSize:profile.torchSkinSize,
    torchShadowSize:profile.torchShadowSize,
    torchShadows:profile.torchShadows,
  };
}
