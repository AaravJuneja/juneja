export type TrainGraphicsQuality="low"|"high";
export interface AdaptiveGraphicsState {scale:number;slowFrames:number;fastFrames:number;}

const FRAME_SLACK_MS=2;
const frameRates={low:30,high:60} as const;
export interface FramePacer {nextAt:number;}

export function trainFrameBudget(quality:TrainGraphicsQuality) {
  return 1000/frameRates[quality];
}

export function trainFrameDue(pacer:FramePacer,quality:TrainGraphicsQuality,now:number,fresh=false) {
  const budget=trainFrameBudget(quality);
  if(fresh||!Number.isFinite(pacer.nextAt)) {pacer.nextAt=now+budget;return true;}
  if(now<pacer.nextAt-FRAME_SLACK_MS)return false;
  pacer.nextAt=now-pacer.nextAt>budget?now+budget:pacer.nextAt+budget;
  return true;
}

export function stepAdaptiveGraphics(state:AdaptiveGraphicsState,workMs:number,budgetMs=trainFrameBudget("low")):AdaptiveGraphicsState {
  if(!Number.isFinite(workMs)||workMs<=0)return state;
  if(workMs>budgetMs*1.2) {
    state.fastFrames=0;
    if(++state.slowFrames>=8) {state.scale=Math.max(.6,Math.round((state.scale-.1)*100)/100);state.slowFrames=0;}
    return state;
  }
  state.slowFrames=0;
  if(workMs<=budgetMs*.75) {
    if(++state.fastFrames>=120) {state.scale=Math.min(1,Math.round((state.scale+.05)*100)/100);state.fastFrames=0;}
  } else state.fastFrames=0;
  return state;
}

const settings={
  low:{maxPixelRatio:.8,maxPixels:720_000,torchSkinSize:64,torchShadowSize:256,torchShadows:false,powerPreference:"low-power"},
  high:{maxPixelRatio:2,maxPixels:10_000_000,torchSkinSize:256,torchShadowSize:768,torchShadows:true,powerPreference:"high-performance"},
} as const;

export function trainPowerPreference(quality:TrainGraphicsQuality) {
  return settings[quality].powerPreference;
}

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
