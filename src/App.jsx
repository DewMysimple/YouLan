import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DEFAULT_MODEL_URL = '/models/Specimen_Frame_Transparent_Merged.glb';
const ENVIRONMENT_URL = '/environments/Specimen_Frame_Studio.exr';

function disposeModel(root) {
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (!object.isMesh) return;

    object.geometry?.dispose();
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    objectMaterials.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);

      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
      material.dispose();
    });
  });

  textures.forEach((texture) => texture.dispose());
}

function frameModel(root, camera, controls) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.001);

  root.position.sub(center);
  controls.target.set(0, 0, 0);

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(
    Math.tan(verticalFov * 0.5) * Math.max(camera.aspect, 0.01),
  );
  const fitWidthDistance = (size.x * 0.5) / Math.tan(horizontalFov * 0.5);
  const fitHeightDistance = (size.y * 0.5) / Math.tan(verticalFov * 0.5);
  const fitDepthDistance = (size.z * 0.5) / Math.tan(verticalFov * 0.5);
  const tunnelEntranceDistance = Math.max(fitHeightDistance, fitDepthDistance, 0.001) * 1.25;
  const distance = Math.max(fitWidthDistance, fitHeightDistance, fitDepthDistance, 0.001);

  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = Math.max(radius * 8, camera.near + 1);
  camera.position.set(-size.x * 0.5 - tunnelEntranceDistance, 0, 0);
  camera.lookAt(0, 0, 0);

  controls.minDistance = Math.max(radius * 0.02, 0.001);
  controls.maxDistance = Math.max(radius * 20, distance * 3);
  controls.update();

  return size;
}

function styleMaterialForReference(material) {
  if (!material) return;

  const isInnerPanel = /innerpanel|lavender/i.test(material.name);
  const tint = isInnerPanel ? '#d4a4ff' : '#f5efff';
  const attenuation = isInnerPanel ? '#bb83ff' : '#e9dcff';

  material.color.set(tint);
  material.transparent = true;
  // Three.js recommends opacity=1 when transmission is enabled. The physical
  // transmission shader then derives the glass alpha from the refracted view.
  material.opacity = 1;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.NormalBlending;

  if ('metalness' in material) material.metalness = 0.02;
  if ('roughness' in material) material.roughness = isInnerPanel ? 0.1 : 0.055;
  if ('transmission' in material) material.transmission = isInnerPanel ? 0.72 : 0.84;
  if ('ior' in material) material.ior = 1.45;
  if ('thickness' in material) material.thickness = isInnerPanel ? 0.26 : 0.18;
  if ('clearcoat' in material) material.clearcoat = 0.86;
  if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.045;
  if ('envMapIntensity' in material) material.envMapIntensity = isInnerPanel ? 1.8 : 2.05;
  if ('iridescence' in material) material.iridescence = isInnerPanel ? 0.52 : 0.42;
  if ('iridescenceIOR' in material) material.iridescenceIOR = 1.45;
  if ('iridescenceThicknessRange' in material) {
    material.iridescenceThicknessRange = isInnerPanel ? [180, 520] : [100, 380];
  }
  if ('attenuationColor' in material) material.attenuationColor.set(attenuation);
  if ('attenuationDistance' in material) material.attenuationDistance = isInnerPanel ? 0.7 : 1.1;
  if ('emissive' in material) material.emissive.set(isInnerPanel ? '#b26ee8' : '#ded2ff');
  if ('emissiveIntensity' in material) material.emissiveIntensity = isInnerPanel ? 0.055 : 0.018;
  if ('sheen' in material) material.sheen = 0.22;
  if ('sheenColor' in material) material.sheenColor.set(isInnerPanel ? '#f3dfff' : '#ffffff');

  addPastelGlassGradient(material, isInnerPanel, material.userData.tunnelDepthSpan ?? 748.8612);

  material.needsUpdate = true;
}

function addPastelGlassGradient(material, isInnerPanel, depthSpan) {
  const colors = isInnerPanel
    ? ['#f0d7ff', '#c68be8', '#704398']
    : ['#f8f5ff', '#d5c7e8', '#9b8caf'];
  const halfDepth = Math.max(depthSpan, 1) * 0.5;

  material.customProgramCacheKey = () => `pastel-glass-${isInnerPanel ? 'inner' : 'outer'}-${halfDepth.toFixed(3)}-v2`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pastelColorA = { value: new THREE.Color(colors[0]) };
    shader.uniforms.pastelColorB = { value: new THREE.Color(colors[1]) };
    shader.uniforms.pastelColorC = { value: new THREE.Color(colors[2]) };
    shader.uniforms.pastelDepthHalf = { value: halfDepth };

    shader.vertexShader = `
      varying vec3 vPastelWorldPosition;
      ${shader.vertexShader}
    `.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n      vPastelWorldPosition = worldPosition.xyz;',
    );

    shader.fragmentShader = `
      uniform vec3 pastelColorA;
      uniform vec3 pastelColorB;
      uniform vec3 pastelColorC;
      uniform float pastelDepthHalf;
      varying vec3 vPastelWorldPosition;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float pastelT = clamp((vPastelWorldPosition.x + pastelDepthHalf) / (pastelDepthHalf * 2.0), 0.0, 1.0);
      vec3 pastelGradient = mix(
        mix(pastelColorA, pastelColorB, smoothstep(0.0, 0.58, pastelT)),
        pastelColorC,
        smoothstep(0.46, 1.0, pastelT)
      );
      diffuseColor.rgb = mix(diffuseColor.rgb, pastelGradient, 0.88);
      diffuseColor.a *= mix(0.82, 0.98, smoothstep(0.0, 0.85, pastelT));`,
    );

    material.userData.pastelGlassShader = shader;
  };
}

function styleModelMaterials(root, depthSpan) {
  root.traverse((object) => {
    if (!object.isMesh) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      if (material) material.userData.tunnelDepthSpan = depthSpan;
      styleMaterialForReference(material);
    });
  });
}

export function ModelViewer({ modelUrl = DEFAULT_MODEL_URL }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    mount.dataset.viewerStatus = 'initializing';

    let disposed = false;
    let animationFrame = 0;
    let modelRoot = null;
    let environmentTarget = null;
    let environmentSource = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.environmentIntensity = 0.85;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '三维模型查看器');
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);

    const hemisphereLight = new THREE.HemisphereLight(0xfff7ff, 0xece5ff, 0.32);
    const keyLight = new THREE.DirectionalLight(0xffe8fb, 0.82);
    keyLight.position.set(-3, 5, 6);
    const warmLight = new THREE.DirectionalLight(0xffefb8, 0.42);
    warmLight.position.set(5, -1, 3);
    const rimLight = new THREE.DirectionalLight(0xbba0ff, 0.55);
    rimLight.position.set(-4, 1, -6);
    scene.add(hemisphereLight, keyLight, warmLight, rimLight);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const environmentLoader = new EXRLoader();
    mount.dataset.environmentStatus = 'loading';
    environmentLoader.load(
      ENVIRONMENT_URL,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }

        environmentSource = texture;
        environmentTarget = pmremGenerator.fromEquirectangular(texture);
        scene.environment = environmentTarget.texture;
        texture.dispose();
        environmentSource = null;
        mount.dataset.environmentStatus = 'ready';
      },
      undefined,
      (error) => {
        if (!disposed) {
          mount.dataset.environmentStatus = 'error';
          console.warn(`Unable to load environment: ${ENVIRONMENT_URL}`, error);
        }
      },
    );

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reduceMotion;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 0);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    mount.dataset.viewerStatus = 'loading';

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }

        modelRoot = gltf.scene;
        scene.add(modelRoot);
        const modelSize = frameModel(modelRoot, camera, controls);
        styleModelMaterials(modelRoot, modelSize?.x);
        mount.dataset.viewerStatus = 'ready';
      },
      undefined,
      (error) => {
        if (!disposed) {
          mount.dataset.viewerStatus = 'error';
          console.error(`Unable to load model: ${modelUrl}`, error);
        }
      },
    );

    const render = () => {
      if (disposed) return;
      animationFrame = window.requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      if (modelRoot) disposeModel(modelRoot);
      environmentTarget?.dispose();
      environmentSource?.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl]);

  return <div className="viewer-shell" ref={mountRef} />;
}

export default function App() {
  return (
    <main className="app-shell">
      <ModelViewer />
    </main>
  );
}
