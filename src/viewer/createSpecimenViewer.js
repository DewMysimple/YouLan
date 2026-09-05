import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from '../../source/threejs-transmission/examples/jsm/controls/OrbitControls.js';
import { GUI } from '../../source/threejs-transmission/examples/jsm/libs/lil-gui.module.min.js';
import { prepareSpecimenMesh } from './specimenModel.js';
import { createEnvironmentManager } from './environmentManager.js';
import { bindEnvironmentPanel, bindSlicePanel } from './viewerPanels.js';
import { createDepthStack } from './depthStack.js';
import { organizeViewerPanel } from './panelOrganization.js';
import { fitArray } from './arrayModifier.js';
import { createSliceAccumulation } from './sliceAccumulation.js';
import { createLocalEmission } from './localEmission.js';
import { createEmbeddedCore } from './embeddedCore.js';
import { createSoftEdges } from './softEdges.js';
import { createSelectiveBloom } from './selectiveBloom.js';
import { bindDepthPresentation, DEPTH_ENVIRONMENT } from './depthPresentation.js';
import { createDreamAtmosphere, bindAtmospherePanel } from './dreamAtmosphere.js';
import { createTransparentOrdering } from './transparentOrdering.js';
import { createPointerParallax, bindPointerParallaxPanel } from './pointerParallax.js';
import { createPollenScene, bindPollenPanel } from './pollenScene.js';
import { createFireworkScene, bindFireworkPanel } from './fireworkExperience.js';
import { createFireworkPost } from './fireworkPost.js';
import { createSceneSwitcher } from './sceneSwitcher.js';
import { createInfiniteBloomScene, bindInfiniteBloomPanel } from './infiniteBloomScene.js';
import { createPaperOrbitScene, bindPaperOrbitPanel } from './paperOrbitScene.js';
import { createButterflyScene, bindButterflyPanel } from './butterflyScene.js';
import { createDappledLightScene, bindDappledLightPanel } from './dappledLightScene.js';
import { createDepthGalleryScene, bindDepthGalleryPanel } from './depthGalleryScene.js';

import { createSketchbookScene, bindSketchbookPanel } from './sketchbookScene.jsx';

const MODEL_URL = '/models/specimen-frame.glb';

const DEFAULT_MATERIAL_PARAMETERS = Object.freeze({
  color: '#ffffff',
  emissive: '#ffffff',
  emissiveIntensity: 0,
  transmission: 1,
  opacity: 1,
  depthWrite: true,
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
    depthWrite: parameters.depthWrite,
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
  folder.add(parameters, 'depthWrite').name('写入深度（遮挡后层）').onChange(value => {
    material.depthWrite = value; requestRender();
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
  let depthStack = null;
  let localEmission = null;
  let embeddedCore = null;
  let softEdges = null;
  let transparentOrdering = null;
  let refreshAtmospherePanel = null;
  let pointerParallax = null;
  let pollen = null;
  let firework = null;
  let fireworkPost = null;
  let flower = null;
  let paper = null;
  let butterfly = null;
  let butterflyAtmosphere = null;
  let butterflyBloom = null;
  let dappled = null;
  let gallery = null;
  let sketchbook = null;
  let sceneSwitcher = null;
  let disposePollenBackdrop = null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.transmissionResolutionScale = 1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.name = '场景1·标本纵深';
  scene.background = new THREE.Color('#ffffff');
  const pollenScene = new THREE.Scene();
  pollenScene.name = '场景2·花粉星云';
  pollenScene.background = new THREE.Color('#ffffff');
  const fireworkScene = new THREE.Scene();
  fireworkScene.name = '场景3·指尖花火';
  fireworkScene.background = new THREE.Color('#000000');
  const flowerScene = new THREE.Scene();
  flowerScene.name = '场景4·无限花开';
  flowerScene.background = new THREE.Color('#080914');
  const paperScene = new THREE.Scene();
  paperScene.name = '场景5·纸飞机环游';
  const butterflyScene = new THREE.Scene();
  butterflyScene.name = '场景6·蝶翼';
  const dappledScene = new THREE.Scene();
  dappledScene.name = '场景7·斑驳光影';
  const galleryScene = new THREE.Scene();
  galleryScene.name = '场景8·纵深花廊';
  const sketchbookScene = { visible: false }; // DOM scene: no extra renderer or canvas.
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
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const atmosphere = createDreamAtmosphere(scene, camera, slices, { reducedMotion: motionPreference.matches });
  bloom.setAtmosphere(atmosphere);

  const requestRender = () => {
    if (disposed || renderFrame || document.hidden) return;

    renderFrame = window.requestAnimationFrame((timestamp) => {
      renderFrame = 0;
      if (!disposed) {
        const activeSceneId = sceneSwitcher?.activeId ?? 'specimen';
        if (!['specimen', 'pollen'].includes(activeSceneId)) atmosphere.pauseClock();
        if (activeSceneId !== 'butterfly') butterflyAtmosphere?.pauseClock();
        if (activeSceneId === 'specimen') depthStack?.flush();
        const cinematicCamera = activeSceneId === 'paper' && paper?.ownsCamera;
        const screenSpace = ['dappled', 'firework', 'gallery', 'sketchbook'].includes(activeSceneId);
        const parallaxAnimated = cinematicCamera || screenSpace ? false : pointerParallax?.update(timestamp) ?? false;
        if (!cinematicCamera && !screenSpace) pointerParallax?.apply();
        let atmosphereAnimated = false;
        let pollenAnimated = false;
        let fireworkAnimated = false;
        let flowerAnimated = false;
        let paperAnimated = false;
        let butterflyAnimated = false;
        let dappledAnimated = false;
        let galleryAnimated = false;
        try {
          if (activeSceneId === 'specimen') {
            atmosphereAnimated = atmosphere.update(timestamp, !document.hidden);
            depthStack?.updateCameraClip(camera);
            embeddedCore?.update();
            softEdges?.update();
            transparentOrdering?.update(camera);
            atmosphere.renderWithBackground(() => bloom.render(scene, camera), scene);
          } else if (activeSceneId === 'pollen') {
            atmosphereAnimated = atmosphere.updateBackground(timestamp, !document.hidden);
            pollenAnimated = pollen?.update(timestamp, !document.hidden) ?? false;
            atmosphere.renderWithBackground(() => renderer.render(pollenScene, camera), pollenScene);
          } else if (activeSceneId === 'firework') {
            fireworkAnimated = firework?.update(timestamp, !document.hidden) ?? false;
            fireworkPost?.render();
          } else if (activeSceneId === 'flower') {
            flowerAnimated = flower?.update(timestamp, !document.hidden) ?? false;
            renderer.render(flowerScene, camera);
          } else if (activeSceneId === 'butterfly') {
            butterflyAnimated = butterfly?.update(timestamp, !document.hidden) ?? false;
            atmosphereAnimated = butterflyAtmosphere.update(timestamp, !document.hidden);
            butterflyAtmosphere.renderWithBackground(() => butterflyBloom.render(butterflyScene, camera));
          } else if (activeSceneId === 'paper') {
            paperAnimated = paper?.update(timestamp, !document.hidden) ?? false;
            renderer.render(paperScene, camera);
          } else if (activeSceneId === 'dappled') {
            dappledAnimated = dappled?.update(timestamp, !document.hidden) ?? false;
            dappled?.render();
          } else if (activeSceneId === 'gallery') {
            galleryAnimated = gallery?.update(timestamp, !document.hidden) ?? false;
            gallery?.render();
          }
        } finally {
          pointerParallax?.restoreCamera();
        }
        if (atmosphereAnimated || pollenAnimated || fireworkAnimated || flowerAnimated || paperAnimated || butterflyAnimated || dappledAnimated || galleryAnimated || parallaxAnimated) requestRender();
      }
    });
  };
  pointerParallax = createPointerParallax(camera, controls, renderer.domElement, requestRender, {
    reducedMotion: motionPreference.matches,
  });
  pollen = createPollenScene(pollenScene, renderer, requestRender, {
    reducedMotion: motionPreference.matches,
  });
  firework = createFireworkScene(fireworkScene, renderer, requestRender, {
    reducedMotion: motionPreference.matches,
    camera, controls,
  });
  firework.setSize(container.clientWidth, container.clientHeight);
  flower = createInfiniteBloomScene(flowerScene, renderer, requestRender, {
    reducedMotion: motionPreference.matches,
  });
  paper = createPaperOrbitScene(paperScene, requestRender, {
    reducedMotion: motionPreference.matches, camera, controls,
    resetParallax: () => pointerParallax.resetInput({ immediate: true, clearOrigin: true }),
  });
  butterfly = createButterflyScene(butterflyScene, requestRender, { reducedMotion: motionPreference.matches });
  butterflyAtmosphere = createDreamAtmosphere(butterflyScene, camera, null, {
    reducedMotion: motionPreference.matches, sharedAtmosphere: atmosphere,
    subject: butterfly.root.getObjectByName('蝴蝶水平迎光'),
  });
  butterflyBloom = createSelectiveBloom(renderer, (targetScene, targetCamera) => renderer.render(targetScene, targetCamera));
  butterflyBloom.setAtmosphere(butterflyAtmosphere);
  dappled = createDappledLightScene(dappledScene, renderer, requestRender, {
    reducedMotion: motionPreference.matches,
  });
  dappled.setSize(container.clientWidth, container.clientHeight);
  gallery = createDepthGalleryScene(galleryScene, renderer, requestRender, { reducedMotion: motionPreference.matches });
  gallery.setSize(container.clientWidth, container.clientHeight);
  sketchbook = createSketchbookScene(container, { reducedMotion: motionPreference.matches });
  fireworkPost = createFireworkPost(
    renderer,
    fireworkScene,
    camera,
    () => firework.parameters,
    () => firework.renderScale,
  );
  fireworkPost.setSize(
    Math.max(container.clientWidth, 1),
    Math.max(container.clientHeight, 1),
    Math.min(window.devicePixelRatio, 2),
  );
  disposePollenBackdrop = atmosphere.createSharedBackdrop(pollenScene);
  const visibilityChange = () => {
    atmosphere.pauseClock();
    butterflyAtmosphere.pauseClock();
    pointerParallax.pauseClock();
    pollen.pauseClock();
    firework.pauseClock();
    flower.pauseClock();
    paper.pauseClock();
    butterfly.pauseClock();
    dappled.pauseClock();
    gallery.pauseClock();
    sketchbook.pauseClock();
    sceneSwitcher?.pauseClock();
    if (document.hidden) pointerParallax.resetInput({ immediate: true });
    if (document.hidden && renderFrame) { window.cancelAnimationFrame(renderFrame); renderFrame = 0; }
    if (!document.hidden) requestRender();
  };
  const motionChange = () => {
    atmosphere.setReducedMotion(motionPreference.matches);
    pointerParallax.setReducedMotion(motionPreference.matches);
    sceneSwitcher?.setReducedMotion(motionPreference.matches);
    gui?.controllersRecursive().forEach(c => c.updateDisplay());
    requestRender();
  };
  document.addEventListener('visibilitychange', visibilityChange);
  motionPreference.addEventListener('change', motionChange);

  controls.addEventListener('change', requestRender);
  const environment = createEnvironmentManager([scene, pollenScene, fireworkScene, flowerScene, paperScene, butterflyScene], requestRender, {
    maxTextureSize: renderer.capabilities.maxTextureSize,
  });
  gui = new GUI({ title: '场景参数', width: 310 });
  bindPointerParallaxPanel(gui, pointerParallax, requestRender);
  disposeEnvironmentPanel = bindEnvironmentPanel(gui, environment, () => {
    atmosphere.parameters.background = 'HDRI / 纯白';
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    refreshAtmospherePanel?.();
    requestRender();
  });
  Object.assign(environment.parameters, DEPTH_ENVIRONMENT);
  environment.apply();
  void environment.loadBuiltin();

  const resizeObserver = new ResizeObserver(() => {
    if (disposed) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    fireworkPost?.setSize(width, height, Math.min(window.devicePixelRatio, 2));
    firework?.setSize(width, height);
    dappled?.setSize(width, height);
    gallery?.setSize(width, height);
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
    embeddedCore = createEmbeddedCore(specimenMesh);
    slices.setCore(embeddedCore);
    softEdges = createSoftEdges(specimenMesh, embeddedCore, renderer);
    bloom.attach(specimenMesh);
    atmosphere.attach(specimenMesh);
    transparentOrdering = createTransparentOrdering(specimenMesh);

    environment.setMaterials([
      { material: outerMaterial, parameters: outerParameters },
      { material: innerMaterial, parameters: innerParameters },
    ]);
    depthStack = createDepthStack(specimenMesh, requestRender);

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
    renderFolder.add(embeddedCore.parameters, 'enabled').name('内嵌色体透射').onChange(requestRender);
    renderFolder.add(softEdges.parameters, 'strength', 0, 1, 0.01).name('轮廓清晰度').onChange(requestRender);
    renderFolder.add(softEdges.parameters, 'width', 0.5, 2, 0.1).name('轮廓宽度（像素）').onChange(requestRender);
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
    bindDepthPresentation(gui, { camera, controls, stack: depthStack,
      fitAll: () => { depthStack.flush(); fitArray(camera, controls, loadedModel); requestRender(); },
      slots: [{ material: outerMaterial, parameters: outerParameters }, { material: innerMaterial, parameters: innerParameters }],
      slices, bloom, embeddedCore, softEdges, atmosphere, parallax: pointerParallax, emission: localEmission, environment, renderer, renderParameters, requestRender });
    refreshAtmospherePanel = bindAtmospherePanel(gui, atmosphere, requestRender);
    const pollenFolder = bindPollenPanel(gui, pollen, requestRender);
    const fireworkFolder = bindFireworkPanel(gui, firework, requestRender);
    const flowerFolder = bindInfiniteBloomPanel(gui, flower, requestRender);
    const paperFolder = bindPaperOrbitPanel(gui, paper);
    const butterflyFolder = bindButterflyPanel(gui, butterfly);
    const dappledFolder = bindDappledLightPanel(gui, dappled, requestRender);
    const galleryFolder = bindDepthGalleryPanel(gui, gallery, requestRender);
    const sketchbookFolder = bindSketchbookPanel(gui, sketchbook);
    const specimenFolders = ['深邃效果', '外框插槽管理', '内框插槽管理', '渲染设置']
      .map((title) => gui.folders.find((folder) => folder._title === title));
    sceneSwitcher = createSceneSwitcher(gui, {
      camera,
      controls,
      parallax: pointerParallax,
      requestRender,
      specimenScene: scene,
      pollenScene,
      pollen,
      fireworkScene,
      firework,
      flowerScene,
      flower,
      paperScene,
      paper,
      butterflyScene,
      butterfly,
      dappledScene,
      dappled,
      galleryScene,
      gallery,
      sketchbookScene, sketchbook,
      specimenFolders,
      pollenFolders: [pollenFolder],
      fireworkFolders: [fireworkFolder],
      flowerFolders: [flowerFolder],
      paperFolders: [paperFolder],
      butterflyFolders: [butterflyFolder],
      dappledFolders: [dappledFolder],
      galleryFolders: [galleryFolder],
      sketchbookFolders: [sketchbookFolder],
      worldFolders: ['梦境背景与迎光', '指针视差', 'HDRI 环境设置']
        .map(title => gui.folders.find(folder => folder._title === title)),
    });
    organizeViewerPanel(gui);
    gui.folders.filter(folder => !['场景选择', '深邃效果'].includes(folder._title)).forEach(folder => folder.close());
    // A shareable local preview opens the requested scene without changing startup.
    const preview = new URLSearchParams(window.location.search).get('scene');
    if (preview === 'paper' || preview === 'butterfly') {
      sceneSwitcher.switchTo(preview);
      (preview === 'paper' ? paperFolder : butterflyFolder).open();
    }
    if (['dappled', '7'].includes(preview)) {
      sceneSwitcher.switchTo('dappled');
      dappledFolder.open();
    }
    if (['firework', '3'].includes(preview)) {
      sceneSwitcher.switchTo('firework');
      fireworkFolder.open();
    }
    if (['sketchbook', '9'].includes(preview)) {
      sceneSwitcher.switchTo('sketchbook');
      sketchbookFolder.open();
    }
    if (['gallery', '8'].includes(preview)) {
      sceneSwitcher.switchTo('gallery');
      galleryFolder.open();
    }
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
    document.removeEventListener('visibilitychange', visibilityChange);
    motionPreference.removeEventListener('change', motionChange);
    controls.removeEventListener('change', requestRender);
    controls.dispose();
    pointerParallax.dispose();
    sceneSwitcher?.dispose();
    depthStack?.dispose();
    disposeEnvironmentPanel?.();
    bloom.dispose();
    butterflyBloom.dispose();
    butterflyAtmosphere.dispose();
    transparentOrdering?.dispose();
    atmosphere.dispose();
    disposePollenBackdrop?.();
    pollen.dispose();
    fireworkPost?.dispose();
    firework.dispose();
    flower.dispose();
    paper.dispose();
    butterfly.dispose();
    dappled.dispose();
    gallery.dispose();
    sketchbook.dispose();
    softEdges?.dispose();
    embeddedCore?.dispose();
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
