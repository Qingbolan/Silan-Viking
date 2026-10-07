import { ApplicationBootstrap } from './lib/ApplicationBootstrap';

// This entry deliberately has no dependency on React, themes, or application CSS.
const bootstrap = new ApplicationBootstrap((error) => {
  document.getElementById('boot-primer')?.remove();
  const panel = document.createElement('section');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#faf9f6;color:#242424;padding:80px 40px;font:16px/1.6 system-ui;overflow:auto';
  const title = document.createElement('h1');
  title.textContent = '工作台未能启动';
  const message = document.createElement('p');
  message.textContent = '启动过程中发生错误。重新加载后若仍出现，请保留以下错误信息。';
  const detail = document.createElement('pre');
  detail.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
  detail.textContent = error instanceof Error ? error.message : String(error);
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.style.cssText = 'padding:10px 20px;font:inherit;cursor:pointer';
  retry.onclick = () => window.location.reload();
  panel.append(title, message, detail, retry);
  document.body.append(panel);
});

void bootstrap.start(() => import('./main'));
