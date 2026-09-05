import { SCENE_LABELS } from './sceneCatalog.js';
import { createRoot } from 'react-dom/client';
import { MengToSketchbookLandingPage } from './sketchbook/MengToSketchbookLandingPage';
import localScript from './sketchbook/localization.js?raw';
import localStyle from './sketchbook/localization.css?raw';

export function createSketchbookScene(container, { reducedMotion = false } = {}) {
  const host = document.createElement('div');
  host.className = 'viewer-sketchbook'; host.hidden = true;
  container.append(host);
  let root, frame, active = false, disposed = false;
  const parameters = { tilt: .65, magnify: 2.3, wash: .72 };
  const api = () => frame?.contentWindow?.sketchbookScene;
  function configure() { api()?.configure(parameters); }
  function applyScene(loadedFrame) {
    if (disposed) return;
    frame = loadedFrame; frame.title = SCENE_LABELS.sketchbook;
    const doc = frame.contentDocument;
    if (!doc?.getElementById('sbBook')) return;
    if (!doc.getElementById('youlan-sketchbook-style')) {
      const style = doc.createElement('style'); style.id = 'youlan-sketchbook-style'; style.textContent = localStyle; doc.head.append(style);
      const script = doc.createElement('script'); script.textContent = localScript; doc.body.append(script);
    }
    api()?.setReduced(reducedMotion); api()?.setActive(active); configure();
  }
  return {
    parameters, configure,
    activate() {
      if (disposed) return;
      active = true; host.hidden = false;
      container.classList.add('has-sketchbook');
      if (!root) {
        root = createRoot(host);
        root.render(<MengToSketchbookLandingPage headingFont="instrument-serif" bodyFont="newsreader"
          headingWeight="400" bodyWeight="400" primaryColor="#2b2721" headingSize={30} bodySize={20}
          headingLetterSpacing={0.010} style={{ width: '100%', height: '100%', background: '#ece7dc' }} applyScene={applyScene} />);
      }
      api()?.setActive(true);
    },
    deactivate() {
      active = false; api()?.setActive(false); host.hidden = true; container.classList.remove('has-sketchbook');
    },
    center() { api()?.reset(); },
    next() { api()?.next(); }, previous() { api()?.previous(); },
    pauseClock() { api()?.setActive(active && !document.hidden); },
    setReducedMotion(value) { reducedMotion = value; api()?.setReduced(value); },
    dispose() {
      if (disposed) return;
      disposed = true; api()?.setActive(false);
      // React's outer effect cleanup can run during a commit; release this
      // independent root just after it, with the frame already detached.
      if (root) { const mountedRoot = root; queueMicrotask(() => mountedRoot.unmount()); root = null; }
      frame = null; host.remove(); container.classList.remove('has-sketchbook');
    },
  };
}

export function bindSketchbookPanel(gui, sketchbook) {
  const folder = gui.addFolder(SCENE_LABELS.sketchbook);
  folder.add(sketchbook.parameters, 'tilt', 0, 1, .01).name('手账视差幅度').onChange(sketchbook.configure);
  folder.add(sketchbook.parameters, 'magnify', 1.5, 3.5, .1).name('放大镜倍率').onChange(sketchbook.configure);
  folder.add(sketchbook.parameters, 'wash', 0, 1, .01).name('水彩背景浓度').onChange(sketchbook.configure);
  folder.add(sketchbook, 'previous').name('上一页'); folder.add(sketchbook, 'next').name('下一页'); folder.add(sketchbook, 'center').name('回到手记首页');
  return folder;
}
