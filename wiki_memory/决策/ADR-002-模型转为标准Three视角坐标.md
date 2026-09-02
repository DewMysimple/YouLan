---
type: decision
status: active
kind: architecture
importance: high
updated: 2026-09-03
topic: viewer-coordinate-system
source_logs:
  - "[[日志/2026-09-03-构建工程记忆并修正视角控制]]"
supersedes: null
---

# ADR-002｜模型转为标准 Three 视角坐标

## 背景

导出模型的正面法线沿 X 轴。若让相机沿 X 轴观察并把 Z 设为 up，OrbitControls 的水平和垂直手势体感与官方 transmission 示例不一致。

## 决策

加载后将整个 GLTF 根节点绕 Y 轴旋转 `-90°`，把模型正面转向 +Z；相机保持 Three.js 默认 Y-up，并沿 +Z 朝原点观察。随后根据旋转后的包围盒居中和取景。

## 理由

- 与 `webgl_materials_physical_transmission.html` 的相机和 OrbitControls 轴系一致。
- 不修改两个网格的内部父子关系或 Blender 源文件。
- 适配逻辑集中在模型根节点，后续维护清晰。

## 验证方式

从正面拖动：鼠标左右移动应触发水平环绕，鼠标上下移动应触发俯仰；模型初始正面和组合位置不变。
