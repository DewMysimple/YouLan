// Adapted from Codrops Atmospheric Depth Gallery. See public/gallery/depth/LICENSE.
export const GALLERY_SLIDES = [
  { name: '金色', x: -.9, accent: '#feca4f', background: '#fffaf0', blob1: '#ffdf94', blob2: '#fce7c4' },
  { name: '紫罗兰', x: .8, accent: '#80455a', background: '#fffaf0', blob1: '#d29a41', blob2: '#bb96af' },
  { name: '余晖', x: -.7, accent: '#fa7b71', background: '#5f81ab', blob1: '#f88b8d', blob2: '#cfbbdd' },
  { name: '钴蓝', x: 1, accent: '#3c72c6', background: '#5b9bc2', blob1: '#ffaa00', blob2: '#00e1ff' },
  { name: '草甸', x: -.7, accent: '#fdd895', background: '#7d936e', blob1: '#fdd895', blob2: '#a5b599' },
].map((slide, i) => ({ ...slide, url: `/gallery/depth/flower-0${i + 1}.webp` }));

export const GALLERY_DEFAULTS = Object.freeze({
  progress: 0, gap: 5, scale: 1, spread: .75, wheelSpeed: .75,
  smoothing: .22, parallax: .12, breath: .022,
  animate: true, speed: .65, grain: .028, moodStrength: .9,
  trail: true, trailWidth: .012, trailOpacity: .5, sparkles: true,
});

export function normalizeGalleryWheel(delta, mode, height) {
  return Math.max(-240, Math.min(240, delta * (mode === 1 ? 16 : mode === 2 ? height : 1)));
}

export function galleryBlend(progress, count = GALLERY_SLIDES.length) {
  const depth = Math.max(0, Math.min(1, progress)) * (count - 1);
  const index = Math.floor(depth);
  return { index, next: Math.min(index + 1, count - 1), mix: depth - index };
}

export function dampGallery(value, target, delta, seconds) {
  const next = value + (target - value) * (1 - Math.exp(-delta / Math.max(seconds, .001)));
  return Math.abs(target - next) < .00001 ? target : next;
}
