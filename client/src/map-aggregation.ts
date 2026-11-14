import type { FireFeature } from './fire-data';
export interface DetectionCell { kind:'cell'; coordinates:[number,number]; count:number }

/** Groups loaded detections into screen-scale Mercator cells; counts never imply fire size. */
export function detectionCells(features: FireFeature[], zoom: number): DetectionCell[] {
  const world=512*2**zoom, cells=new Map<string,{count:number;lon:number;lat:number}>();
  for(const f of features){
    const [lon,lat]=f.geometry.coordinates;
    const safe=Math.max(-85.0511,Math.min(85.0511,lat));
    const x=(lon+180)/360*world;
    const y=(1-Math.asinh(Math.tan(safe*Math.PI/180))/Math.PI)/2*world;
    const ix=Math.floor(x/48),iy=Math.floor(y/48);
    const key=`${ix}:${iy}`;
    const centerX=Math.min(world,Math.max(0,(ix+.5)*48)),centerY=Math.min(world,Math.max(0,(iy+.5)*48));
    const cell=cells.get(key)||{count:0,lon:centerX/world*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*centerY/world)))*180/Math.PI};cell.count++;cells.set(key,cell);
  }
  return [...cells.values()].map(c=>({kind:'cell',coordinates:[c.lon,c.lat],count:c.count}));
}
