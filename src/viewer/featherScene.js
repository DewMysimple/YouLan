import cards from './feather/cards.json';
import './feather/feather.css';

const DEFAULTS = { size: 1, duration: .6, orbitSpeed: 1, orbitRadius: 1, previews: true, dots: 1 };
const PREVIEWS = new Set(['order-a20', 'employment-doc', 'login-alert', 'sfo-jfk', 'design-engineer', 'logo-v3-svg', 'to-katherine', 'jason-jonathan', '1062-19th-st', 'order-366']);

// Only Feather's first viewport. The original scroll narrative and account
// actions are intentionally absent; all artwork is served from local assets.
export function createFeatherScene(container, { reducedMotion = false } = {}) {
  const host = document.createElement('section');
  host.className = 'viewer-feather'; host.hidden = true;
  host.setAttribute('aria-label', '场景10·纸间来信');
  container.append(host);
  const parameters = { ...DEFAULTS };
  const animations = new Map();
  let mounted = false, active = false, disposed = false, panelWasClosed = false;
  let button, owl, error, images = [], layout = [];
  let hovered = false, pinned = false, focused = false, gathered = false;
  let timer = null, previewIndex = -1, revision = 0;
  let width = 0, height = 0;
  const awake = () => active && !document.hidden && !disposed;
  const motion = () => awake() && !reducedMotion;
  const clearTimer = () => { clearTimeout(timer); timer = null; };

  function cancelAnimation(index) {
    const previous = animations.get(index);
    if (previous) { previous.onfinish = null; previous.cancel(); animations.delete(index); }
  }
  function animate(index, frames, options, onfinish) {
    cancelAnimation(index);
    const animation = images[index].animate(frames, { fill: 'forwards', ...options });
    animations.set(index, animation);
    animation.onfinish = () => {
      if (animations.get(index) === animation && awake()) onfinish?.();
    };
    return animation;
  }
  function orbitTransform(index, angle = index / cards.length * 360) {
    const { dx, dy } = layout[index];
    // Preserve the source's flattened orbit and rotating paper planes.
    return `translate(${dx}px, ${dy}px) scaleY(.3) rotate(${angle}deg) translateX(${width * .025 * parameters.orbitRadius}px) scaleY(3.333333) scale(.12)`;
  }
  function orbit(index) {
    if (!gathered || !motion()) return;
    animate(index, [{ transform: orbitTransform(index) }, { transform: orbitTransform(index, index / cards.length * 360 + 360) }],
      { duration: 3000 / parameters.orbitSpeed, iterations: Infinity, easing: 'linear' });
  }
  function schedulePreview(delay = 900) {
    clearTimer();
    if (!motion() || !gathered || !parameters.previews) return;
    timer = setTimeout(showPreview, delay);
  }
  function showPreview() {
    timer = null;
    if (!motion() || !gathered || !parameters.previews) return;
    const candidates = cards.map((card, i) => PREVIEWS.has(card.id) && i !== previewIndex ? i : -1).filter(i => i >= 0);
    const index = candidates[Math.floor(Math.random() * candidates.length)];
    previewIndex = index;
    const token = revision;
    const image = images[index], point = layout[index];
    const from = getComputedStyle(image).transform;
    const raised = `translate(${point.dx}px, ${point.dy - Math.max(width * .06, 65)}px) scale(1)`;
    image.style.zIndex = '15'; host.dataset.preview = cards[index].id;
    animate(index, [{ transform: from }, { transform: raised }],
      { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' }, () => {
        if (token !== revision) return;
        timer = setTimeout(() => {
          timer = null;
          if (token !== revision || !motion() || !gathered) return;
          animate(index, [{ transform: raised }, { transform: orbitTransform(index) }],
            { duration: 350, easing: 'ease-in' }, () => {
              image.style.zIndex = ''; delete host.dataset.preview;
              orbit(index); schedulePreview(1200 + Math.random() * 1800);
            });
        }, 800 + Math.random() * 600);
      });
  }
  function transition(next, immediate = false) {
    revision++; clearTimer(); gathered = next;
    host.dataset.gathered = String(next);
    button.setAttribute('aria-pressed', String(next));
    delete host.dataset.preview;
    images.forEach((image, index) => {
      const from = getComputedStyle(image).transform;
      cancelAnimation(index); image.style.zIndex = '';
      if (immediate || !motion()) {
        // Reduced motion keeps the recognizable scattered composition visible.
        image.style.transform = 'none';
        return;
      }
      image.style.transform = '';
      animate(index, [{ transform: from }, { transform: next ? orbitTransform(index) : 'none' }],
        { duration: parameters.duration * 1000, easing: 'ease-in-out' }, () => {
          if (next) orbit(index);
          else { image.style.transform = 'none'; cancelAnimation(index); }
        });
    });
    if (next) schedulePreview(Math.max(900, parameters.duration * 1000 + 300));
  }
  function updateIntent() {
    if (!mounted || !awake()) return;
    const next = hovered || pinned || focused;
    if (next !== gathered) transition(next);
  }
  function measure() {
    if (!mounted || !active) return;
    width = host.clientWidth; height = host.clientHeight;
    const mobile = Math.max(0, Math.min(1, (1024 - width) / 544));
    // Portrait screens use three loose rows above and below the central bird.
    const compact = width < 600;
    layout = cards.map((card, index) => {
      const unit = Math.max(width, height * (1 - .1 * mobile)) / 100;
      const w = card.w * unit * parameters.size;
      const h = card.h * unit * parameters.size;
      let x = (card.x + (card.x - 50) * .15 * mobile) * width / 100;
      let y = (card.y + (50 - card.y) * .1 * mobile) * height / 100;
      if (compact) {
        const row = Math.floor(index / 4), column = index % 4;
        const centers = [.08, .22, .35, .68, .82, .96];
        x = width * ((column + .5) / 4) - w / 2;
        y = height * centers[row] - h / 2;
      }
      Object.assign(images[index].style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      return { dx: width / 2 - x - w / 2, dy: height / 2 - y - h / 2 };
    });
    const bite = button.querySelector('span').getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    const ow = owl.offsetWidth, oh = owl.offsetHeight;
    // Source anchor: center of “Got”, bottom minus 55% of the bird height.
    owl.style.transform = `translate(${bite.left - bounds.left + bite.width / 2 - ow / 2}px, ${bite.bottom - bounds.top - .55 * oh}px) rotate(-50deg)`;
    transition(gathered, true);
    if (gathered && motion()) transition(true);
  }
  function assetFailure() { error.hidden = false; }
  function mount() {
    if (mounted) return;
    mounted = true;
    images = cards.map(card => {
      const image = document.createElement('img');
      image.className = 'feather-card'; image.alt = ''; image.draggable = false;
      image.addEventListener('error', assetFailure); image.src = `/feather/${card.id}.png`;
      host.append(image); return image;
    });
    button = document.createElement('button'); button.type = 'button'; button.className = 'feather-handle';
    button.innerHTML = '<svg aria-hidden="true"><rect x="0" y="0" width="100%" height="100%" rx="40" fill="none" stroke-width="1.5" stroke-dasharray="3 6" /></svg><span>Got</span>&nbsp;Mail?';
    button.setAttribute('aria-label', 'Got Mail? 收拢或散开邮件贴纸');
    button.setAttribute('aria-pressed', 'false');
    button.title = '悬停收拢，移开散开；触屏轻点切换';
    host.append(button);
    owl = document.createElement('img'); owl.className = 'feather-owl'; owl.alt = ''; owl.draggable = false;
    owl.addEventListener('error', assetFailure); owl.src = '/feather/owl.svg'; host.append(owl);
    error = document.createElement('div'); error.className = 'feather-error'; error.hidden = true;
    error.setAttribute('role', 'status'); error.textContent = '部分纸片未能加载。';
    const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.type = 'button';
    retry.addEventListener('click', retryAssets); error.append(retry); host.append(error);
    button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; updateIntent(); } });
    button.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovered = false; updateIntent(); } });
    button.addEventListener('focus', () => { if (button.matches(':focus-visible')) { focused = true; updateIntent(); } });
    button.addEventListener('blur', () => { focused = false; pinned = false; updateIntent(); });
    button.addEventListener('click', event => {
      if (event.pointerType === 'mouse') {
        pinned = false;
        // Repeated clicks must not cancel the current preview's return timer.
        if (!host.dataset.preview) schedulePreview(0);
      }
      else { pinned = !pinned; focused = false; updateIntent(); }
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') { hovered = pinned = focused = false; updateIntent(); button.blur(); }
    });
    document.fonts.load('500 32px FeatherProgramm').then(() => { if (!disposed) measure(); }).catch(() => {});
  }
  function retryAssets() {
    error.hidden = true;
    for (const image of [...images, owl]) if (!image.complete || !image.naturalWidth) {
      const src = image.src; image.removeAttribute('src'); image.src = src;
    }
  }
  function center() {
    if (!mounted || disposed) return;
    hovered = pinned = focused = false; button.blur(); transition(false);
  }
  function configure() {
    host.style.setProperty('--feather-dots', parameters.dots);
    if (mounted) measure();
  }
  const resize = new ResizeObserver(measure); resize.observe(host);
  return {
    parameters, configure, center,
    reset() { Object.assign(parameters, DEFAULTS); center(); configure(); },
    activate() {
      if (disposed || active) return;
      active = true; host.hidden = false; container.classList.add('has-feather');
      const gui = document.querySelector('.lil-gui.root');
      panelWasClosed = gui?.classList.contains('closed') ?? false;
      if (gui && !panelWasClosed) gui.querySelector(':scope > .title')?.click();
      mount(); configure();
    },
    deactivate() {
      if (!active) return;
      center(); active = false; revision++; clearTimer();
      images.forEach((_, index) => cancelAnimation(index));
      host.hidden = true; container.classList.remove('has-feather');
      const gui = document.querySelector('.lil-gui.root');
      if (!panelWasClosed && gui?.classList.contains('closed')) gui.querySelector(':scope > .title')?.click();
    },
    pauseClock() {
      if (!mounted) return;
      // No timers or browser animations survive a hidden tab.
      if (document.hidden) { revision++; clearTimer(); animations.forEach(animation => animation.pause()); }
      else if (active) {
        // Re-enter from the frozen pose, including interrupted preview cards.
        transition(gathered);
      }
    },
    setReducedMotion(value) {
      reducedMotion = value;
      if (mounted) transition(gathered, value);
    },
    dispose() {
      if (disposed) return;
      this.deactivate(); disposed = true; revision++; clearTimer(); resize.disconnect();
      images.forEach((_, index) => cancelAnimation(index)); host.remove();
    },
  };
}

export function bindFeatherPanel(gui, feather) {
  const folder = gui.addFolder('场景10·纸间来信');
  folder.add(feather.parameters, 'size', .6, 1.4, .01).name('贴纸尺寸').onChange(feather.configure);
  folder.add(feather.parameters, 'duration', .25, 1.2, .05).name('聚散时长（秒）').onChange(feather.configure);
  folder.add(feather.parameters, 'orbitSpeed', .3, 2, .05).name('环绕速度').onChange(feather.configure);
  folder.add(feather.parameters, 'orbitRadius', .6, 2, .05).name('环绕范围').onChange(feather.configure);
  folder.add(feather.parameters, 'previews').name('轮流浮出邮件').onChange(feather.configure);
  folder.add(feather.parameters, 'dots', 0, 3, .1).name('点阵浓度').onChange(feather.configure);
  folder.add(feather, 'center').name('散开所有贴纸');
  folder.add({ reset() { feather.reset(); folder.controllersRecursive().forEach(control => control.updateDisplay()); } }, 'reset').name('恢复参考效果');
  return folder;
}
