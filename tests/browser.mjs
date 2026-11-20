import {chromium} from 'playwright-core';
import {preview} from 'vite';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
function model(){
 const floats=new Float32Array([0,0,0,1,0,0,0,1,0, 0,1, 0,0,0,0,1,0]);
 const j={asset:{version:'2.0',generator:'Asset Desk test fixture'},buffers:[{byteLength:floats.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:8},{buffer:0,byteOffset:44,byteLength:24}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:2,componentType:5126,count:2,type:'VEC3'}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{name:'Test triangle',mesh:0},{name:'Second triangle',mesh:0,translation:[2,0,0]}],scenes:[{nodes:[0,1]}],scene:0,animations:[{name:'Lift',samplers:[{input:1,output:2}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}]};
 let text=JSON.stringify(j);text+=' '.repeat((4-text.length%4)%4);const b=Buffer.alloc(28+text.length+floats.byteLength);[0x46546c67,2,b.length,text.length,0x4e4f534a].forEach((x,i)=>b.writeUInt32LE(x,i*4));b.write(text,20);b.writeUInt32LE(floats.byteLength,20+text.length);b.writeUInt32LE(0x004e4942,24+text.length);Buffer.from(floats.buffer).copy(b,28+text.length);return b;
}
const server=await preview({preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const base=`http://127.0.0.1:${server.httpServer.address().port}`,page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 await page.goto(base+'/?inspect=1');await page.locator('#status').filter({hasText:'Drop a GLB'}).waitFor();
 await page.locator('#files').setInputFiles({name:'sample.glb',mimeType:'model/gltf-binary',buffer:model()});
 await page.waitForFunction(()=>window.__showroomInspect?.().ready);
 assert.equal(await page.locator('#count').textContent(),'1');assert.equal(await page.locator('#title').textContent(),'sample.glb');
 await page.selectOption('#objects',{label:'Mesh #'+await page.evaluate(()=>document.querySelector('#objects option:nth-child(2)').value)+' · Test triangle'}).catch(async()=>page.locator('#objects').selectOption({index:1}));
 await page.locator('#isolate').check();assert.equal(await page.evaluate(()=>__showroomInspect().visibleMeshes),1);
 await page.locator('#showAll').click();assert.equal(await page.evaluate(()=>__showroomInspect().visibleMeshes),2);
 await page.locator('#animation').selectOption('0');await page.locator('#play').click();await page.waitForTimeout(150);assert.equal(await page.locator('#play').textContent(),'Pause');
 await page.locator('#navigation').selectOption('fly');await page.locator('#navigation').selectOption('orbit');await page.locator('#reset').click();
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'asset-desk-inventory.json');
 await mkdir('evidence',{recursive:true});await page.screenshot({path:'evidence/desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'evidence/mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'dropped.glb',{type:'model/gltf-binary'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));}, [...model()]);
 await page.waitForFunction(()=>__showroomInspect().ready&&document.querySelector('#title').textContent==='dropped.glb');assert.equal(await page.locator('#count').textContent(),'2');
 await page.locator('#files').setInputFiles({name:'bad.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('invalid')});await page.locator('#status').filter({hasText:'Invalid GLB header'}).waitFor();
 assert.equal(await page.locator('#title').textContent(),'dropped.glb');
 assert(!requests.some(r=>r.method!=='GET'||(!r.url.startsWith(base)&&!r.url.startsWith('blob:')&&!r.url.startsWith('data:'))));assert.deepEqual(errors,[]);
 console.log('PASS: local GLB, scene inspection/isolation, animation, fly/orbit, export, malformed input, mobile layout; no uploads/external requests');
}finally{await browser.close();server.httpServer.closeAllConnections();await new Promise(r=>server.httpServer.close(r));}
