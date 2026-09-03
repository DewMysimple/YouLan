import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../../source/threejs-transmission/examples/jsm/controls/OrbitControls.js';
import { GUI } from '../../source/threejs-transmission/examples/jsm/libs/lil-gui.module.min.js';
import { prepareSpecimenMesh } from './specimenModel.js';
import { createEnvironmentManager } from './environmentManager.js';
import { bindEnvironmentPanel, bindArrayPanel, bindSlicePanel } from './viewerPanels.js';
import { fitArray } from './arrayModifier.js';
import { createSliceAccumulation } from './sliceAccumulation.js';
import { createLocalEmission } from './localEmission.js';
import { createSelectiveBloom } from './selectiveBloom.js';
import { bindDepthPresentation, DEPTH_ENVIRONMENT } from './depthPresentation.js';

const MODEL_URL = '/models/specimen-frame.glb';

const DEFAULT_MATERIAL_PARAMETERS = Object.freeze({
  color: '#ffffff',
  emissive: '#ffffff',
  emissiveIntensity: 0,
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

function createMaterialParameters(sourceMaterial) {
  // GLTFLoader 已读取线性 Base Color；转为 GUI 使用的 sRGB 字符串。
  // 仅继承颜色，物理参数继续使用本地 Transmission 示例的现有默认值。
  return { ...DEFAULT_MATERIAL_PARAMETERS, color: `#${sourceMaterial.color.getHexString()}` };
}

function createTransmissionMaterial(parameters, environmentTexture) {
  return new THREE.MeshPhysicalMaterial({
    color: parameters.color,
    emissive: parameters.emissive,
    emissiveIntensity: parameters.emissiveIntensity,
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

function bindMaterialFolder(folder, parameters, material, requestRender, updateEnvironment) {
  folder
    .addColor(parameters, 'color')
    .name('颜色')
    .onChange((value) => {
      material.color.set(value);
      requestRender();
    });

  // Native MeshPhysicalMaterial inherits these from MeshStandardMaterial:
  // https://threejs.org/docs/pages/MeshStandardMaterial.html#emissive
  folder
    .addColor(parameters, 'emissive')
    .name('自发光颜色')
    .onChange((value) => {
      material.emissive.set(value);
      requestRender();
    });

  folder
    .add(parameters, 'emissiveIntensity', 0, 10, 0.01)
    .name('自发光强度')
    .onChange((value) => {
      material.emissiveIntensity = value;
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
    .onChange(updateEnvironment);
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

  new Set(previousMaterials.filter(Boolean)).forEach((previousMaterial) => {
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
  let disposeEnvironmentPanel = null;
  let disposeArrayPanel = null;
  let localEmission = null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.transmissionResolutionScale = 1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const camera = new THREE.PerspectiveCamera(
    40,
    Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
    0.1,
    1000,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  const slices = createSliceAccumulation(renderer);
  const bloom = createSelectiveBloom(renderer, slices.render);

  const requestRender = () => {
    if (disposed || renderFrame) return;

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      if (!disposed) bloom.render(scene, camera);
    });
  };

  controls.addEventListener('change', requestRender);
  const environment = createEnvironmentManager(scene, requestRender, {
    maxTextureSize: renderer.capabilities.maxTextureSize,
  });
  gui = new GUI({ title: '材质参数', width: 300 });
  disposeEnvironmentPanel = bindEnvironmentPanel(gui, environment);
  Object.assign(environment.parameters, DEPTH_ENVIRONMENT);
  environment.apply();
  void environment.loadBuiltin();

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
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);

    if (disposed) {
      disposeObjectResources(gltf.scene);
      return;
    }

    let specimenMesh;
    try {
      specimenMesh = prepareSpecimenMesh(gltf.scene);
    } catch (error) {
      disposeObjectResources(gltf.scene);
      throw error;
    }

    const outerParameters = createMaterialParameters(specimenMesh.material[0]);
    const innerParameters = createMaterialParameters(specimenMesh.material[1]);
    const outerMaterial = createTransmissionMaterial(
      outerParameters,
      scene.environment,
    );
    const innerMaterial = createTransmissionMaterial(
      innerParameters,
      scene.environment,
    );

    outerMaterial.name = '外框插槽';
    innerMaterial.name = '内框插槽';
    replaceMaterial(specimenMesh, [outerMaterial, innerMaterial]);

    loadedModel = gltf.scene;
    scene.add(loadedModel);
    frameModel(camera, controls, loadedModel);
    localEmission = createLocalEmission(specimenMesh);
    slices.attach(specimenMesh);
    bloom.attach(specimenMesh);

    environment.setMaterials([
      { material: outerMaterial, parameters: outerParameters },
      { material: innerMaterial, parameters: innerParameters },
    ]);
    disposeArrayPanel = bindArrayPanel(gui, specimenMesh, requestRender, () => {
      fitArray(camera, controls, loadedModel);
      requestRender();
    });

    const outerFolder = gui.addFolder('外框插槽管理');
    bindMaterialFolder(
      outerFolder,
      outerParameters,
      outerMaterial,
      requestRender,
      environment.apply,
    );

    const innerFolder = gui.addFolder('内框插槽管理');
    bindMaterialFolder(
      innerFolder,
      innerParameters,
      innerMaterial,
      requestRender,
      environment.apply,
    );

    const renderParameters = {
      exposure: 1,
      transmissionResolutionScale: 1,
    };
    const renderFolder = gui.addFolder('渲染设置');
    bindSlicePanel(renderFolder, slices, requestRender);
    outerFolder.close();
    innerFolder.close();
    renderFolder.close();

    renderFolder
      .add(renderParameters, 'exposure', 0, 2, 0.01)
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

    [outerFolder, innerFolder].forEach((folder, slot) => {
      folder.add(localEmission.parameters[slot], 'localized').name('仅局部光纹发光')
        .onChange(() => { localEmission.apply(); requestRender(); });
    });
    bindDepthPresentation(gui, { camera, controls, array: disposeArrayPanel,
      slots: [{ material: outerMaterial, parameters: outerParameters }, { material: innerMaterial, parameters: innerParameters }],
      slices, bloom, emission: localEmission, environment, renderer, renderParameters, requestRender });
    gui.folders.filter(folder => folder._title !== '深邃效果').forEach(folder => folder.close());
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
    disposeArrayPanel?.();
    disposeEnvironmentPanel?.();
    bloom.dispose();
    slices.dispose();
    localEmission?.dispose();
    environment.dispose();
    gui?.destroy();

    if (loadedModel) {
      scene.remove(loadedModel);
      disposeObjectResources(loadedModel);
    }

    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
