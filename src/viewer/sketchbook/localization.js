/* Runs inside the local authored document, after its complete source script.
 * Deliberately adapts the original functions instead of reimplementing curl geometry. */
(() => {
  if (window.sketchbookScene) return;
  const titles = ['滨海湾金沙', '滨海湾花园', '鱼尾狮', '佛牙寺', '如切骑楼', '老巴刹', '滨海湾天际线', '新加坡河', '新加坡植物园'];
  const places = ['海湾舫', '擎天树丛', '鱼尾狮公园', '牛车水', '加东', '莱佛士码头', '滨海湾', '驳船码头', '东陵'];
  document.documentElement.lang = 'zh-CN';
  document.title = '幽兰 · 狮城手记';
  document.querySelector('.top .name').textContent = '幽兰 · 狮城手记';
  document.querySelector('.top nav').innerHTML = '<a href="#sketchbook">翻阅</a><a href="#plates">九处风景</a><a href="#about">关于手记</a>';
  document.querySelector('.hero-kicker').textContent = '把城市放慢，收进一页水彩里 · 新加坡';
  hint.textContent = '左右拖动纸页翻阅 · 拖动放大镜看细节 · 双击还原大小';
  document.querySelector('#about .section-label').textContent = '关于这本手记';
  document.querySelector('.bio').textContent = '从滨海湾的暮色，到骑楼下的日常；从植物园的一片绿，到老巴刹升起的烟火气。九幅水彩，把新加坡的城市切片收进一本可以翻阅的手记。轻轻拖动纸页，或拿起放大镜，停下来看看笔触、树影与建筑的细节。';
  document.querySelector('#plates .section-label').textContent = '九处风景 · 翻阅目录';
  document.querySelector('.foot').innerHTML = '幽兰 · 狮城手记　／　原作 <a class="bio-link" href="https://threeui.com/landing-pages/meng-to-sketchbook-landing-page" target="_blank" rel="noopener noreferrer">ThreeUI · Meng To</a>';
  PAGES.forEach((page, i) => {
    page.title = titles[i]; page.place = places[i];
    const row = plateList.children[i];
    row.querySelector('.t').textContent = titles[i]; row.querySelector('.p').textContent = places[i];
  });
  const labels = { sbLeft: '上一页', sbRight: '下一页', zIn: '放大手账', zOut: '缩小手账', loupeBtn: '显示放大镜', heroDown: '阅读手记介绍' };
  Object.entries(labels).forEach(([id, label]) => document.getElementById(id).setAttribute('aria-label', label));
  document.querySelector('.sb-tools').setAttribute('aria-label', '手账查看工具');
  capBox.setAttribute('aria-live', 'polite');
  const originalPaint = paint;
  paint = function () {
    originalPaint();
    book.querySelector('.sb-prev').setAttribute('aria-label', '上一页');
    book.querySelector('.sb-next').setAttribute('aria-label', '下一页');
  };
  let active = true, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tiltAmount = .65, magnification = 2.3;
  const originalKick = kick, originalTilt = tiltTo, originalView = setView;
  kick = function () { if (active && !document.hidden) originalKick(); };
  tiltTo = function (x, y) { if (!active || reduced || lgrab) return; originalTilt(x, y); view.trx *= tiltAmount; view.try_ *= tiltAmount; };
  setView = function (x, y, z) {
    originalView(reduced ? 0 : x, reduced ? 0 : y, z);
    if (reduced) { view.rx = view.trx; view.ry = view.try_; view.z = view.tz; viewActive = false; applyView(); }
  };
  // Use the authored spring constants with the live media preference instead
  // of its boot-time REDUCED constant, so either preference change takes effect.
  commit = function () {
    if (!turn) return;
    if (reduced) { spring = null; idx = turn.to; turn = null; paint(); return; }
    animateTo(1, () => { idx = turn.to; turn = null; paint(); }, 170, 26); kick();
  };
  cancel = function () {
    if (!turn) return;
    if (reduced) { spring = null; turn = null; paint(); return; }
    animateTo(0, () => { turn = null; paint(); }, 150, 24); kick();
  };
  const originalShove = shoveLoupe;
  shoveLoupe = function (dir) {
    originalShove(dir);
    if (reduced && lTarget) { lx = lTarget.x; ly = lTarget.y; lTarget = null; placeLoupe(); }
  };
  // A cancelled touch must never become a tap or accidentally commit a page.
  stage.addEventListener('pointerdown', e => { if (e.target.closest('.sb-arrow')) e.stopPropagation(); }, true);
  stage.addEventListener('pointercancel', e => { e.stopImmediatePropagation(); drag = null; cancel(); }, true);
  stage.addEventListener('click', e => { if (e.detail === 0 && e.target.closest('.sb-zone')) step(e.target.closest('.sb-prev') ? 'prev' : 'next'); });
  const originalPlace = placeLoupe;
  placeLoupe = function () {
    originalPlace();
    if (lx === null || !book.clientWidth) return;
    const cx = book.clientWidth / 2, cy = book.clientHeight / 2, z = view.z;
    const px = cx + (lx - cx) / z, py = cy + (ly - cy) / z, s = magnification * z;
    zoomInner.style.transform = `translate(${lx - px * s}px,${ly - py * s}px) scale(${s})`;
  };
  loupeSize = function () { return Math.round(Math.max(108, Math.min(240, book.clientWidth * .235))); };
  const originalToggle = loupeBtn.onclick;
  loupeBtn.onclick = () => { originalToggle(); placeLoupe(); };
  const scrollToSection = id => document.getElementById(id).scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  document.getElementById('heroDown').onclick = () => scrollToSection('about');
  plateList.querySelectorAll('.plate').forEach((button, i) => { button.onclick = () => { goTo(i); scrollToSection('sketchbook'); }; });
  const originalIntro = startIntro;
  startIntro = function () { if (!active || reduced) { idx = LAND; paint(); return; } originalIntro(); };
  function suspend() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; last = 0; dropLoupe();
    if (drag) { drag = null; spring = null; turn = null; paint(); }
  }
  function setReduced(value) {
    reduced = value;
    document.documentElement.classList.toggle('scene-reduced', value);
    if (value) { endIntro(); spring = null; if (turn) idx = turn.to; turn = null; lTarget = null; setView(0, 0, view.tz); paint(); }
  }
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change', e => setReduced(e.matches));
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else if (active) kick(); });
  window.sketchbookScene = {
    setActive(value) { active = value; document.documentElement.classList.toggle('scene-paused', !value); if (value) { layout(); placeLoupe(); kick(); } else suspend(); },
    setReduced,
    configure({ tilt, magnify, wash }) { tiltAmount = tilt; magnification = magnify; document.querySelector('.wash').style.opacity = wash; placeLoupe(); },
    reset() { endIntro(); spring = null; turn = null; idx = 0; setView(0, 0, 1); paint(); restLoupe(); scrollTo(0, 0); },
    next() { step('next'); }, previous() { step('prev'); },
    get state() { return { page: idx, turning: !!turn, active, reduced, zoom: view.tz }; },
  };
  setReduced(reduced); paint(); restLoupe();
  // Surface failed assets with a retry, while retaining readable navigation.
  Promise.all(PAGES.map(p => new Promise(resolve => { const im = new Image(); im.onload = () => resolve(true); im.onerror = () => resolve(false); im.src = p.url; }))).then(results => {
    if (results.every(Boolean)) return;
    const notice = document.createElement('p'); notice.className = 'sketchbook-load-error'; notice.setAttribute('role', 'alert');
    notice.append('部分手账图片加载失败。'); const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.onclick = () => location.reload(); notice.append(retry); wrap.append(notice);
  });
})();
