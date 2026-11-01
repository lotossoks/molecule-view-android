import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:412,height:850},hasTouch:true, ...(process.env.PALMOL_LEGACY ? {userAgent:"Mozilla/5.0 Android Chrome/91.0.4472.114 Mobile Safari/537.36"}: {})});
page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
await page.addInitScript(()=>{delete Object.hasOwn;window.events=[];window.PalmolStatus={postMessage:s=>window.events.push(JSON.parse(s))};});
await page.goto('http://127.0.0.1:8765/app/src/main/assets/viewer/index.html');
await page.waitForFunction(()=>window.events.some(e=>e.type==='ready'),{timeout:60000});
const pdb=`MODEL        1
ATOM      1  N   ALA A   1      11.104  13.207  14.199  1.00 20.00           N
ATOM      2  CA  ALA A   1      12.560  13.207  14.199  1.00 20.00           C
ATOM      3  C   GLY A   2      13.560  13.207  14.199  1.00 20.00           C
ENDMDL
MODEL        2
ATOM      1  N   ALA A   1      11.104  15.207  14.199  1.00 20.00           N
ATOM      2  CA  ALA A   1      12.560  15.207  14.199  1.00 20.00           C
ATOM      3  C   GLY A   2      13.560  15.207  14.199  1.00 20.00           C
ENDMDL
END
`;
await page.route('**/fixture.pdb',route=>route.fulfill({body:pdb,contentType:'text/plain'}));
async function act(code) {
 await page.evaluate(()=>window.events=[]);
 await page.evaluate(typeof code === 'string' ? '('+code+')()' : code);
 const events=await page.evaluate(()=>window.events);
 const errors=events.filter(e=>e.type==='state' && /Error|Unknown|failed/i.test(e.message));
 assert.equal(errors.length,0,JSON.stringify(errors));
 return events;
}
let events=await act(()=>window.palmol.open('/fixture.pdb','pdb'));
assert.equal(events.at(-1).count,2);
await page.waitForTimeout(600);
await page.touchscreen.tap(206,425);
await page.waitForTimeout(200);
assert((await page.evaluate(()=>window.events.filter(e=>e.type==='state').at(-1))).selected>0,'Canvas picking');
events=await act(()=>window.palmol.select('resi 1'));assert.equal(events.at(-1).selected,2);
await act(()=>window.palmol.neighborhood(5,true));
await act(()=>window.palmol.command('select site, resi 1'));
events=await act(()=>window.palmol.command('select neighbors, byres (site around 5)'));assert.equal(events.at(-1).selected,1);
await act(()=>window.palmol.command('show sticks, site'));
await act(()=>window.palmol.command('color yellow, site'));
await act(()=>window.palmol.command('distance d1, id 1, id 2'));
events=await act(()=>window.palmol.step(1));assert.equal(events.at(-1).index,1);
events=await act(()=>window.palmol.export());const session=events.find(e=>e.type==='session').data;
await page.route('**/session.palmol',route=>route.fulfill({body:session,contentType:'application/json'}));
await page.route('**/other.xyz',route=>route.fulfill({body:'1\nOther\nO 0 0 0\n'}));
await act(()=>window.palmol.open('/other.xyz','xyz'));
events=await act(()=>window.palmol.restore('/session.palmol'));assert.equal(events.at(-1).count,2);assert.equal(events.at(-1).index,1);
await act(()=>window.palmol.step(-1));
await act(()=>window.palmol.style('spheres',false));
await act(()=>window.palmol.command('color cyan, all'));
await act(()=>window.palmol.select('resi 1'));
await act(()=>window.palmol.neighborhood(5,true));
events=await act(()=>window.palmol.screenshot());assert(events.some(e=>e.type==='image'&&e.data.startsWith('data:image/')));
await page.screenshot({path:'/tmp/palmol-smoke.png'});
const fixtures = {
 xyz: '2\nwater fragment\nO 0 0 0\nH 0.95 0 0\n',
 mol2: '@<TRIPOS>MOLECULE\nfragment\n2 1 0 0 0\nSMALL\nNO_CHARGES\n@<TRIPOS>ATOM\n1 O1 0 0 0 O.3 1 MOL 0\n2 H1 0.95 0 0 H 1 MOL 0\n@<TRIPOS>BOND\n1 1 2 1\n',
 gro: 'fragment\n    2\n    1SOL     OW    1   0.000   0.000   0.000\n    1SOL    HW1    2   0.095   0.000   0.000\n   1.0 1.0 1.0\n',
 sdf: 'fragment\n  Palmol\n\n  2  1  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n    0.9500    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\nM  END\n$$$$\n'
};
for(const [format,body] of Object.entries(fixtures)){
 await page.route('**/fixture.'+format,route=>route.fulfill({body,contentType:'text/plain'}));
 await act(()=>window.palmol.reset());
 await act(`() => window.palmol.open('/fixture.${format}', '${format}')`);
 events=await act(()=>window.palmol.select('all'));assert.equal(events.at(-1).selected,2,format);
}
for(const ext of ['cif','bcif']){
 const body=readFileSync(new URL('./fixtures/1crn.'+ext,import.meta.url));
 await page.route('**/1crn.'+ext,route=>route.fulfill({body,contentType:'application/octet-stream'}));
 await act(`() => window.palmol.open('/1crn.${ext}', 'mmcif', ${ext==='bcif'})`);
 events=await act(()=>window.palmol.select('all'));assert.equal(events.at(-1).selected,327,ext);
 for(const style of ['cartoon','spheres','surface','lines'])await act(`() => window.palmol.style('${style}', false)`);
}
events=await act(()=>window.palmol.export());const binarySession=events.find(e=>e.type==='session').data;
await page.route('**/binary-session.palmol',route=>route.fulfill({body:binarySession,contentType:'application/json'}));
await act(()=>window.palmol.open('/other.xyz','xyz'));
await act(()=>window.palmol.restore('/binary-session.palmol'));
events=await act(()=>window.palmol.select('all'));assert.equal(events.at(-1).selected,327,'BCIF session roundtrip');
console.log('PASS: XYZ, MOL2, GRO, SDF, mmCIF and BinaryCIF parsers + BCIF session roundtrip');

if(process.env.PALMOL_STRESS){
 const atoms=100000;
 let xyz=atoms+'\nPalmol synthetic scale fixture\n';
 for(let i=0;i<atoms;i++)xyz+=`C ${(i%100)*3} ${Math.floor(i/100)%100*3} ${Math.floor(i/10000)*3}\n`;
 await page.route('**/scale.xyz',route=>route.fulfill({body:xyz,contentType:'text/plain'}));
 const start=Date.now();await act(()=>window.palmol.open('/scale.xyz','xyz'));
 events=await act(()=>window.palmol.select('all'));assert.equal(events.at(-1).selected,atoms);
 console.log('PASS: 100000 synthetic atoms, load+selection',Date.now()-start,'ms (desktop software rendering, not phone FPS)');
}
console.log('PASS: load, models, selection, surroundings, styles, color, distance, session roundtrip, PNG');
await browser.close();
