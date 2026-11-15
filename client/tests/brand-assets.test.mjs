import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';

test('browser SVG assets are valid UTF-8 so favicon parsing does not fall back to a cached icon',()=>{
 const directory=new URL('../public/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.svg'))) {
  assert.doesNotThrow(()=>new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(new URL(name,directory))),name);
 }
});
