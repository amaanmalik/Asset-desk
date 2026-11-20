import './style.css';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {FlyControls} from 'three/addons/controls/FlyControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {inspectGLB} from './glb.js';
const catalog=[];

const $=id=>document.getElementById(id),number=n=>new Intl.NumberFormat('en').format(Math.round(n)),mb=n=>(n/1e6).toFixed(2)+' MB';
const viewer=$('viewport'),status=$('status'),scene=new T.Scene();scene.background=new T.Color('#646d75');
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;viewer.prepend(renderer.domElement);
const camera=new T.PerspectiveCamera(45,1,.01,10000);camera.position.set(4,3,5);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;
const fly=new FlyControls(camera,renderer.domElement);fly.dragToLook=true;fly.rollSpeed=.6;fly.enabled=false;
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
scene.add(new T.HemisphereLight(0xdce9ff,0x6c625a,.75));
for(const [x,y,z,intensity] of [[4,8,5,2],[-5,3,-4,1]]){const l=new T.DirectionalLight(0xffffff,intensity);l.position.set(x,y,z);scene.add(l);}
let grid=new T.GridHelper(10,20,0x9ca7aa,0x78838a);grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
let gltf,root,asset,mixer,action,objects=[],generation=0,modelSize=1,ready=false,lastFrame=performance.now(),fpsStart=lastFrame,frames=0,frameTimes=[],liveStats={},loading=false;
const originalVisibility=new Map();
function setStatus(message,error=false){status.textContent=message;status.hidden=!message;status.style.color=error?'#ffb5a2':'white';}
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function stat(label,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('stats').append(dt,dd);}
function bounds(target=root){const b=new T.Box3();target?.updateMatrixWorld(true);target?.traverseVisible(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh||o.isInstancedMesh){o.computeBoundingBox();b.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}else{if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});return b;}
function fit(target=root,reset=false){
 const b=bounds(target);if(b.isEmpty())return;const center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());modelSize=Math.max(size.x,size.y,size.z,.001);
 const vFov=T.MathUtils.degToRad(camera.fov),hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect),radius=size.length()/2,dist=radius/Math.sin(Math.min(vFov,hFov)/2)*1.12;
 const direction=reset?new T.Vector3(1,.65,1):camera.position.clone().sub(orbit.target);if(direction.lengthSq()<1e-10)direction.set(1,.65,1);
 orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction.normalize(),dist);camera.near=Math.max(.0001,modelSize/10000);camera.far=Math.max(100,modelSize*1000,dist*20);camera.updateProjectionMatrix();camera.lookAt(center);orbit.minDistance=modelSize*.0001;orbit.maxDistance=modelSize*100;orbit.update();
 $('flySpeed').max=String(Math.max(modelSize*2,.1));$('flySpeed').value=String(Math.max(modelSize/8,.01));fly.movementSpeed=Number($('flySpeed').value);
}
function dispose(model){
 const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();for(const s of model.scenes)s.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();if(t.source?.data)images.add(t.source.data);}for(const image of images)image.close?.();
}
function clear(){mixer?.stopAllAction();if(root&&mixer)mixer.uncacheRoot(root);mixer=null;action=null;root?.removeFromParent();if(gltf)dispose(gltf);gltf=null;root=null;objects=[];originalVisibility.clear();ready=false;liveStats={};renderer.renderLists.dispose();}
function describe(){
 $('assessment').textContent='Inspect scale, orientation, detail and animation bindings before game integration. Rendering statistics describe this view and device; they are not a game-readiness certification. The source model is not modified.';
}
function populateObjects(){
 const selected=$('objects').value,query=$('search').value.trim().toLowerCase(),filtered=objects.filter(o=>`${o.name} #${o.id}`.toLowerCase().includes(query)),shown=filtered.slice(0,250);
 $('objects').replaceChildren(option('','Whole scene'));for(const o of shown)$('objects').append(option(String(o.id),`${o.isMesh?'Mesh':'Group'} #${o.id} · ${o.name||'(unnamed)'}`));
 if(selected&&!shown.some(o=>String(o.id)===selected)){const o=objects.find(o=>String(o.id)===selected);if(o)$('objects').append(option(selected,`Selected #${o.id} · ${o.name||'(unnamed)'}`));}$('objects').value=selected;$('objects').disabled=!root;
 $('objectCount').textContent=`${number(objects.length)} objects/groups · ${number(filtered.length)} matches${filtered.length>250?' · first 250 shown; search to narrow':''}`;
}
function selectedObject(){return objects.find(o=>String(o.id)===$('objects').value);}
function visibility(){const selected=selectedObject(),keep=new Set();selected?.traverse(o=>keep.add(o));root?.traverse(o=>{if(o.isMesh)o.visible=originalVisibility.get(o)&&(!$('isolate').checked||!selected||keep.has(o));});}
function setupScene(index){
 mixer?.stopAllAction();if(root&&mixer)mixer.uncacheRoot(root);root?.traverse(o=>{if(o.isMesh&&originalVisibility.has(o))o.visible=originalVisibility.get(o);});root?.removeFromParent();root=gltf.scenes[index];scene.add(root);mixer=new T.AnimationMixer(root);mixer.timeScale=Number($('rate').value);action=null;$('play').textContent='Play';
 objects=[];originalVisibility.clear();root.traverse(o=>{if(o.isMesh||o.children.length&&o!==root)objects.push(o);if(o.isMesh)originalVisibility.set(o,o.visible);});$('objects').value='';$('search').value='';$('isolate').checked=false;populateObjects();
 const meshes=[],materials=new Set(),textures=new Set(),images=new Map();let triangles=0;root.traverse(o=>{if(!o.isMesh)return;meshes.push(o);const g=o.geometry;triangles+=(g.index?g.index.count:g.attributes.position?.count||0)/3*(o.isInstancedMesh?o.count:1);for(const m of [o.material].flat()){materials.add(m);for(const t of Object.values(m))if(t?.isTexture){textures.add(t);const image=t.source?.data;if(image?.width&&image?.height)images.set(t.source,image.width*image.height*4*4/3);}}});
 liveStats={meshes:meshes.length,materials:materials.size,textures:textures.size,triangles:Math.round(triangles),estimatedTextureBytes:[...images.values()].reduce((a,b)=>a+b,0)};
 $('stats').replaceChildren();for(const [k,v] of [['File size',mb(asset.bytes)],['Mesh instances',number(liveStats.meshes)],['Source meshes',number(asset.meshes)],['Materials (scene)',number(materials.size)],['Textures (scene)',number(textures.size)],['Textures (source)',number(asset.textures)],['Triangles ≈ (scene)',number(triangles)],['Animation clips',gltf.animations.length],['Texture RGBA8 ≈',mb(liveStats.estimatedTextureBytes)]])stat(k,v);
 const b=bounds(),s=b.getSize(new T.Vector3());$('dimensions').textContent=`Bounds X / Y / Z: ${s.toArray().map(v=>v.toPrecision(4)).join(' / ')} glTF units. Y-up viewer. Texture memory is an uncompressed RGBA8+mipmap estimate per image source, not measured VRAM.`;
 grid.position.copy(b.getCenter(new T.Vector3()));grid.position.y=b.min.y-Math.max(s.x,s.z,s.y,.001)*.0001;const gridSize=Math.max(s.x,s.z,s.y,.001)*1.5;grid.scale.setScalar(gridSize/10);
 $('animation').replaceChildren(option('','Choose a clip'));gltf.animations.forEach((a,i)=>$('animation').append(option(String(i),`${a.name||'Animation '+(i+1)} · ${a.duration.toFixed(2)}s`)));$('animation').disabled=!gltf.animations.length;$('play').disabled=$('stop').disabled=!gltf.animations.length;
 fit(root,true);ready=true;
}
async function load(id){
 const next=catalog.find(a=>a.id===id);if(!next)return;const ticket=++generation;clear();asset=next;loading=true;$('title').textContent=asset.name;$('stats').replaceChildren();$('dimensions').textContent='';$('sourceCredit').textContent=asset.copyright?`Embedded copyright text (not a licence grant): ${asset.copyright}`:'No embedded copyright statement. Source and commercial-use permission need verification.';$('licence').textContent=asset.licence;describe();
 for(const b of $('models').children)b.setAttribute('aria-pressed',String(b.dataset.id===id));for(const key of ['objects','scene','animation','play','stop'])$(key).disabled=true;
 setStatus(`Loading ${asset.name} · ${mb(asset.bytes)}…`);
 try{
  if(asset.bytes>100*1024*1024&&!confirm('This model is over 100 MB and may exceed your device memory. Open it?')){setStatus('Large model not opened.');return;} const buffer=await asset.file.arrayBuffer();if(ticket!==generation)return;if(ticket!==generation)return;setStatus(`Preparing textures and geometry · ${asset.name}…`);
  const manager=new T.LoadingManager();manager.setURLModifier(url=>{if(/^(blob:|data:)/.test(url))return url;throw Error('External resources are blocked. Export a self-contained GLB.');});const localLoader=new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);const loaded=await localLoader.parseAsync(buffer,'');if(ticket!==generation){dispose(loaded);return;}gltf=loaded;
  $('scene').replaceChildren(...gltf.scenes.map((s,i)=>option(String(i),s.name||`Scene ${i+1}`)));$('scene').disabled=gltf.scenes.length<2;setupScene(Math.max(0,gltf.scenes.indexOf(gltf.scene)));$('scene').value=String(gltf.scenes.indexOf(root));setStatus('');
 }catch(e){if(ticket===generation&&e.name!=='AbortError'){setStatus(`Could not load ${asset.name}: ${e.message}`,true);$('assessment').append(document.createTextNode(' Loading failed; no visual assessment is possible.'));console.error(e);}}finally{if(ticket===generation)loading=false;}
}
function refreshLibrary(){
 $('count').textContent=catalog.length;$('models').replaceChildren();
 for(const a of catalog){const b=document.createElement('button');b.className='model';b.dataset.id=a.id;b.setAttribute('aria-pressed',String(asset?.id===a.id));const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=a.name;sub.textContent=`${mb(a.bytes)} · ${number(a.triangles||0)} source tris`;b.append(title,sub);b.onclick=()=>load(a.id);$('models').append(b);}
}
async function openFiles(files){
 let first;
 for(const file of files){
  try{if(!/\.glb$/i.test(file.name))throw Error('Choose a self-contained .glb file.');const head=await file.slice(0,20).arrayBuffer();const view=new DataView(head);if(head.byteLength<20)throw Error('Invalid GLB header');const length=view.getUint32(12,true);if(length>16*1024*1024)throw Error('GLB metadata exceeds 16 MB');const metadata=inspectGLB(await file.slice(0,20+length).arrayBuffer(),file.size);const item={...metadata,id:crypto.randomUUID(),name:file.name,bytes:file.size,file,licence:'Not verified — check your source licence'};catalog.push(item);first??=item.id;}catch(error){setStatus(`${file.name}: ${error.message}`,true);}
 }
 refreshLibrary();if(first)await load(first);
}
$('openFiles').onclick=()=>$('files').click();
$('files').onchange=event=>{openFiles(event.target.files);event.target.value='';};
window.addEventListener('dragover',event=>{event.preventDefault();document.body.classList.add('dropping');});
window.addEventListener('dragleave',event=>{if(!event.relatedTarget)document.body.classList.remove('dropping');});
window.addEventListener('drop',event=>{event.preventDefault();document.body.classList.remove('dropping');openFiles(event.dataTransfer.files);});
$('fit').onclick=()=>fit();$('reset').onclick=()=>{mixer?.stopAllAction();action=null;$('play').textContent='Play';$('objects').value='';$('isolate').checked=false;visibility();fit(root,true);};$('focus').onclick=()=>fit(selectedObject()||root);$('objects').onchange=()=>{visibility();if(selectedObject())fit(selectedObject());};$('isolate').onchange=()=>{visibility();fit(selectedObject()||root);};$('search').oninput=populateObjects;
$('showAll').onclick=()=>{$('objects').value='';$('isolate').checked=false;visibility();fit();};$('scene').onchange=()=>setupScene(Number($('scene').value));
$('animation').onchange=()=>{mixer?.stopAllAction();action=null;$('play').textContent='Play';};$('play').onclick=()=>{if(!$('animation').value){$('animation').value='0';}const clip=gltf?.animations[Number($('animation').value)];if(!clip||!mixer)return;if(!action){action=mixer.clipAction(clip);action.reset().play();}else action.paused=!action.paused;$('play').textContent=action.paused?'Resume':'Pause';};$('stop').onclick=()=>{mixer?.stopAllAction();action=null;$('play').textContent='Play';};$('rate').onchange=()=>{if(mixer)mixer.timeScale=Number($('rate').value);};
$('navigation').onchange=()=>{releaseFlyKeys();fly.enabled=$('navigation').value==='fly';orbit.enabled=!fly.enabled;$('flySpeedLabel').hidden=!fly.enabled;if(!fly.enabled){const direction=new T.Vector3();camera.getWorldDirection(direction);orbit.target.copy(camera.position).addScaledVector(direction,Math.max(modelSize*.15,camera.near*10));orbit.update();}$('help').textContent=fly.enabled?'Click viewer · drag to look · W/S forward/back · A/D strafe · R/F up/down · arrows look · Shift precision':'Drag to orbit · wheel to zoom · right-drag to pan · F to fit';viewer.focus();};$('flySpeed').oninput=()=>fly.movementSpeed=Number($('flySpeed').value);$('exposure').oninput=()=>{renderer.toneMappingExposure=Number($('exposure').value);};$('grid').onchange=()=>grid.visible=$('grid').checked;$('studio').onchange=()=>scene.background.set({slate:'#646d75',light:'#d7dbde',dark:'#23282c'}[$('studio').value]);
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({generated:new Date().toISOString(),licensing:'All unverified',assets:catalog.map(({file,...metadata})=>metadata),current:asset?{id:asset.id,...liveStats}:null},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='asset-desk-inventory.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
viewer.addEventListener('pointerdown',()=>viewer.focus());viewer.addEventListener('keydown',e=>{if(e.code==='KeyF'&&!fly.enabled){e.preventDefault();fit();}});renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;setStatus('Graphics context lost. Reload Asset Desk to continue.',true);});
// FlyControls listens on window; typing in the inspector must not fly the camera.
window.addEventListener('keydown',e=>{if(fly.enabled&&!viewer.contains(document.activeElement))e.stopImmediatePropagation();else if(fly.enabled&&e.code.startsWith('Arrow'))e.preventDefault();},true);
function releaseFlyKeys(){if(fly.enabled)for(const code of ['KeyW','KeyS','KeyA','KeyD','KeyR','KeyF','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'])window.dispatchEvent(new KeyboardEvent('keyup',{code}));}
$('navigation').addEventListener('pointerdown',releaseFlyKeys);window.addEventListener('blur',releaseFlyKeys);
new ResizeObserver(()=>{const w=viewer.clientWidth,h=viewer.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewer);
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.1);frameTimes.push(now-lastFrame);lastFrame=now;if(fly.enabled)fly.update(dt);else orbit.update();mixer?.update(dt);renderer.render(scene,camera);frames++;if(now-fpsStart>1000){const sorted=frameTimes.sort((a,b)=>a-b);$('performance').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS · ${sorted[Math.floor(sorted.length*.95)]?.toFixed(1)} ms p95 · ${number(renderer.info.render.calls)} draws · ${number(renderer.info.render.triangles)} tris`;frames=0;fpsStart=now;frameTimes=[];}}
requestAnimationFrame(frame);
// Read-only inspection endpoint, scoped to this standalone page.
if(new URLSearchParams(location.search).has('inspect'))Object.defineProperty(window,'__showroomInspect',{value:()=>({ready,loading,id:asset?.id,stats:liveStats,camera:camera.position.toArray(),target:orbit.target.toArray(),bounds:root?bounds().getSize(new T.Vector3()).toArray():null,objects:objects.length,visibleMeshes:root?(()=>{let n=0;root.traverseVisible(o=>{if(o.isMesh)n++;});return n;})():0,animation:action?{time:action.time,paused:action.paused}:null,render:{...renderer.info.render}})});
refreshLibrary();setStatus('Drop a GLB here or choose Open GLB files.');
