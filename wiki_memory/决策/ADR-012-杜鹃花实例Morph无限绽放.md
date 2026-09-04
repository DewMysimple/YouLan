---
type: decision
status: active
kind: architecture
importance: high
updated: 2026-09-04
topic: instanced-azalea-infinite-bloom
source_logs:
  - "[[日志/2026-09-04-实现隔离杜鹃花无限绽放场景]]"
supersedes: null
---

# ADR-012｜杜鹃花实例 Morph 无限绽放

## 用户指定方向

以 `source/杜鹃花_形态1.blend` 为真实花材，在同一开发页面增加隔离场景4“无限花开”；参考 WebGPU 无限花开案例，但优先维持现有场景、HDRI 和 WebGL 管线稳定。

## 当前约定

- 场景4使用独立 `THREE.Scene`、独立动态花园背景和独立相机状态；与场景1–3不共享专属几何或动画状态。
- 不为效果本身迁移整个查看器到 WebGPU。官方 `InstancedMesh.setMorphAt()` 已能在 WebGL 中为每个实例保存独立 Morph 权重，而现有 `ShaderMaterial`、`EffectComposer` 与 `UnrealBloomPass` 若迁移 WebGPU 需要改写为 TSL 和新后处理栈。
- Blender 后台导出按连通区域识别五片主花瓣，把花冠与枝叶/花蕊拆成两个运行时网格；花冠增加 `Closed` Morph Target。源文件不保存、不写回。
- 一个完整五瓣花冠作为一个 `InstancedMesh` 实例，最多 12 代。各代按错相位只做花苞到盛放的正向展开；退场时保持盛放形态并缩小，不倒放闭合，然后循环复用。
- 运行时保留源 2K 颜色、法线和粗糙度纹理，另带 2K 次表面遮罩。花瓣使用 `MeshPhysicalMaterial`、HDRI、暖色主光、冷色轮廓光和基于源颜色遮罩的轻量次表面散射扩展。
- HDRI 继续作为物理材质环境照明；独立程序背景只负责可见画面，不能替代花瓣的环境反射和高光。
- 动画或背景流动均关闭时恢复按需渲染；页面隐藏、减少动画偏好和卸载均停止时钟并释放 Morph 纹理、模型纹理、几何和背景资源。

## 实施与验证

见 [[日志/2026-09-04-实现隔离杜鹃花无限绽放场景|实施日志]]。
