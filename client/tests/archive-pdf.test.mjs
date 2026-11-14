import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archivePdf} from '../src/archive-pdf.ts';
const bucket={date:'2026-01-01',count:9500,frpSum:0,frpCount:9500,maxFrp:0,first:'2026-01-01T00:00:00Z',last:'2026-11-14T00:00:00Z'};
const query={platform:'Aqua',startDate:'2026-01-01',endDate:'2026-12-31',area:null};
test('archive PDF includes entire selection totals, zero FRP, and all paginated daily aggregates',()=>{
 const summary={totals:bucket,monthly:[bucket],daily:Array.from({length:100},()=>bucket)};
 const pdf=archivePdf(summary,null,query);
 assert.match(pdf.output(),/^%PDF-/);
 assert.equal(pdf.output('blob').type,'application/pdf');
 assert.ok(pdf.getNumberOfPages()>2);
 const text=Object.values(pdf.internal.pages).flat().join(' ');
 assert.match(text,/9,500/);assert.match(text,/0.00 MW/);assert.match(text,/entire applied archive selection/);
 assert.match(text,/2026-12-31/);
});
test('empty archive selections generate valid PDFs with an explicit empty result',()=>{
 const pdf=archivePdf({totals:{...bucket,count:0,frpCount:0,maxFrp:null,first:null,last:null},monthly:[],daily:[]},null,query);
 const text=Object.values(pdf.internal.pages).flat().join(' ');
 assert.match(text,/No recorded observations match/);assert.match(text,/N\/A/);
});
test('archive PDF renders selected trend, historical comparison, calendar, and appendix from aggregates',()=>{
 const monthly=[...Array(12)].map((_,month)=>({...bucket,date:`2025-${String(month+1).padStart(2,'0')}`,count:(month+1)*10,frpSum:(month+1)*20,frpCount:10,methods:['Aqua/61.03']}));
 const daily=[{...bucket,date:'2025-01-02',count:12,frpSum:30,frpCount:2,methods:['Aqua/61.03']}];
 const summary={totals:{...bucket,date:'2025',count:780,frpSum:1560,frpCount:120},monthly,daily,yearly:[{...bucket,date:'2025',count:780,frpSum:1560,frpCount:120}],baselineReason:'Coverage is incomplete.'};
 const comparison={...summary,monthly:[...monthly,...monthly.map(value=>({...value,date:value.date.replace('2025','2024'),methods:['Aqua/6.1NRT']}))],yearly:[{...bucket,date:'2024',count:600,frpCount:10},{...bucket,date:'2025',count:780,frpCount:10}]};
 const pdf=archivePdf(summary,comparison,{...query,startDate:'2025-01-01',endDate:'2025-12-31'},{grouping:'yearly',metric:'mean-frp',comparisonYears:[2024,2025],generatedAt:'2026-01-01T00:00:00Z'});
 const text=Object.values(pdf.internal.pages).flat().join(' ');
 assert.match(text,/Historical fire activity/);assert.match(text,/Historical year comparison/);assert.match(text,/Burning activity calendar/);assert.match(text,/Detailed aggregate data/);
 assert.match(text,/Yearly mean frp/);assert.match(text,/grouping: yearly/);assert.match(text,/Processing evidence/);assert.ok(pdf.getNumberOfPages()>=5);
});
