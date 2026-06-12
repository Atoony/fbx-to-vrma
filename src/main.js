import templateHtml from '../template/fbx-to-vrma.html?raw';

async function bootWorkbench() {
  const template = new DOMParser().parseFromString(templateHtml, 'text/html');

  template.querySelectorAll('script').forEach((node) => node.remove());
  document.title = template.title || document.title;

  const styleContent = Array.from(template.querySelectorAll('style'))
    .map((node) => node.textContent || '')
    .join('\n');

  if (styleContent) {
    const style = document.createElement('style');
    style.dataset.template = 'fbx-to-vrma';
    style.textContent = styleContent
      .replace(/"Chivo",\s*sans-serif/g, '"Segoe UI", "Helvetica Neue", Arial, sans-serif')
      .replace(/"Red Hat Display",\s*sans-serif/g, '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif');
    document.head.appendChild(style);
  }

  document.body.innerHTML = template.body.innerHTML;
  await import('./fbx-to-vrma-page.js');
}

bootWorkbench().catch((error) => {
  console.error(error);
  document.body.innerHTML = `
    <main class="boot">
      <h1>页面加载失败</h1>
      <p>${error.message}</p>
    </main>
  `;
});
