# AlgoBlocks — 图形化编程 IDE

**AlgoBlocks** 是一款面向算法学习与编程实践的图形化编程 IDE，支持**强类型变量与容器声明 → 动态生成变量与专属类型方法积木 → 实时生成可运行 C++17/20 & Python 3 代码 → 代码转积木（双向导入）→ 多样例运行评测**。

---

## 核心特性

- **强类型声明与动态积木抽屉**：拖入标量、数组或 STL 容器（`vector` / `queue` / `stack` / `priority_queue` / `set` / `map` / `pair`）声明块后，左侧「我的变量」与「类型方法与算法」自动生成对应取值/赋值块与专属方法块。
- **双语实时代码生成与行级联动**：支持一键切换 **C++17/20** 与 **Python 3**，选中任意积木自动滚动并高亮右侧对应代码行。
- **代码转积木（Code → Blocks）**：内置基于 `@lezer/cpp` 与 `@lezer/python` 的前端 AST 解析器，支持将 C++ / Python 代码一键转换为可视化积木，未支持语法自动降级为自定义代码兜底块。
- **内置 7 套经典算法样例**：多组测试 A+B、Vector 排序输出、小根堆优先队列模拟、二分查找、快速幂取模、前缀和区间查询、哈希表词频统计。
- **双模式运行（本地优先 + 纯静态网页免后端降级）**：
  - **本地运行**：检测到本地 `server`（端口 3001）时，直接调用本机 `g++` / `python` 编译运行。
  - **GitHub Pages 静态托管**：无需任何后端，Python 3 自动在浏览器内通过 **Pyodide WebAssembly**（独立 Web Worker 防死循环）运行；C++ 自动降级至 **Wandbox** 在线 GCC 编译服务。

---

## 本地启动

需要 Node.js 20+（如需本地 C++/Python 运行，需本机已安装 `g++` 与 `python`）：

```bash
npm install
npm --prefix server install
npm --prefix frontend install
npm run dev
```

启动后访问 `http://localhost:5173`。

---

## 部署到 GitHub Pages（纯静态网页）

项目已内置自动化工作流 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)：

1. 将本仓库推送到 GitHub 的 `main` 分支：
   ```bash
   git init
   git add .
   git commit -m "feat: initial AlgoBlocks IDE"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 在 GitHub 仓库页面打开 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
3. 推送后 Actions 会自动构建 `frontend/dist` 并发布至 `https://<你的用户名>.github.io/<仓库名>/`。

---

## 项目文档

- [项目进展 (PROGRESS.md)](docs/PROGRESS.md)
- [开发规范 (CONVENTIONS.md)](docs/CONVENTIONS.md)
- [系统架构 (ARCHITECTURE.md)](docs/ARCHITECTURE.md)
