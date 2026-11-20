import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectGLB} from '../src/glb.js';
function fixture(json){let text=JSON.stringify(json);text+=' '.repeat((4-text.length%4)%4);const b=new ArrayBuffer(20+text.length),v=new DataView(b);[0x46546c67,2,b.byteLength,text.length,0x4e4f534a].forEach((x,i)=>v.setUint32(i*4,x,true));new Uint8Array(b,20).set(new TextEncoder().encode(text));return b;}
test('reads embedded model metadata',()=>{const b=fixture({asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{count:6}]});assert.equal(inspectGLB(b,b.byteLength).triangles,2);});
test('rejects external model and image requests',()=>{for(const resource of [{buffers:[{uri:'https://example.com/private.bin'}]},{images:[{uri:'texture.png'}]}]){const b=fixture({asset:{version:'2.0'},...resource});assert.throws(()=>inspectGLB(b,b.byteLength),/External resources/);}});
test('rejects invalid headers and truncated data',()=>{assert.throws(()=>inspectGLB(new ArrayBuffer(20),20));const b=fixture({});assert.throws(()=>inspectGLB(b,b.byteLength+4),/length/);assert.throws(()=>inspectGLB(b.slice(0,20),b.byteLength));});
