# Feather 第一幕参考

来源：[feather.computer](https://feather.computer/)，读取日期 2026-09-05。
用户同时提供了 8.777 秒的首幕录屏和静态截图。实现范围仅为第一屏。

## 复现依据

- 源站首屏 HTML 的22张 `Landing1Hero_card` 图片及百分比位置、尺寸，存入 `src/viewer/feather/cards.json`。
- 首屏样式位于源站 `/_next/static/css/1d1b379ee101b3dc.css`；交互分析来自 `/_next/static/chunks/app/page-50a6f5948ee6a57f.js` 的首屏逻辑。部署哈希可能随上游发布变化。
- 保留纸白底色 `#fefefb`、28px浅点阵、原 Gerstner Programm Medium 字体、虚线胶囊 “Got Mail?”、纸绘猫头鹰及22张邮件贴纸。
- 原交互采用600ms ease-in-out聚散、3秒环绕、0.3纵向压缩和0.12贴纸缩放；悬停时邮件依次随机浮到文字上方，400ms弹出、800–1400ms停留、350ms归队。运行时以本地 Web Animations API 实现，快速反向从当前可见姿态接续。
- 猫头鹰在录屏中已经停驻。`public/feather/owl.svg` 提取首屏原始 SVG，并将 `owl-head-pattern.svg` 嵌入 data URI，让外部 SVG 图片完整独立显示。保留停驻造型与原锚点，不引入后续飞离、卷页或收件箱动画。

## 本地适配

- 场景10“纸间来信”，延迟创建 DOM；复用原场景选择与参数面板。进入折叠面板、退出恢复，不创建额外 Canvas 或 WebGLRenderer。
- 鼠标悬停收拢、离开散开；桌面点击可立即浮出一封邮件。触屏与键盘激活切换聚散，Escape散开。
- 窄屏调整外围贴纸位置以留出中央交互区域，触控按钮至少44px高。中文参数：贴纸尺寸、聚散时长、环绕速度、环绕范围、轮流浮出邮件、点阵浓度。
- 减少动态时保留静态贴纸与猫头鹰；页面隐藏暂停动画并清除定时器，离开场景及卸载清理全部动画。
- 无后续章节、登录、邮件发送、外站 iframe、分析脚本或远程运行时依赖。原贴纸内的英文作为原画保留。
- `assets.json` 记录每个本地素材的来源与 SHA-256；猫头鹰整图标记为派生资产。保留来源署名，不声明上游提供了未确认的开源许可。

## 验证入口

- `tests/feather.test.js`：素材完整性与独立 SVG 约束。
- `tests/browser-scene10.mjs`：真实浏览器聚散、反向、预览、触屏、键盘、暂停、前九场景往返及卸载。
- 预览：`?scene=feather` 或 `?scene=10`。
