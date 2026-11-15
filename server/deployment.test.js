const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {nodeFileTrace}=require('@vercel/nft');

test('serverless dependency trace includes the complete Gold map runtime',async()=>{
 const root=path.resolve(__dirname,'..');
 const {fileList}=await nodeFileTrace(['api/index.js'],{base:root,processCwd:root});
 const files=new Set([...fileList].map(file=>file.split(path.sep).join('/')));
 for(const file of ['server/gold-routes.js','server/gold-service.mjs','server/gold-explorer.js','server/modis-csv.js','deploy/backend/gold_reader.mjs']) {
  assert.ok(files.has(file),`Serverless function must include ${file}`);
 }
});
