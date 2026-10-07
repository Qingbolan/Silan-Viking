import React from 'react';
import { readMediaSettings } from './MediaLayoutSettings';
const english: Record<string, string> = {
  '返回': 'Back', '编辑说明…': 'Edit caption…', '图片靠左': 'Align image left', '图片居中': 'Center image', '图片靠右': 'Align image right',
  '拖动边缘调整宽度': 'Drag the edge to resize width', '拖动底边调整高度': 'Drag the bottom edge to resize height', '拖动角点等比例缩放': 'Drag the corner to scale',
  '拖动图片移动；单图在本行内横移定位；双击放大；右键更多操作': 'Drag to move; slide a single image within its row to position it. Double-click to zoom; right-click for more.',
  '拖动边缘调整单图宽度': 'Drag the edge to resize this image', '拖动间隙调整比例；双击恢复': 'Drag the gap to resize columns; double-click to reset', '拖动底边调整行高': 'Drag the bottom edge to resize this row',

  '打印 / 导出 PDF': 'Print / Export PDF',
  '保存说明': 'Save caption', '图片查看器': 'Image viewer', '上一张': 'Previous image', '下一张': 'Next image',
  '不环绕': 'No wrap', '保存源码': 'Save source', '关闭菜单': 'Close menu', '列间距 em': 'Column gap (em)', '取消': 'Cancel', '取消环绕': 'No text wrap', '图片说明': 'Caption', '字号倍数': 'Text scale', '布局宽度': 'Layout width', '布局设置': 'Layout settings', '整体对齐': 'Block alignment', '文字与布局设置…': 'Text and layout settings…', '文字列数': 'Text columns', '文字垂直对齐': 'Text vertical alignment', '文字对齐': 'Text alignment', '正文环绕': 'Text wrapping', '浮动右侧': 'Float right', '浮动右侧，正文环绕': 'Float right, wrap text', '浮动左侧': 'Float left', '浮动左侧，正文环绕': 'Float left, wrap text', '添加右侧文字': 'Add text on the right', '添加左侧文字': 'Add text on the left', '源码': 'Edit source', '移出布局，保留图片': 'Move out of layout', '移除布局，保留内容': 'Unwrap and keep content', '说明居中': 'Center captions', '说明靠左': 'Align captions left',
  '关闭': 'Close', '图表公式编号语言': 'Reference numbering language', '在文末创建可编辑示例': 'Create a working example at the end', '将选区转换为布局': 'Wrap selection in a layout', '查看功能示例': 'Feature examples', '界面语言': 'Interface language', '确认修改上述文档': 'Confirm changes to these documents', '确认移除上述布局': 'Remove these layout comments', '移除工作空间全部布局…': 'Remove layout comments from all notes…', '移除当前文档全部布局…': 'Remove all layouts in this document…', '粘贴或导入多个媒体时自动创建布局': 'Automatically wrap multiple imported or pasted media', '自动': 'Automatic', '选区转布局快捷键：⌘/Ctrl + Shift +': 'Wrap selection shortcut: ⌘/Ctrl + Shift +', '关闭 Esc': 'Close Esc', '重置': 'Reset',
  '图片与图文布局设置': 'Adjustable Media settings', 'Adjustable Media 功能示例': 'Adjustable Media feature examples', '移除当前文档全部布局': 'Remove layouts from this document',
  '编辑布局源码': 'Edit layout source', '合并下一个布局或图片段落': 'Merge with the next layout or media paragraph', '拖动到另一行或另一布局': 'Drag to another row or layout', '调整单图宽度': 'Resize image width', '调整列比例；双击恢复': 'Resize columns; double-click to reset', '调整布局宽度': 'Resize layout width', '调整布局高度': 'Resize layout height', '等比例缩放布局': 'Scale layout proportionally', '拖动整个布局；左右侧落点启用正文环绕': 'Move layout; drop at either side to wrap text',
  '拖动图片手柄可在行间或布局间移动。拖动单图本身可水平定位并吸附；拖动分隔线、行底边、外框和角点可调整尺寸。右键添加文字栏、设置环绕、说明和文字样式。双击图片打开查看器。': 'Drag media grips between rows and layouts. Drag a single image to position it with magnetic snapping. Resize dividers, row bottoms, the frame or corner. Right-click for text columns, wrapping, captions and text settings. Double-click images to open the viewer.',
};
export function useMediaText() {
  const [setting, setSetting] = React.useState(() => readMediaSettings().uiLanguage);
  React.useEffect(() => { const change = () => setSetting(readMediaSettings().uiLanguage); window.addEventListener('silan-media-settings', change); return () => window.removeEventListener('silan-media-settings', change); }, []);
  const chinese = setting === 'zh' || (setting === 'auto' && typeof navigator !== 'undefined' && navigator.language.startsWith('zh'));
  return (text: string) => chinese ? text : english[text] || text;
}
