import { SCENE_LABELS } from './sceneCatalog.js';
import { createOpeningMotion, clamp01, easeOut, easeInOut } from './openingMotion.js';
import './opening.css';

export function createOpeningScene(container, requestRender, { reducedMotion = false } = {}) {
  const parameters = { lineDuration: 1.4, revealDuration: 1.2, circleSize: .28, textureScale: 1 };
  const motion = createOpeningMotion();
  const host = document.createElement('section');
  host.className = 'viewer-opening'; host.hidden = true; host.setAttribute('aria-label', SCENE_LABELS.opening);
  host.innerHTML = `<div class="opening-paper"></div><div class="opening-circle-border"></div>
    <svg class="opening-line" viewBox="0 0 12 240" aria-hidden="true"><path d="M6 4 C2 24 9 36 5 57 S8 94 6 113 S4 153 6 172 S8 205 5 236" pathLength="1"/></svg>
    <button class="opening-enter" type="button" aria-label="进入纸纹背景"><img src="/nomadic/logo.png" alt="NOMADIC TRIBE" draggable="false"></button>
    <div class="opening-cursor" aria-hidden="true"><span>Enter</span></div>
    <p class="opening-error" hidden>开场素材加载失败。<button type="button">重试加载</button></p>`;
  container.append(host);
  const paper = host.querySelector('.opening-paper'), border = host.querySelector('.opening-circle-border');
  const line = host.querySelector('.opening-line'), path = line.querySelector('path');
  const button = host.querySelector('.opening-enter'), title = button.querySelector('img');
  const cursor = host.querySelector('.opening-cursor'), error = host.querySelector('.opening-error');
  let active = false, disposed = false, loaded = false, hovered = false, hover = 0, previous = null;
  let width = 1, height = 1, pointer = null, generation = 0, panelWasClosed = false;
  let refresh = () => {}, publishedStage = null, entryHover = 0;
  const awake = () => active && !document.hidden && !disposed;

  function load() {
    const ticket = ++generation; loaded = false; error.hidden = true;
    Promise.all(['background_blue_pattern.jpg', 'background_white_pattern.jpg', 'logo.png'].map(name => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = `/nomadic/${name}`;
    }))).then(() => { if (!disposed && ticket === generation) { loaded = true; requestRender(); } })
      .catch(() => { if (!disposed && ticket === generation) { error.hidden = false; requestRender(); } });
  }
  function enter() {
    if (awake() && loaded && motion.stage === 'ready') {
      entryHover = hover;
      motion.enter(reducedMotion); hovered = false; requestRender();
    }
  }
  function move(event) {
    if (!awake()) return;
    if (event.pointerType === 'touch') { pointer = null; return; }
    const rect = host.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    hovered = motion.stage === 'ready' && Math.hypot(pointer.x - width / 2, pointer.y - height / 2) < restingRadius();
    requestRender();
  }
  function leave() { pointer = null; hovered = false; if (awake()) requestRender(); }
  function restingRadius() { return Math.max(width * parameters.circleSize, Math.min(width, height) * .42); }
  function resize() {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    host.style.setProperty('--opening-texture-size', `${512 * parameters.textureScale}px`);
    if (awake()) requestRender();
  }
  function draw(timestamp) {
    const stage = motion.stage, t = motion.elapsed, resting = restingRadius();
    const delta = previous === null ? 0 : Math.min(.05, Math.max(0, (timestamp - previous) / 1000)); previous = timestamp;
    const targetHover = hovered && stage === 'ready' ? 1 : 0;
    hover += (targetHover - hover) * (1 - Math.exp(-delta * 6));
    if (Math.abs(hover - targetHover) < .001) hover = targetHover;
    let radius = 0, opacity = 0, titleScale = 1;
    if (stage === 'circle') { radius = resting * easeOut(t / 1.2); opacity = easeOut((t - .2) / 1.2); titleScale = 1.3 - .3 * opacity; }
    if (stage === 'ready') { radius = resting + Math.min(width * .02, 55) * hover; opacity = 1; titleScale = 1 + .1 * hover; }
    if (stage === 'reveal') {
      const progress = easeInOut(t / parameters.revealDuration);
      const startRadius = resting + Math.min(width * .02, 55) * entryHover;
      radius = startRadius + (Math.hypot(width, height) / 2 + 8 - startRadius) * progress;
      opacity = 1 - easeInOut(t / (parameters.revealDuration * .65));
      titleScale = 1 + .1 * entryHover + progress * .15;
    }
    if (stage === 'paper') radius = Math.hypot(width, height) / 2 + 8;
    paper.style.clipPath = `circle(${radius}px at 50% 50%)`;
    border.style.width = border.style.height = `${radius * 2}px`;
    border.style.opacity = ['circle', 'ready', 'reveal'].includes(stage) ? '1' : '0';
    line.style.opacity = stage === 'line' ? String(1 - clamp01((t - parameters.lineDuration + .35) / .35) * (loaded ? 1 : 0)) : '0';
    path.style.strokeDasharray = '1'; path.style.strokeDashoffset = String(1 - easeOut(t / Math.max(.5, parameters.lineDuration * .8)));
    button.style.width = button.style.height = `${resting * 2}px`;
    button.disabled = stage !== 'ready'; button.style.pointerEvents = stage === 'ready' ? 'auto' : 'none';
    title.style.opacity = String(opacity); title.style.transform = `scale(${titleScale})`;
    cursor.hidden = !pointer;
    if (pointer) { cursor.style.transform = `translate(${pointer.x}px,${pointer.y}px)`; cursor.classList.toggle('is-enter', targetHover === 1); }
    host.dataset.stage = stage; host.dataset.ready = String(loaded);
    if (stage !== publishedStage) { publishedStage = stage; refresh(); }
    return hover !== targetHover;
  }
  button.addEventListener('click', enter);
  button.addEventListener('focus', () => { hovered = true; if (awake()) requestRender(); });
  button.addEventListener('blur', leave);
  host.addEventListener('pointermove', move); host.addEventListener('pointerleave', leave);
  host.addEventListener('pointercancel', leave); error.querySelector('button').addEventListener('click', load);
  const observer = new ResizeObserver(resize); observer.observe(container);
  return {
    parameters, enter,
    get stage() { return motion.stage; },
    onPanelRefresh(callback) { refresh = callback; },
    replay() { motion.show(reducedMotion ? 'ready' : 'line'); hovered = false; hover = 0; requestRender(); },
    showPaper() { motion.show('paper'); hovered = false; requestRender(); },
    configure() { resize(); requestRender(); },
    activate() {
      if (disposed) return; active = true; host.hidden = false; container.classList.add('has-opening');
      const gui = document.querySelector('.lil-gui.root'); panelWasClosed = gui?.classList.contains('closed') ?? false;
      if (gui && !panelWasClosed) gui.querySelector(':scope > .title')?.click();
      motion.pause(); previous = null; resize(); if (!loaded) load(); requestRender();
    },
    deactivate() {
      if (!active) return; active = false; host.hidden = true; container.classList.remove('has-opening');
      motion.pause(); previous = null; pointer = null; hovered = false;
      const gui = document.querySelector('.lil-gui.root');
      if (!panelWasClosed && gui?.classList.contains('closed')) gui.querySelector(':scope > .title')?.click();
    },
    pauseClock() { motion.pause(); previous = null; pointer = null; hovered = false; },
    setReducedMotion(value) { reducedMotion = value; motion.pause(); if (awake()) requestRender(); },
    update(timestamp, visible = true) {
      if (!active || disposed || !visible) { motion.pause(); previous = null; return false; }
      const animated = motion.update(timestamp, { active, visible, ready: loaded, reduced: reducedMotion, ...parameters });
      const hovering = draw(timestamp);
      // Loading errors wait for the explicit retry button instead of spinning.
      return (animated && error.hidden) || hovering;
    },
    dispose() { if (disposed) return; this.deactivate(); disposed = true; generation++; observer.disconnect(); host.remove(); refresh = () => {}; },
  };
}

export function bindOpeningPanel(gui, opening) {
  const folder = gui.addFolder(SCENE_LABELS.opening), p = opening.parameters;
  folder.add(p, 'lineDuration', .8, 3, .1).name('线条开场时长').onChange(opening.configure);
  folder.add(p, 'revealDuration', .6, 2.5, .1).name('圆形展开时长').onChange(opening.configure);
  folder.add(p, 'circleSize', .2, .4, .01).name('标题圆形大小').onChange(opening.configure);
  folder.add(p, 'textureScale', .5, 2, .05).name('纸纹尺度').onChange(opening.configure);
  folder.add(opening, 'replay').name('重播开场');
  folder.add(opening, 'showPaper').name('直接查看纸纹');
  const note = document.createElement('div'); note.className = 'viewer-effect-note';
  note.textContent = '圆形标题出现后，点击标题或按 Tab、Enter 进入浅色纸纹。结束后停留在纯背景；通过场景选择切换到其他作品。';
  folder.$children.append(note); return folder;
}
