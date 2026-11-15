export interface MonthInput {date:string;count:number;frpSum:number;frpCount:number;complete?:boolean}
/** Uses one scale for every year; missing values never become zero activity. */
export function seasonalCells(months:MonthInput[],startDate:string,endDate:string,metric:'detections'|'mean-frp'){
 const first=Number(startDate.slice(0,4)),last=Number(endDate.slice(0,4));
 if(!Number.isInteger(first)||!Number.isInteger(last)||first<1900||last>2200||last<first)return [];
 const lookup=new Map(months.map(m=>[m.date,m]));
 const cells=Array.from({length:last-first+1},(_,i)=>Array.from({length:12},(_,month)=>{
  const date=`${first+i}-${String(month+1).padStart(2,'0')}`,outside=date<startDate.slice(0,7)||date>endDate.slice(0,7),b=lookup.get(date);
  const value=outside?null:metric==='mean-frp'?b?.frpCount?b.frpSum/b.frpCount:null:b?.count??null;
  return {date,value,outside,complete:b?.complete===true && startDate<=date+'-01' && endDate>=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5)),0)).toISOString().slice(0,10),level:0};
 }));
 const max=Math.max(0,...cells.flat().map(c=>c.value??0));
 for(const row of cells)for(const c of row)c.level=c.value===null||c.value===0?0:Math.min(4,Math.max(1,Math.ceil(c.value/(max||1)*4)));
 return cells;
}
