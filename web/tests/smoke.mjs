import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:412,height:850}});
page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
await page.addInitScript(()=>{window.events=[];window.PalmolStatus={postMessage:s=>window.events.push(JSON.parse(s))};});
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
 await page.evaluate(code);
 const events=await page.evaluate(()=>window.events);
 const errors=events.filter(e=>e.type==='state' && /Error|Unknown|failed/i.test(e.message));
 assert.equal(errors.length,0,JSON.stringify(errors));
 return events;
}
let events=await act(()=>window.palmol.open('/fixture.pdb','pdb'));
assert.equal(events.at(-1).count,2);
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
await act(()=>window.palmol.restore('/session.palmol'));
await act(()=>window.palmol.step(-1));
events=await act(()=>window.palmol.screenshot());assert(events.some(e=>e.type==='image'&&e.data.startsWith('data:image/')));
await page.screenshot({path:'/tmp/palmol-smoke.png'});
console.log('PASS: load, models, selection, surroundings, styles, color, distance, session roundtrip, PNG');
await browser.close();
