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
