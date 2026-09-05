# Character 引擎接入

`scene.ts`、`glyphPhysics.ts`、`math.ts`、`types.ts` 按用户指定，从桌面 `Character/src/engine/` 原样复制（2026-09-05）。保留原始薄片气动、固定步长、字形缓存、代码绘制、生态访花、花朵生长与指针互动；原工程没有被修改。

`controls.json` 的参数名称、范围和分组来自 `Character/src/components/ControlPanel.tsx`，包含37个数值控件；原有变化形式选择与指针开关在适配层绑定。

`../characterScene.js` 将此引擎接入幽兰场景11，负责懒初始化、单一主渲染循环、CanvasTexture、窗口适配、指针映射、快捷键、面板和资源释放。原React页面、CSS、视频、构建目录及依赖无需复制。

引擎文件保留TypeScript，使用项目现有Vite编译，无运行时外部目录依赖。访问 `?scene=11` 或 `?scene=character` 直达场景11。
