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
    '场景3·金菊闪柳烟花': [
      ['播放与时间', ['启用烟花场景', '播放动画', '循环播放', '播放速度', '时间预览（秒）', '从头播放', '升空时长', '绽放时长']],
      ['金菊结构', ['金菊主枝数量', '每枝尾迹密度', '绽放速度', '整体展开范围', '三维纵深', '柳尾下坠', '空气阻力', '横向风力', '金色尾迹长度', '金色尾迹宽度']],
      ['闪烁与爆心', ['闪烁粒子数量', '闪烁粒子大小', '冷绿闪烁强度', '闪烁持续时间', '爆心闪光强度', '爆心烟晕范围']],
      ['烟花色彩', ['金菊主枝颜色', '柳尾余烬颜色', '冷绿闪烁颜色', '爆心闪光颜色']],
      ['独立夜空', ['夜空风格', '夜空缓慢流动', '夜空流动速度', '夜空混色强度', '夜空底色', '烟霞颜色', '梦境辅色']],
      ['光晕与性能', ['启用烟花 Bloom', '烟花光晕强度', '烟花光晕半径', '烟花光晕阈值', '性能档位']],
      ['操作', ['重置烟花场景']],
    ],
    '场景5·纸飞机环游': [
      ['飞机与环游', ['播放环游', '纸飞机数量', '飞行速度', '纸飞机大小']],
      ['立体航道', ['环绕半径', '航道起伏', '星球自转', '显示飞行路径', '路径透明度']],
      ['星球与纸张', ['纸张颜色', '海洋颜色', '陆地颜色', '大气柔边', 'HDRI 质感强度']],
      ['粉彩天空', ['天空顶部', '天空底部', '天空柔光']],
      ['操作', ['重置纸飞机环游', '重试模型加载']],
    ],
    '场景4·无限花开': [
      ['播放与循环', ['启用无限花开', '播放绽放', '无限循环', '绽放速度', '周期预览', '重新播放花开', '花瓣在枝时长（秒）']],
      ['花冠结构', ['生长花瓣层数', '展开时长比例', '盛放停留比例', '代际旋转角（°）', '花冠整体尺寸', '代际纵深间距', '花瓣微风', '显示原始枝叶']],
      ['脱落与飘散', ['飘落持续（秒）', '向右风力', '下落重力']],
      ['真实材质', ['花瓣整体染色', '花瓣粗糙度', '2K 法线纹理强度', '次表面透光强度', '次表面透光颜色', 'HDRI 质感强度']],
      ['灯光', ['暖色主光', '冷色轮廓光']],
      ['独立背景', ['背景缓慢流动', '背景流动速度', '背景混色强度', '背景顶部颜色', '背景底部颜色', '背景花影颜色']],
      ['操作', ['重置无限花开']],
    ],
  };
  const material = [
    ['颜色与透射', ['颜色', '透射率', '不透明度', '写入深度（遮挡后层）']],
    ['表面与反射', ['金属度', '粗糙度', '折射率（IOR）', '厚度', '镜面反射强度', '镜面反射颜色', '环境贴图强度']],
    ['自发光', ['自发光颜色', '自发光强度', '仅局部光纹发光']],
  ];
  layouts['外框插槽管理'] = layouts['内框插槽管理'] = material;
  const order = ['场景选择', '深邃效果', '场景2·花粉星云', '场景3·金菊闪柳烟花', '场景4·无限花开', '场景5·纸飞机环游', '梦境背景与迎光', '指针视差', 'HDRI 环境设置', '外框插槽管理', '内框插槽管理', '渲染设置'];
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
      if (title === '场景3·金菊闪柳烟花' && name === '播放与时间') {
        folder.$children.appendChild(folder.$children.querySelector('.viewer-firework-status'));
      }
      if (title === '场景4·无限花开' && name === '播放与循环') {
        folder.$children.appendChild(folder.$children.querySelector('.viewer-flower-status'));
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
