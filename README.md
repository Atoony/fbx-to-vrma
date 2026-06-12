# FBX to VRMA Workbench

一个可部署到 Cloudflare Pages 的纯前端静态工具，用于在浏览器里把标准 Humanoid `FBX` 动画转换为 `VRMA`，并支持本地导入 `VRM` 角色做回灌验证。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址是 `http://localhost:5173`。

## 构建

```bash
npm run build
```

构建产物在 `dist/`，可以直接部署到 Cloudflare Pages。

## Cloudflare Pages 配置

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `20` 或更高

## 说明

- 所有文件处理都在浏览器本地完成，不会上传到服务器。
- 建议使用最新版 Chrome 或 Edge。
- 界面模板在构建时内联进产物，不依赖部署后额外静态文件。
