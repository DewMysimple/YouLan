import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../../source/threejs-transmission/examples/jsm/controls/OrbitControls.js';
import { UltraHDRLoader } from '../../source/threejs-transmission/examples/jsm/loaders/UltraHDRLoader.js';
import { GUI } from '../../source/threejs-transmission/examples/jsm/libs/lil-gui.module.min.js';

const MODEL_URL = '/models/specimen-frame.glb';
const HDR_URL = new URL(
  '../../source/threejs-transmission/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg',
  import.meta.url,
).href;

const OUTER_FRAME_NAME = 'SPECIMEN_OUTER_FRAME';
const INNER_PANEL_NAME = 'SPECIMEN_INNER_PANEL';

const DEFAULT_MATERIAL_PARAMETERS = Object.freeze({
  color: '#ffffff',
  transmission: 1,
  opacity: 1,
  metalness: 0,
  roughness: 0,
  ior: 1.5,
  thickness: 0.01,
  specularIntensity: 1,
  specularColor: '#ffffff',
  envMapIntensity: 1,
});

function createMaterialParameters() {
  return { ...DEFAULT_MATERIAL_PARAMETERS };
}

function createTransmissionMaterial(parameters, environmentTexture) {
  return new THREE.MeshPhysicalMaterial({
    color: parameters.color,
    transmission: parameters.transmission,
    opacity: parameters.opacity,
    metalness: parameters.metalness,
    roughness: parameters.roughness,
    ior: parameters.ior,
    thickness: parameters.thickness,
    specularIntensity: parameters.specularIntensity,
    specularColor: parameters.specularColor,
    envMap: environmentTexture,
    envMapIntensity: parameters.envMapIntensity,
    side: THREE.DoubleSide,
    transparent: true,
  });
}

function bindMaterialFolder(folder, parameters, material, requestRender) {
  folder
    .addColor(parameters, 'color')
    .name('颜色')
    .onChange((value) => {
      material.color.set(value);
      requestRender();
    });

  folder
    .add(parameters, 'transmission', 0, 1, 0.01)
    .name('透射率')
    .onChange((value) => {
      material.transmission = value;
      requestRender();
    });

  folder
    .add(parameters, 'opacity', 0, 1, 0.01)
    .name('不透明度')
    .onChange((value) => {
      material.opacity = value;
      requestRender();
    });

  folder
    .add(parameters, 'metalness', 0, 1, 0.01)
    .name('金属度')
    .onChange((value) => {
      material.metalness = value;
      requestRender();
    });

  folder
    .add(parameters, 'roughness', 0, 1, 0.01)
    .name('粗糙度')
    .onChange((value) => {
      material.roughness = value;
      requestRender();
    });

  folder
    .add(parameters, 'ior', 1, 2, 0.01)
    .name('折射率（IOR）')
    .onChange((value) => {
      material.ior = value;
      requestRender();
    });

  folder
    .add(parameters, 'thickness', 0, 5, 0.01)
    .name('厚度')
    .onChange((value) => {
      material.thickness = value;
      requestRender();
    });

  folder
    .add(parameters, 'specularIntensity', 0, 1, 0.01)
    .name('镜面反射强度')
    .onChange((value) => {
      material.specularIntensity = value;
      requestRender();
    });

  folder
    .addColor(parameters, 'specularColor')
    .name('镜面反射颜色')
    .onChange((value) => {
      material.specularColor.set(value);
      requestRender();
    });

  folder
    .add(parameters, 'envMapIntensity', 0, 1, 0.01)
    .name('环境贴图强度')
    .onChange((value) => {
      material.envMapIntensity = value;
      requestRender();
    });
}

function disposeObjectResources(root) {
  const geometries = new Set();
  const materials = new Set();

  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function replaceMaterial(mesh, material) {
  const previousMaterials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];

  previousMaterials.filter(Boolean).forEach((previousMaterial) => {
    previousMaterial.dispose();
  });

  mesh.material = material;
}

function frameModel(camera, controls, model) {
  // Blender 中框体正面朝向 X 轴。先把整个 GLTF 根节点转到 Three.js
  // 示例使用的标准 Y-up / Z 视线坐标系，OrbitControls 的水平和垂直
  // 拖动才会分别对应水平环绕与俯仰。
  model.rotation.y = -Math.PI / 2;
  model.updateMatrixWorld(true);

  const rotatedBounds = new THREE.Box3().setFromObject(model);
  const center = rotatedBounds.getCenter(new THREE.Vector3());

  model.position.sub(center);
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(
    Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.01),
  );
  const fitHeightDistance = size.y / (2 * Math.tan(verticalFov / 2));
  const fitWidthDistance = size.x / (2 * Math.tan(horizontalFov / 2));
  const fitDistance = Math.max(fitHeightDistance, fitWidthDistance);
  const cameraDistance = Math.max(fitDistance * 1.28, 1);

  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, cameraDistance);
  camera.near = Math.max(cameraDistance / 100, 0.01);
  camera.far = cameraDistance * 100;
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.minDistance = cameraDistance * 0.2;
  controls.maxDistance = cameraDistance * 8;
  controls.update();
}

function webGLUnavailableMessage() {
  return '当前浏览器或设备无法创建 WebGL 场景。';
}

export function createSpecimenViewer(container, { onError } = {}) {
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    const webGLError = new Error(webGLUnavailableMessage(), { cause: error });
    console.error(webGLError);
    onError?.(webGLError);
    return () => {};
  }

  let disposed = false;
  let renderFrame = 0;
  let gui = null;
  let loadedModel = null;
  let environmentTexture = null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.transmissionResolutionScale = 1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    40,
    Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
    0.1,
    1000,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;

  const requestRender = () => {
    if (disposed || renderFrame) return;

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      if (!disposed) renderer.render(scene, camera);
    });
  };

  controls.addEventListener('change', requestRender);

  const resizeObserver = new ResizeObserver(() => {
    if (disposed) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  });

  resizeObserver.observe(container);

  const loadScene = async () => {
    const [loadedEnvironment, gltf] = await Promise.all([
      new UltraHDRLoader().loadAsync(HDR_URL),
      new GLTFLoader().loadAsync(MODEL_URL),
    ]);

    if (disposed) {
      loadedEnvironment.dispose();
      disposeObjectResources(gltf.scene);
      return;
    }

    environmentTexture = loadedEnvironment;
    environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = environmentTexture;
    scene.environment = environmentTexture;

    const outerFrame = gltf.scene.getObjectByName(OUTER_FRAME_NAME);
    const innerPanel = gltf.scene.getObjectByName(INNER_PANEL_NAME);
    const missingObjects = [];

    if (!outerFrame?.isMesh) missingObjects.push(OUTER_FRAME_NAME);
    if (!innerPanel?.isMesh) missingObjects.push(INNER_PANEL_NAME);

    if (missingObjects.length) {
      loadedEnvironment.dispose();
      environmentTexture = null;
      disposeObjectResources(gltf.scene);
      throw new Error(`模型缺少目标网格：${missingObjects.join('、')}`);
    }

    const outerParameters = createMaterialParameters();
    const innerParameters = createMaterialParameters();
    const outerMaterial = createTransmissionMaterial(
      outerParameters,
      environmentTexture,
    );
    const innerMaterial = createTransmissionMaterial(
      innerParameters,
      environmentTexture,
    );

    replaceMaterial(outerFrame, outerMaterial);
    replaceMaterial(innerPanel, innerMaterial);

    loadedModel = gltf.scene;
    scene.add(loadedModel);
    frameModel(camera, controls, loadedModel);

    gui = new GUI({ title: '材质参数', width: 300 });

    const outerFolder = gui.addFolder('外框材质');
    bindMaterialFolder(
      outerFolder,
      outerParameters,
      outerMaterial,
      requestRender,
    );

    const innerFolder = gui.addFolder('内板材质');
    bindMaterialFolder(
      innerFolder,
      innerParameters,
      innerMaterial,
      requestRender,
    );

    const renderParameters = {
      exposure: 1,
      transmissionResolutionScale: 1,
    };
    const renderFolder = gui.addFolder('渲染设置');

    renderFolder
      .add(renderParameters, 'exposure', 0, 1, 0.01)
      .name('曝光')
      .onChange((value) => {
        renderer.toneMappingExposure = value;
        requestRender();
      });

    renderFolder
      .add(renderParameters, 'transmissionResolutionScale', 0.01, 1, 0.01)
      .name('透射分辨率比例')
      .onChange((value) => {
        renderer.transmissionResolutionScale = value;
        requestRender();
      });

    requestRender();
  };

  loadScene().catch((error) => {
    if (disposed) return;

    console.error('幽兰标本框场景加载失败：', error);
    onError?.(
      error instanceof Error
        ? error
        : new Error('场景加载失败，请检查浏览器控制台。'),
    );
  });

  requestRender();

  return () => {
    if (disposed) return;
    disposed = true;

    if (renderFrame) window.cancelAnimationFrame(renderFrame);
    resizeObserver.disconnect();
    controls.removeEventListener('change', requestRender);
    controls.dispose();
    gui?.destroy();

    if (loadedModel) {
      scene.remove(loadedModel);
      disposeObjectResources(loadedModel);
    }

    scene.background = null;
    scene.environment = null;
    environmentTexture?.dispose();

    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
