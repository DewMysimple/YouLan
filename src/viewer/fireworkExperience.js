import { SCENE_LABELS } from './sceneCatalog.js';
import { createFireworkScene as createClassic, bindFireworkPanel as bindClassic } from './fireworkScene.js';
import { createPaintedFireworks } from './paintedFireworks.js';

// Keep the original adjustable study available without mixing its timeline,
// colors or particles into the new world-space show.
export function createFireworkScene(scene, renderer, requestRender, options) {
  const classic = createClassic(scene, renderer, requestRender, options);
  const painted = createPaintedFireworks(scene, renderer, requestRender, options);
  const settings = { mode: '彩色指尖花火' };
  let active = false, refresh = () => {};
  const current = () => settings.mode === '金菊闪柳（原版）' ? classic : painted;
  function applyMode() {
    classic.deactivate(); painted.deactivate(); classic.root.visible = false; classic.background.visible = false;
    if (active) current().activate();
    if (active && current() === classic) classic.apply();
    refresh(); requestRender();
  }
  applyMode();
  return {
    classic, painted, settings, applyMode,
    get parameters() { return current().parameters; },
    get renderScale() { return current().renderScale; },
    update: (...args) => current().update(...args),
    setSize: (...args) => painted.setSize(...args),
    activate() { active = true; applyMode(); },
    deactivate() { active = false; applyMode(); },
    pauseClock() { classic.pauseClock(); painted.pauseClock(); },
    setReducedMotion(value) { classic.setReducedMotion(value); painted.setReducedMotion(value); },
    onRefresh(callback) { refresh = callback; },
    dispose() { classic.dispose(); painted.dispose(); },
  };
}

export function bindFireworkPanel(gui, experience, requestRender) {
  const folder = gui.addFolder(SCENE_LABELS.firework);
  folder.add(experience.settings, 'mode', ['彩色指尖花火', '金菊闪柳（原版）']).name('烟花模式').onChange(experience.applyMode);
  const firework = experience.painted, p = firework.parameters;
  const update = () => firework.apply();
  folder.add(p, 'enabled').name('启用彩色花火').onChange(update);
  folder.add(p, 'playing').name('播放动画').onChange(update);
  folder.add(p, 'autoLaunch').name('自动烟花秀').onChange(update);
  folder.add(p, 'interval', .65, 3, .05).name('连发间隔（秒）').onChange(update);
  folder.add(p, 'speed', .1, 2, .01).name('播放速度').onChange(update);
  folder.add(p, 'timeline', 0, 20, .01).decimals(2).name('时间预览（秒）').onChange(value => firework.seek(value));
  folder.add({ finale: () => firework.finale() }, 'finale').name('五彩齐放');
  folder.add({ replay: () => firework.replay() }, 'replay').name('重新演出');
  folder.add(p, 'size', .5, 1.7, .01).name('烟花尺寸').onChange(update);
  folder.add(p, 'density', 24, 64, 1).name('每朵主枝数').onChange(update);
  folder.add(p, 'curl', 0, .85, .01).name('弧线卷曲').onChange(update);
  folder.add(p, 'depthSpread', 0, 1.5, .01).name('三维纵深').onChange(update);
  folder.add(p, 'brushWidth', .35, 2, .01).name('彩带厚度').onChange(update);
  folder.add(p, 'tailRatio', .03, .7, .01).name('尾部粗细').onChange(update);
  folder.add(p, 'secondary', 0, 1, .01).name('枝端二次绽放').onChange(update);
  folder.add(p, 'palette', ['缤纷交响', '冰川薄荷', '玫瑰金雨']).name('烟花配色').onChange(update);
  folder.add(p, 'brilliance', .5, 3, .01).name('色带亮度').onChange(update);
  folder.add(p, 'grain', 0, 1, .01).name('纸面颗粒').onChange(update);
  folder.add(p, 'skyStyle', ['蓝色纸幕', '午夜靛蓝', '深黑夜空']).name('天空预设').onChange(value => {
    [p.skyTop, p.skyBottom] = value === '蓝色纸幕' ? ['#07449a', '#087aca'] : value === '午夜靛蓝' ? ['#080b2d', '#162956'] : ['#010103', '#030715'];
    update(); folder.controllers.forEach(c => c.updateDisplay());
  });
  folder.addColor(p, 'skyTop').name('天空顶部').onChange(update);
  folder.addColor(p, 'skyBottom').name('天空底部').onChange(update);
  folder.add(p, 'sound').name('烟花音效').onChange(() => { update(); if (p.sound) firework.audio.unlock(); });
  folder.add(p, 'volume', 0, 1, .01).name('音效音量').onChange(update);
  folder.add(p, 'bloomEnabled').name('启用柔光').onChange(update);
  folder.add(p, 'bloomStrength', 0, 1.5, .01).name('柔光强度').onChange(update);
  folder.add(p, 'quality', ['高质量', '均衡', '省电']).name('画质').onChange(update);
  folder.add({ reset: () => { firework.restore(); folder.controllers.forEach(c => c.updateDisplay()); } }, 'reset').name('恢复参考效果');
  const status = document.createElement('div'); status.className = 'viewer-firework-status viewer-painted-status'; folder.$children.appendChild(status);
  const note = document.createElement('div'); note.className = 'viewer-effect-note';
  note.textContent = '单击发射、拖动旋转、滚轮缩放；触屏单指拖动旋转，双指缩放平移。彩带轨迹位于三维空间，蓝色纸幕保持背景。烟花样式参考视频及指尖烟花网站重新实现。音效在首次点击后启用，可关闭；减少动态偏好下显示静态花冠。最多同时保留10朵，满额时保留正在绽放的烟花。原版模式仍可用于对照。';
  folder.$children.appendChild(note);
  const classicFolder = bindClassic(folder, experience.classic, requestRender); classicFolder.close();
  const controllerMode = folder.controllers[0];
  experience.onRefresh(() => {
    const painted = experience.settings.mode === '彩色指尖花火';
    classicFolder.show(!painted);
    folder.controllers.filter(c => c !== controllerMode).forEach(c => c.show(painted));
    folder.$children.querySelectorAll(':scope > .viewer-panel-section').forEach(heading => { heading.hidden = !painted && heading.textContent !== '播放与交互'; });
    status.hidden = !painted;
  });
  let lastStatus = '', lastPanelTime = -Infinity;
  firework.onRefresh(() => {
    const sound = !p.sound ? '静音' : firework.audio.state === 'locked' ? '点击启用音效' : firework.audio.state === 'running' ? '音效已启用' : '音效待启用';
    const playback = !p.enabled ? '已关闭' : !p.playing ? '已暂停' : p.autoLaunch || firework.activeCount ? '演出中' : '点击继续';
    const next = `${playback} · ${firework.activeCount} 朵花火 · ${sound}`;
    if (next !== lastStatus) { status.textContent = next; lastStatus = next; }
    folder.controllers.find(c => c.property === 'playing')?.updateDisplay();
    const now = performance.now();
    if (!p.playing || now-lastPanelTime > 120) {
      lastPanelTime=now;
      const timeline=folder.controllers.find(c=>c.property==='timeline');
      timeline?.max(Math.max(20,Math.ceil(p.timeline/10)*10)).updateDisplay();
    }
  });
  firework.apply(); experience.applyMode();
  return folder;
}
