# FBX to VRMA Workbench

一个可部署到 Cloudflare Workers 的纯前端静态工具，用于在浏览器里把标准 Humanoid `FBX` 动画转换为 `VRMA`，并支持本地导入 `VRM` 角色做回灌验证。

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

构建产物在 `dist/`，可以直接通过 Wrangler 部署到 Cloudflare Workers。

## Cloudflare Workers 配置

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node version: `20` 或更高

仓库里已包含 [wrangler.jsonc](D:/cc-project/202606/vrm-test/fbx-to-vrma/wrangler.jsonc)，会把 `dist/` 作为静态资源目录发布。

## 说明

- 所有文件处理都在浏览器本地完成，不会上传到服务器。
- 建议使用最新版 Chrome 或 Edge。
- 界面模板在构建时内联进产物，不依赖部署后额外静态文件。
