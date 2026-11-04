export function isGzip(bytes:ArrayBuffer) {
  const magic=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
  return magic[0]===0x1f&&magic[1]===0x8b;
}

export async function gunzipModel(bytes:ArrayBuffer) {
  return isGzip(bytes)?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer():bytes;
}

export async function fetchTrainModel(url:string,signal:AbortSignal,failure="Model download failed") {
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error(failure);
  const data=await gunzipModel(await response.arrayBuffer());
  if(signal.aborted)throw new DOMException("Aborted","AbortError");
  return data;
}
