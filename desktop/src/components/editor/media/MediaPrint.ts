import type { LexicalEditor } from 'lexical';
/** Print a detached rendering. Author Markdown and the active editor stay untouched. */
export async function printMediaDocument(editor: LexicalEditor): Promise<void> {
  const root = editor.getRootElement();
  if (!root) return;
  const frame = document.createElement('iframe');
  frame.title = 'Print document';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1000px;border:0';
  document.body.append(frame);
  const target = frame.contentDocument, view = frame.contentWindow;
  if (!target || !view) { frame.remove(); throw new Error('Print view unavailable'); }
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; frame.remove(); } };
  try {
    target.title = document.title;
    for (const sheet of document.querySelectorAll('style,link[rel="stylesheet"]')) target.head.append(sheet.cloneNode(true));
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.vml-toolbar,.vml-settings,.vml-menu,.vml-grip,.vml-frame-width,.vml-frame-height,.vml-frame-scale,.vml-single-width,.vml-row-height,.vml-divider,.lexical-block-controls,.novel-bubble-menu').forEach(node => node.remove());
    clone.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    clone.removeAttribute('contenteditable'); clone.style.cssText = 'padding:0;min-height:0;max-width:none;width:100%';
    const host = target.createElement('div'); host.className = 'novel-editor'; host.append(clone); target.body.append(host);
    const styles = target.createElement('style'); styles.textContent = 'html,body,.novel-editor{height:auto!important;min-height:0!important;overflow:visible!important;background:white!important;color:black!important}body{margin:20mm}.lexical-media-layout,.vml-layout{outline:none!important;box-shadow:none!important}.vml-reference{display:inline!important}@page{margin:15mm}'; target.head.append(styles);
    await Promise.all(Array.from(target.images, image => image.decode().catch(() => {})));
    await target.fonts.ready;
    view.addEventListener('afterprint', dispose, { once: true });
    view.focus(); view.print();
    // WebKit does not consistently send afterprint; the isolated preview has no source ownership.
    setTimeout(dispose, 60_000);
  } catch (error) { dispose(); throw error; }
}
