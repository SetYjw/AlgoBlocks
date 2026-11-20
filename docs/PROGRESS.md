# AlgoBlocks 项目进展 (PROGRESS)

> 最后更新：2026-11-20

## 里程碑总览

| 阶段 | 内容 | 状态 | 验证结果 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | 工程脚手架、三栏可拖拽 IDE 工作台、深色主题 | ✅ 已完成 | `tsc --noEmit && vite build` 通过 |
| **Phase 2** | 强类型符号表、动态「我的变量 / 类型方法」抽屉、6 大类核心积木 | ✅ 已完成 | 单元测试 + 浏览器 E2E 通过 |
| **Phase 3** | C++17/20 实时代码生成器（含行号映射）+ 本地 `g++` 编译运行服务 | ✅ 已完成 | 后端 6/6 + 前端 10/10 通过 |
| **Phase 4** | 内置示例模板、`.json` / 源码导出、`Ctrl+K` 速搜、端到端验收 | ✅ 已完成 | 8/8 浏览器验收通过 |
| **Phase 5** | Python 3 全链路支持（生成器 + 后端运行）、新增 4 套经典算法样例与 7 个高频积木、UI 品牌调整与缩放 Bug 修复、工程文档体系建立 | ✅ 已完成 | 后端 12/12 + 前端 39/39 + 浏览器回归全通过 |
| **Phase 6** | 缩放时保持积木页打开、代码转积木（`@lezer/cpp` + `@lezer/python`）、GitHub Pages 静态网页部署与免后端浏览器运行（Pyodide WASM + Wandbox 云编译） | ✅ 已完成 | 后端 12/12 + 前端 77/77 + 浏览器端到端验收全通过 |

---

## 已修复问题记录

1. **Blockly 媒体资源 404 / ORB 拦截（已修复）**
   - 原因：Blockly 默认从外部 `blockly-demo.appspot.com` 加载 `sprites.png` 等资源。
   - 修复：将 `node_modules/blockly/media/*` 本地化至 `frontend/public/blockly-media/` 并在 `Blockly.inject` 中配置 `media: '/blockly-media/'`。
2. **同名局部变量在动态抽屉中重复出现（已修复）**
   - 原因：多个独立循环作用域声明同名变量（如 `x`）时，`dynamicFlyout.ts` 未按变量名去重。
   - 修复：在 `variableItems` 与 `methodItems` 中对同名符号去重。
3. **打开积木页时缩放页面导致积木页消失但滚动条残留（已彻底根因修复）**
   - 根因：Tailwind CSS v4 的 preflight 规则对所有 `<svg>` 设置了 `display: block`，优先级高于 Blockly 隐藏滚动条时使用的 SVG 属性 `outerSvg.setAttribute("display", "none")`；因此当用户缩放画布/关闭积木页时，积木页本身通过内联 `style="display: none"` 隐藏了，但滚动条 `<svg class="blocklyFlyoutScrollbar" display="none">` 仍被 Tailwind 强制渲染为 `display: block` 悬浮在画布上。
   - 修复：在 `frontend/src/index.css` 中添加 `svg[display="none"] { display: none !important; }` 恢复 SVG `display="none"` 属性语义，并在 `BlocklyCanvas.tsx` 中保持 `ResizeObserver` / `window.resize` / `visualViewport.resize` 的 `rAF` 同步刷新。
4. **产品定位与文案调整（已修复）**
   - 将界面与标题由“图形化算法竞赛 IDE”调整为“图形化编程 IDE”，移除 `OI / ACM` 标签。

---

## 后续规划（Backlog）

- [ ] 积木作用域静态诊断增强（局部变量越界使用高亮提示）
- [ ] 支持更多 STL / Python 常用高阶积木（如结构体 `struct` / 类定义、二维 `vector` 初始化、图论邻接表模板）
- [ ] 代码区与积木区双向跳转（点击代码行反向定位并高亮对应积木）
- [ ] 桌面端打包（Electron / Tauri）与离线便携版分发
