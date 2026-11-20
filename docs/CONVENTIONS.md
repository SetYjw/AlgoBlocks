# AlgoBlocks 开发与协作规范 (CONVENTIONS)

本文档定义 AlgoBlocks 项目的目录边界、代码风格、积木与代码生成器扩展规范以及验收标准，确保多人/多代理并行开发时有序、无冲突。

---

## 一、目录结构与模块边界

| 目录 | 职责 | 边界约束 |
| :--- | :--- | :--- |
| `e:\AlgoBlocks\package.json` | 根工程脚本（`concurrently` 联合启动与测试入口） | 仅放根脚本与 `concurrently` |
| `e:\AlgoBlocks\server\src\**` | 本地运行服务（Express + `g++` / `python` 执行器） | 仅绑定 `127.0.0.1`，严格校请求体与本机 Origin |
| `e:\AlgoBlocks\frontend\src\blocks\**` | Blockly 积木定义与 `BLOCK_CATALOG` | 不直接依赖 React 组件 |
| `e:\AlgoBlocks\frontend\src\core\**` | 符号表、动态抽屉、主题、工具箱配置、内置样例模板 | 纯 TypeScript + Blockly API |
| `e:\AlgoBlocks\frontend\src\generators\**` | 多语言代码生成器（`LanguageTarget` 实现：C++ / Python） | 每个语言独立子目录，统一在 `generators/index.ts` 注册 |
| `e:\AlgoBlocks\frontend\src\components\**` | React IDE 界面组件（HeaderBar / BlocklyCanvas / CodePanel / RunnerPanel / QuickSearchModal） | 通过契约接口调用 `blocks` / `core` / `generators` / `api` |
| `e:\AlgoBlocks\docs\**` | 项目进展（`PROGRESS.md`）、规范（`CONVENTIONS.md`）、架构（`ARCHITECTURE.md`） | 每次重要迭代同步更新 |

---

## 二、积木设计与命名规范

1. **Block Type 命名**：所有自定义积木必须以 `algo_` 为前缀，采用蛇形命名，例如 `algo_decl_var`、`algo_for_range`、`algo_const_preset`。
2. **可序列化性优先**：所有积木必须能通过 `Blockly.serialization.workspaces.save/load` 无损序列化为 JSON（避免脆弱的自定义 XML-only mutator）。
3. **新增积木四步闭环**（缺一不可）：
   - 在 `frontend/src/blocks/*.ts` 定义积木并导出。
   - 在 `frontend/src/blocks/index.ts` 注册进 `registerAllBlocks()` 与 `BLOCK_CATALOG`（含中文标签、分类名与搜索关键词）。
   - 在 `frontend/src/core/theme.ts` 的 `TOOLBOX_CONFIG`（或 `dynamicFlyout.ts`）中配置入口。
   - 在 **所有已注册语言生成器**（`generators/cpp/index.ts` 与 `generators/python/index.ts`）中实现对应代码生成逻辑与行号映射，并补充单元测试。

---

## 三、多语言生成器契约 (`LanguageTarget`)

所有目标语言生成器必须实现 `frontend/src/generators/types.ts` 中的统一接口：

```ts
export interface GeneratedCodeResult {
  code: string;
  lineMap: Record<string, [number, number]>; // 1-based [startLine, endLine]
  headers: string[];
  diagnostics: Diagnostic[];
}

export interface LanguageTarget {
  id: string;            // 'cpp' | 'python'
  label: string;         // 'C++' | 'Python 3'
  fileExtension: string; // '.cpp' | '.py'
  generate(workspace: Blockly.Workspace, options?: GenerateOptions): GeneratedCodeResult;
}
```

- `lineMap` 中的行号必须严格为 **1-based**，且不越界，确保点击画布积木时 CodeMirror 能准确滚动并高亮对应代码段。
- 新增内置样例（`frontend/src/core/templates.ts`）时，必须同时附带至少 2 组测试样例，并通过 `g++` 与 `python` 双语言实测。

---

## 四、测试与提交前检查清单

每次功能迭代或 Bug 修复完成后，必须依次验证：

1. **后端检查**：
   ```powershell
   cd e:\AlgoBlocks\server
   .\node_modules\.bin\tsc.cmd --noEmit
   npm test
   ```
2. **前端类型与单元测试**：
   ```powershell
   npm --prefix e:\AlgoBlocks\frontend test
   npm --prefix e:\AlgoBlocks\frontend run build
   ```
3. **浏览器回归验证**：确认无 JS 控制台报错、积木抽屉缩放正常、C++ 与 Python 实时代码生成及运行判定均正常。
4. **文档同步**：同步更新 `docs/PROGRESS.md`（必要时更新 `docs/ARCHITECTURE.md` 与 `docs/CONVENTIONS.md`）。
