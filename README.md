# OmniChat Local AI

本地化优先的高级多模型 AI 聊天客户端。

## 🚀 GitHub Pages 部署指南

本项目已配置自动化部署工作流。为了确保正常部署，请按照以下步骤操作：

### 1. 配置 GitHub Actions 权限
在 GitHub 仓库页面：
1. 进入 **Settings** -> **Actions** -> **General**。
2. 滚动到 **Workflow permissions**。
3. 选择 **Read and write permissions**。
4. 点击 **Save**。

### 2. 设置 Pages 来源
1. 进入 **Settings** -> **Pages**。
2. 在 **Build and deployment** -> **Source** 下：
   - **推荐方式**：选择 **GitHub Actions**。这会直接使用工作流生成的构建物。
   - **备选方式**：选择 **Deploy from a branch**，分支选择 `gh-pages`，目录选择 `/(root)`。

### 3. 访问地址
部署完成后，可以通过 `https://<你的用户名>.github.io/<仓库名>/` 访问。

> **注意**：由于 GitHub Pages 是静态托管，部分后端依赖功能（如服务端代码执行转发、网页搜索中转）在 Pages 环境下不可用。如需完整功能，建议配合 Android 客户端使用。

## 🛠 开发与构建

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 构建 Web 产物
npm run build
```
