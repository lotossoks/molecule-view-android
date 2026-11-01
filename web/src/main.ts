import { Viewer } from 'molstar/lib/apps/viewer/app';
import { transpiler } from 'molstar/lib/mol-script/transpilers/pymol/parser';
import { Script } from 'molstar/lib/mol-script/script';
import { StructureSelection, StructureElement } from 'molstar/lib/mol-model/structure';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { Color } from 'molstar/lib/mol-util/color';
import 'molstar/build/viewer/molstar.css';
const bridge = (data: any) => (window as any).PalmolStatus?.postMessage(JSON.stringify(data));
let index = 0, count = 0, model: any, structure: any, busy = false;
let named: Record<string, any> = {}, layers: Record<string, any> = {};
let log: string[] = [], undo: any[] = [];
let messageText='';
const viewer = await Viewer.create('viewer', { layoutIsExpanded: false, layoutShowControls: false,
 layoutShowSequence: false, layoutShowLog: false, layoutShowLeftPanel: false,
 viewportShowExpand: false, viewportShowControls: false, extensions: [] });
const p = viewer.plugin;
p.selectionMode = true;
function state(message?: string) { if(message !== undefined)messageText=message; bridge({type:'state', message:messageText, index, count, busy, selected:p.managers.structure.selection.elementCount()}); }
p.managers.structure.selection.events.changed.subscribe(() => state());
function expression(text: string): any {
 const t = text.trim();
 if (t === 'sele') {
  if (!structure?.obj) throw Error('No structure');
  const loci = p.managers.structure.selection.getLoci(structure.obj.data);
  if (loci.kind !== 'element-loci' || StructureElement.Loci.isEmpty(loci)) throw Error('Selection is empty');
  return StructureElement.Bundle.toExpression(StructureElement.Bundle.fromLoci(loci));
 }
 if (named[t]) return named[t];
 return transpiler(t);
}
function loci(text: string) {
 if (!structure?.obj) throw Error('Open a structure first');
 return StructureSelection.toLociWithSourceUnits(Script.getStructureSelection(expression(text), structure.obj.data));
}
async function select(text: string) { p.managers.structure.selection.fromLoci('set', loci(text), false); }
async function show(style: string, target: string) {
 const types: Record<string,string> = {cartoon:'cartoon',sticks:'ball-and-stick',spheres:'spacefill',surface:'molecular-surface',lines:'line','ball-and-stick':'ball-and-stick'};
 if (!types[style]) throw Error('Styles: cartoon, sticks, ball-and-stick, spheres, surface, lines');
 const expr = expression(target);
 const component = await p.builders.structure.tryCreateComponentFromExpression(structure, expr, 'palmol-'+target, {label:target});
 if (!component) throw Error('Selection is empty');
 if(layers[target]) await p.state.data.build().delete(layers[target].ref).commit();
 layers[target] = await p.builders.structure.representation.addRepresentation(component, {
  type: types[style] as any, typeParams: {quality:'auto', ...(style === 'sticks' ? {aspectRatio:1} : {})}, color:'element-symbol'
 });
}
async function execute(line: string) {
 const split = line.trim().indexOf(' ');
 const cmd = (split < 0 ? line : line.slice(0,split)).toLowerCase();
 const args = (split < 0 ? '' : line.slice(split+1)).split(',').map(s=>s.trim());
 switch(cmd) {
 case 'select': {
  if(args.length !== 2 || !/^[a-zA-Z_]\w*$/.test(args[0])) throw Error('select name, expression');
  const e = expression(args[1]); await select(args[1]); named[args[0]] = e; break;
 }
 case 'show': await show(args[0],args[1] || 'all'); break;
 case 'hide': {
  const target = args[1] || 'all';
  if(target === 'all') { for(const layer of Object.values(layers)) await p.state.data.build().delete((layer as any).ref).commit(); layers = {}; }
  else if(layers[target]) { await p.state.data.build().delete(layers[target].ref).commit(); delete layers[target]; }
  else throw Error('hide supports displayed named layers; use isolate to hide surrounding atoms');
  break;
 }
 case 'color': {
  const target = args[1] || 'all', layer = layers[target];
  if (!layer) throw Error('Show this layer first');
  const colors: Record<string,number> = {red:0xef5350,green:0x66bb6a,blue:0x42a5f5,yellow:0xffca28,white:0xffffff,cyan:0x26c6da,orange:0xff9800};
  const theme = args[0] === 'chain' ? {name:'chain-id',params:{}} : args[0] === 'element' ? {name:'element-symbol',params:{}} : colors[args[0]] !== undefined ? {name:'uniform',params:{value:Color(colors[args[0]])}} : null;
  if(!theme) throw Error('Colors: element, chain, red, green, blue, yellow, white, cyan, orange');
  await p.state.data.build().to(layer).update((old:any)=>({...old,colorTheme:theme})).commit(); break;
 }
 case 'zoom': case 'focus': p.managers.camera.focusLoci(loci(args[0] || 'all')); break;
 case 'reset': p.managers.camera.reset(); break;
 case 'distance': {
  if(args.length !== 3) throw Error('distance name, selection1, selection2');
  const a=loci(args[1]), b=loci(args[2]);
  if(StructureElement.Loci.size(a)!==1 || StructureElement.Loci.size(b)!==1) throw Error('Select exactly one atom at each endpoint');
  await p.managers.structure.measurement.addDistance(a,b); break;
 }
 case 'frame': {
  const next=Number(args[0])-1;
  if(!Number.isInteger(next)||next<0||next>=count) throw Error(`State must be 1–${count}`);
  await p.state.data.build().to(model).update({modelIndex:next}).commit(); index=next;
  p.managers.structure.selection.clear(); break;
 }
 default: throw Error('Unknown command. Supported: select, show, hide, color, zoom, reset, distance, frame');
 }
}
async function run(action:()=>Promise<void>, record?:string) {
 if(busy) { state('Wait for the current operation'); return; }
 busy=true;state('Working…');
 try {
  await action(); if(record) {log.push(record); if(log.length>500)log.shift();}
  state('');
 } catch(e) {state(String(e));} finally {busy=false;state();}
}
(window as any).palmol = {
 open: (url:string, format:any, binary=false) => run(async()=>{
  await p.clear(); model=structure=undefined;count=0;index=0;named={};layers={};log=[];undo=[];
  const response=await fetch(url); if(!response.ok)throw Error(`HTTP ${response.status}`);
  const data=await p.builders.data.rawData({data:binary ? new Uint8Array(await response.arrayBuffer()) : await response.text()});
  const trajectory=await p.builders.structure.parseTrajectory(data,format);
  model=await p.builders.structure.createModel(trajectory);
  structure=await p.builders.structure.createStructure(model,{name:'model',params:{}});
  count=trajectory.obj?.data.frameCount ?? 1;
  await show('ball-and-stick','all');
  if(structure.obj?.data.polymerResidueCount > 10) await show('cartoon','all');
  p.managers.camera.reset();
 }),
 command:(line:string)=>run(()=>execute(line),line),
 step:(delta:number)=>run(()=>execute(`frame ${Math.max(1,Math.min(count,index+delta+1))}`)),
 select:(text:string)=>run(()=>select(text)),
 granularity:(value:any)=>p.managers.interactivity.setProps({granularity:value}),
 neighborhood:(radius:number,whole:boolean)=>run(async()=>{
  if(!Number.isFinite(radius)||radius<=0||radius>30)throw Error('Radius must be 0–30 Å');
  const source=expression('sele');
  const e=MS.struct.modifier.includeSurroundings({0:source,radius,'as-whole-residues':whole});
  named.pocket=e; await select('pocket');await show('sticks','pocket');p.managers.camera.focusLoci(loci('pocket'));
 }),
 isolate:()=>run(async()=>{named.isolated=expression('sele');await execute('hide everything, all');await show('sticks','isolated');}),
 style:(name:string,selected:boolean)=>run(async()=>{if(selected) named.selection=expression('sele');await show(name,selected?'selection':'all');}),
 reset:()=>p.managers.camera.reset(),
 export:()=>run(async()=>{bridge({type:'session',data:JSON.stringify({version:1,snapshot:await p.state.getSnapshot(),named,index,count,model:model?.ref,structure:structure?.ref,layers:Object.fromEntries(Object.entries(layers).map(([k,v]:any)=>[k,v.ref])),log})});}),
 restore:(url:string)=>run(async()=>{
  const s=await (await fetch(url)).json();if(s.version!==1)throw Error('Unsupported session version');
  await p.state.setSnapshot(s.snapshot);named=s.named||{};index=s.index;count=s.count;log=s.log||[];
  model=p.state.data.select(s.model)[0];structure=p.state.data.select(s.structure)[0];
  // State cells expose obj but builder updates require their transform ref.
  model={obj:model.obj,ref:model.transform.ref};structure={get obj(){return p.state.data.cells.get(s.structure)?.obj;},ref:s.structure};
  layers=Object.fromEntries(Object.entries(s.layers).map(([k,ref])=>[k,{ref}]));
 }),
 screenshot:()=>run(async()=>{bridge({type:'image',data:await p.helpers.viewportScreenshot?.getImageDataUri()});}),
 history:()=>bridge({type:'history',data:log.join('\n')})
};
state('Ready');bridge({type:'ready'});
