---
type: decision
status: active
kind: architecture
importance: high
updated: 2026-09-04
topic: isolated-firework-gpu-scene
source_logs:
  - "[[日志/2026-09-04-分析参考视频并实现隔离金菊闪柳场景]]"
supersedes: null
---

# ADR-011｜隔离烟花场景与 GPU 批量轨迹

## 用户指定方向

在现有开发服务器中增加隔离场景3，参考金菊闪柳实拍制作粒子烟花；背景颜色与运动独立可调，控制项尽量完整，并以桌面浏览器的完整效果为目标。

## 当前约定

- 场景3使用独立 `THREE.Scene`、独立时间线、独立夜空 ShaderMaterial 和独立 Bloom 管线；不把烟花对象加入场景1或场景2。
- 三场景共用一个 Renderer、Canvas、Camera、OrbitControls、指针视差和 HDRI 资源管理；分别保存相机状态，任一时刻只更新活动场景。
- HDRI 继续服务场景1/2的物理材质质感；场景3粒子是自定义加色 ShaderMaterial，不将 HDRI 当作其背景或烟花照明来源。
- 烟花固定预分配少量 GPU 批次：升空、主枝粒子、连续主枝线、枝端闪烁和爆心图元；数量变化使用 uniform 或 draw range，不按粒子创建 Mesh，不在动画中重建几何。
- 金菊轨迹采用指数阻力、径向展开、重力、风和小幅横向扰动的艺术化公式；绿白闪烁使用延迟出生、寿命、枝端节点和随机闪频。
- Bloom 仅用于亮部扩散，并通过质量档缩放后处理分辨率；最终统一进入 `OutputPass`。关闭动画与独立夜空流动后恢复按需渲染。
- 当前只承诺桌面浏览器验收；不为移动端降低默认效果或建立单独交互布局。

## 实施与验证

见 [[日志/2026-09-04-分析参考视频并实现隔离金菊闪柳场景|实施日志]]。
