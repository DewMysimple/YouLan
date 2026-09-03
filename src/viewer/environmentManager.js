import * as THREE from 'three';
import { UltraHDRLoader } from '../../source/threejs-transmission/examples/jsm/loaders/UltraHDRLoader.js';

const BUILTIN_URL = '/environments/citrus_orchard_road_puresky_4k.exr';

// The bundled loader's asynchronous gainmap error callback throws rather than
// rejecting loadAsync. Adapt that callback without modifying the bundled source.
class SafeUltraHDRLoader extends UltraHDRLoader {
  constructor(reject) { super(); this.rejectDecode = reject; }
  _applyGainmapToSDR(metadata, sdr, gainmap, success) {
    super._applyGainmapToSDR(metadata, sdr, gainmap, success, this.rejectDecode);
  }
}

function parseUltraHDR(buffer) {
  return new Promise((resolve, reject) => {
    const loader = new SafeUltraHDRLoader(reject);
    loader.parse(buffer, (data) => {
      const texture = new THREE.DataTexture(data.data, data.width, data.height, data.format, data.type);
      texture.colorSpace = THREE.LinearSRGBColorSpace;
      texture.flipY = true;
      resolve(texture);
    });
  });
}

export async function decodeEnvironment(buffer, name) {
  const extension = name.toLowerCase().split('.').pop();
  let texture;
  if (extension === 'hdr' || extension === 'exr') {
    const Loader = extension === 'hdr'
      ? (await import('three/addons/loaders/HDRLoader.js')).HDRLoader
      : (await import('three/addons/loaders/EXRLoader.js')).EXRLoader;
    const loader = new Loader();
    const data = loader.parse(buffer);
    texture = new THREE.DataTexture(data.data, data.width, data.height, data.format ?? THREE.RGBAFormat, data.type ?? loader.type);
    texture.colorSpace = data.colorSpace ?? THREE.LinearSRGBColorSpace;
    texture.flipY = data.flipY ?? true;
  } else if (['jpg', 'jpeg', 'png'].includes(extension)) {
    // Detect gainmap metadata by content, not by the optional .hdr.jpg suffix.
    const metadata = extension === 'png' ? '' : new TextDecoder('latin1').decode(buffer);
    const ultra = /hdr-gain-map|hdrgm:|urn:iso:std:iso:ts:21496/.test(metadata);
    if (ultra) {
      texture = await parseUltraHDR(buffer);
    } else {
      const url = URL.createObjectURL(new Blob([buffer]));
      try {
        texture = await new THREE.TextureLoader().loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } else {
    throw new Error('请选择 HDR、EXR、JPG 或 PNG 全景图片。');
  }
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function whiteEnvironment() {
  const texture = new THREE.DataTexture(new Uint8Array(128 * 64 * 4).fill(255), 128, 64);
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

export function createEnvironmentManager(scene, requestRender, {
  decode = decodeEnvironment, maxTextureSize = Infinity,
} = {}) {
  const white = whiteEnvironment();
  const background = new THREE.Color('#ffffff');
  const parameters = { intensity: 1, showBackground: true, brightness: 1, blur: 0, rotation: 0 };
  const state = { filename: '无贴图（纯白环境）', status: '就绪', kind: 'ready' };
  const listeners = new Set();
  let image = null;
  let materials = [];
  let generation = 0;
  let disposed = false;
  let abort = null;
  const notify = () => listeners.forEach((listener) => listener(state));

  function apply() {
    if (disposed) return;
    const texture = image ?? white;
    scene.environment = texture;
    scene.background = image && parameters.showBackground ? image : background;
    scene.backgroundIntensity = parameters.brightness;
    scene.backgroundBlurriness = parameters.blur;
    scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(parameters.rotation), 0);
    scene.environmentRotation.copy(scene.backgroundRotation);
    for (const { material, parameters: slot } of materials) {
      if (material.envMap !== texture) {
        material.envMap = texture;
        material.needsUpdate = true;
      }
      material.envMapRotation.copy(scene.environmentRotation);
      material.envMapIntensity = parameters.intensity * slot.envMapIntensity;
    }
    requestRender();
  }

  async function load(name, read) {
    if (disposed) return;
    const ticket = ++generation;
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    Object.assign(state, { status: `正在加载：${name}`, kind: 'loading' });
    notify();
    let texture;
    try {
      const buffer = await read(controller.signal);
      if (disposed || ticket !== generation) return;
      texture = await decode(buffer, name);
      if (disposed || ticket !== generation) { texture.dispose(); return; }
      if (texture.image.width > maxTextureSize || texture.image.height > maxTextureSize) {
        throw new Error(`图片尺寸超过当前设备上限 ${maxTextureSize} 像素。`);
      }
      const previous = image;
      image = texture;
      apply();
      previous?.dispose();
      const panoramic = Math.abs(texture.image.width / texture.image.height - 2) < 0.05;
      Object.assign(state, {
        filename: name, kind: 'ready',
        status: panoramic ? '加载完成' : '加载完成；建议使用 2:1 等距柱状全景图。',
      });
    } catch (error) {
      texture?.dispose();
      if (disposed || ticket !== generation) return;
      Object.assign(state, { status: `加载失败，保留当前环境。${error.message || '图片无法解码。'}`, kind: 'error' });
    } finally {
      if (!disposed && ticket === generation) { abort = null; notify(); }
    }
  }

  apply();
  return {
    parameters, state, apply,
    setMaterials(slots) { materials = slots; apply(); },
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    loadFile(file) { return load(file.name, () => file.arrayBuffer()); },
    loadBuiltin() {
      return load('citrus_orchard_road_puresky_4k.exr', async (signal) => {
        const response = await fetch(BUILTIN_URL, { signal });
        if (!response.ok) throw new Error(`内置贴图请求失败（${response.status}）。`);
        return response.arrayBuffer();
      });
    },
    clear() {
      if (disposed) return;
      generation++;
      abort?.abort(); abort = null;
      const previous = image; image = null;
      apply(); previous?.dispose();
      Object.assign(state, { filename: '无贴图（纯白环境）', status: '就绪', kind: 'ready' });
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++;
      abort?.abort();
      scene.background = null; scene.environment = null;
      for (const { material } of materials) material.envMap = null;
      materials = []; image?.dispose(); white.dispose(); listeners.clear();
    },
  };
}
