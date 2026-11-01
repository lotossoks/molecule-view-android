import { Viewer } from 'molstar/lib/apps/viewer/app';
import 'molstar/build/viewer/molstar.css';
const report = (text: string) => (window as any).PalmolStatus.postMessage(text);
let busy = false, index = 0, count = 0;
let model: any;
const viewer = await Viewer.create('viewer', {
 layoutIsExpanded: false, layoutShowControls: false, layoutShowSequence: false,
 layoutShowLog: false, layoutShowLeftPanel: false, viewportShowExpand: false,
 extensions: [],
});
async function run(action: () => Promise<void>) {
 if (busy) return;
 busy = true;
 report('Загрузка…');
 try { await action(); report(count ? `Состояние ${index + 1} / ${count}` : 'Откройте структуру'); }
 catch(e) { report('Ошибка: ' + String(e)); }
 finally { busy = false; }
}
(window as any).palmol = {
 open: (url: string, format: any, binary = false) => run(async () => {
  const p = viewer.plugin;
  await p.clear(); model = undefined; count = 0; index = 0;
  const data = await p.builders.data.download({ url, isBinary: binary });
  const trajectory = await p.builders.structure.parseTrajectory(data, format);
  const preset = await p.builders.structure.hierarchy.applyPreset(trajectory, 'default');
  model = preset?.model;
  count = trajectory.obj?.data.frameCount ?? 1;
 }),
 step: (delta: number) => run(async () => {
  if (!model || !count) return;
  const next = Math.max(0, Math.min(count - 1, index + delta));
  await viewer.plugin.state.data.build().to(model).update({ modelIndex: next }).commit();
  index = next;
 }),
 reset: () => viewer.plugin.managers.camera.reset(),
};
report('Готово — откройте структуру');
