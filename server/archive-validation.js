const {booleanPointInPolygon}=require('@turf/boolean-point-in-polygon');
const {ValidateNotSelfIntersecting}=require('terra-draw');
const DAY=86400000;
function validDate(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function bounds(area){const r=area.geometry.coordinates[0];return [Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];}
function validateArea(a){
 if(a?.type!=='Feature'||a.geometry?.type!=='Polygon'||!Array.isArray(a.geometry.coordinates)||a.geometry.coordinates.length!==1)throw Error('Select one polygon without holes.');
 const r=a.geometry.coordinates[0];
 if(!Array.isArray(r)||r.length<4||r.length>1000||r.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('Invalid polygon coordinates.');
 if(r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1]||r.some((p,i)=>i&&Math.abs(p[0]-r[i-1][0])>180)||Math.abs(r.reduce((s,p,i)=>i?s+r[i-1][0]*p[1]-p[0]*r[i-1][1]:s,0))<1e-12||!ValidateNotSelfIntersecting(a).valid)throw Error('Polygon must be closed, nondegenerate, and without crossing edges.');
}
function validateQuery(q,platforms,kind){
 if(!q||typeof q!=='object')throw Error('Supply archive filters.');
 const platform=q.platform??platforms[0];if(platform!=='ALL'&&!platforms.includes(platform))throw Error('Unknown satellite.');
 if(!validDate(q.startDate)||!validDate(q.endDate)||q.startDate>q.endDate||Date.parse(q.endDate)-Date.parse(q.startDate)>DAY*36600)throw Error('Supply a valid inclusive UTC date range (maximum 100 years).');
 if(q.area)validateArea(q.area);
 if(q.viewport && (!Array.isArray(q.viewport)||q.viewport.length!==4||!q.viewport.every(Number.isFinite)||q.viewport[0]<-180||q.viewport[2]>180||q.viewport[1]<-90||q.viewport[3]>90||q.viewport[0]>=q.viewport[2]||q.viewport[1]>=q.viewport[3]))throw Error('Invalid viewport bounds.');
 if(q.selectedDay && (!validDate(q.selectedDay)||q.selectedDay<q.startDate||q.selectedDay>q.endDate))throw Error('Selected day is outside the date range.');
 const cursor=q.cursor??0;if(!Number.isSafeInteger(cursor)||cursor<0||cursor>1e8)throw Error('Invalid observation cursor.');
 if(kind==='comparison' && (platform==='ALL'||!Array.isArray(q.years)||!q.years.length||q.years.length>10||q.years.some(y=>!Number.isInteger(y)||y<1900||y>2200)))throw Error('Choose one satellite and up to ten comparison years.');
 return {platform,startDate:q.startDate,endDate:q.endDate,area:q.area||null,viewport:kind==='observations'?q.viewport||null:null,selectedDay:kind==='observations'?q.selectedDay||null:null,cursor:kind==='observations'?cursor:0,...(kind==='comparison'?{years:[...new Set(q.years)].sort()}: {})};
}
function contains(area,lon,lat){return !area||booleanPointInPolygon([lon,lat],area,{ignoreBoundary:false});}
module.exports={validDate,validateArea,validateQuery,bounds,contains};
