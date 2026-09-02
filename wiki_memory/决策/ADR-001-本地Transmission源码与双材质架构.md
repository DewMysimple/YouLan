---
type: decision
status: active
kind: architecture
importance: high
updated: 2026-09-03
topic: transmission-material-architecture
source_logs:
  - "[[日志/2026-09-03-构建工程记忆并修正视角控制]]"
supersedes: null
---

# ADR-001｜本地 Transmission 源码与双材质架构

## 背景

项目要求复用提供的 `source/threejs-transmission`，且 Blender 文件中的外框和内板必须独立调参。

## 决策

Vite 将 bare `three` 精确映射到本地 r186dev 核心；OrbitControls、UltraHDRLoader、lil-gui 和 HDR 直接使用示例源码。GLTFLoader 从锁定版本的本地依赖打包。加载后按对象名为两个网格分别创建 `MeshPhysicalMaterial`。

## 理由

- 保持单一 Three.js 核心实例并复用指定 transmission 实现。
- 两个材质实例避免颜色、粗糙度、厚度等参数联动。
- 全部资源随 Vite 构建，无运行时 CDN 依赖。

## 影响与验证

修改 Three.js 版本或导出对象名时需要重新执行生产构建和浏览器加载测试，并分别改动两组 GUI 参数确认互不联动。
