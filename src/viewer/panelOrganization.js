// Only presentation: move existing controller DOM nodes, never replace their
// bindings, ranges or values. Keep the native lil-gui keyboard/focus behavior.
export function organizeViewerPanel(gui) {
  const layouts = {
    '场景选择': [
      ['隔离切换', ['当前场景', '重置当前场景视角']],
    ],
    '深邃效果': [
      ['纵深与取景', ['纵深数量', '纵深间距', '首层取景视角（°）', '首层正面取景', '适配全部']],
      ['局部光晕', ['局部 Bloom 光晕', '光晕强度', '光晕半径', '光晕阈值']],
      ['预设与对照', ['恢复调好的默认效果', '纯透射对照', '仅颜色层级对照']],
    ],
    '梦境背景与迎光': [
      ['背景', ['启用梦境效果', '背景模式', '背景流动', '流动速度', '混色背景亮度']],
      ['远端亮心', ['亮心距离模式', '尽头亮心强度', '亮心半径', '亮心距末层']],
      ['迎光', ['迎光放射强度', '亮心柔晕', '光束扩散范围', '边缘渐隐范围（%）', '显隐过渡时长（秒）', '紫色层级保护']],
    ],
    '指针视差': [
      ['视角跟随', ['启用指针视差', '视差幅度（°）', '垂直响应比例', '跟随缓动（秒）']],
      ['交互协调', ['操作后当前位置为中心', '视差回中']],
    ],
    '渲染设置': [
      ['颜色层级', ['切片颜色累积', '累积强度', '加深上限', 'HDRI 分级显色']],
      ['体积与轮廓', ['内嵌色体透射', '轮廓清晰度', '轮廓宽度（像素）']],
      ['输出与质量', ['曝光', '透射分辨率比例']],
    ],
    '场景2·花粉星云': [
      ['运动', ['启用粒子场景', '粒子流动', '流动速度', '漂浮强度', '漩涡强度', '整体尺寸']],
      ['三层粒子', ['远层微尘数量', '中层花粉数量', '近层花瓣数量']],
      ['色彩与发光', ['微尘颜色', '花粉颜色', '花瓣颜色', '粒子柔光', '能量核心强度', '能量核心大小']],
      ['操作', ['重置粒子场景']],
    ],
  };
  const material = [
    ['颜色与透射', ['颜色', '透射率', '不透明度', '写入深度（遮挡后层）']],
    ['表面与反射', ['金属度', '粗糙度', '折射率（IOR）', '厚度', '镜面反射强度', '镜面反射颜色', '环境贴图强度']],
    ['自发光', ['自发光颜色', '自发光强度', '仅局部光纹发光']],
  ];
  layouts['外框插槽管理'] = layouts['内框插槽管理'] = material;
  const order = ['场景选择', '深邃效果', '场景2·花粉星云', '梦境背景与迎光', '指针视差', 'HDRI 环境设置', '外框插槽管理', '内框插槽管理', '渲染设置'];
  for (const title of order) {
    const folder = gui.folders.find(f => f._title === title);
    if (!folder) continue;
    gui.$children.appendChild(folder.domElement);
    for (const [name, labels] of layouts[title] || []) {
      const heading = document.createElement('div');
      heading.className = 'viewer-panel-section'; heading.textContent = name;
      folder.$children.appendChild(heading);
      for (const label of labels) {
        const controller = folder.controllers.find(c => c._name === label);
        if (!controller) throw new Error(`面板参数未找到：${title} / ${label}`);
        folder.$children.appendChild(controller.domElement);
      }
      if (title === '深邃效果' && name === '纵深与取景') {
        folder.$children.appendChild(folder.$children.querySelector('.viewer-panel-status'));
      }
      if (title === '场景选择' && name === '隔离切换') {
        folder.$children.appendChild(folder.$children.querySelector('.viewer-scene-status'));
      }
      if (title === '场景2·花粉星云' && name === '三层粒子') {
        folder.$children.appendChild(folder.$children.querySelector('.viewer-particle-status'));
      }
    }
    const notes = Array.from(folder.$children.querySelectorAll(':scope > .viewer-effect-note'));
    // Put long explanations behind a native disclosure; no information removed.
    if (notes.length) {
      const details = document.createElement('details'); details.className = 'viewer-panel-help';
      const summary = document.createElement('summary'); summary.textContent = '说明与边界';
      details.appendChild(summary); notes.forEach(note => details.appendChild(note));
      folder.$children.appendChild(details);
    }
  }
}
