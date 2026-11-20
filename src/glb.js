// Read only metadata. Reject external resources before GLTFLoader sees a model.
export function inspectGLB(buffer, fileBytes) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2) throw Error('Expected a glTF 2 binary (.glb).');
  if (view.getUint32(8,true) !== fileBytes) throw Error('GLB length does not match the file.');
  const length = view.getUint32(12,true);
  if (view.getUint32(16,true) !== 0x4e4f534a || length > buffer.byteLength-20) throw Error('Invalid GLB JSON chunk.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  const external = [...(json.buffers||[]),...(json.images||[])].some(x=>x.uri && !x.uri.startsWith('data:'));
  if (external) throw Error('External resources are blocked. Export a self-contained GLB.');
  if ((json.extensionsRequired||[]).some(x=>['KHR_draco_mesh_compression','KHR_texture_basisu'].includes(x))) throw Error('Draco/KTX2 is not supported yet. Export an uncompressed or meshopt GLB.');
  return {meshes:json.meshes?.length||0,textures:json.textures?.length||0,copyright:json.asset?.copyright||null,triangles:(json.meshes||[]).reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+((p.mode??4)===4?Math.floor((json.accessors?.[p.indices??p.attributes?.POSITION]?.count||0)/3):0),0),0)};
}
