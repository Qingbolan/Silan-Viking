import React from 'react';
import { createRoot } from 'react-dom/client';
import MarkdownEditor from '../../src/components/MarkdownEditor';
import { createThemeSession } from '../../src/theme/composition';
import '../../src/styles.css';
createThemeSession(document, () => localStorage);
const initial = 'Before layout\n\n<!-- vml {"v":2} -->\n![Photo](/photo.svg)\nThe lower panels reproduce the original outputs. **Move this paragraph outside.**\n<!-- /vml -->\n\nAfter layout';
function Fixture() {
  const [value, setValue] = React.useState(initial + (new URLSearchParams(location.search).has('long') ? '\n\n' + Array.from({length:60}, (_, i) => `Later paragraph ${i + 1}.`).join('\n\n') : ''));
  return <main style={{maxWidth:1000,margin:'60px auto'}}><MarkdownEditor value={value} onChange={setValue} toolbarVisible={false}/><pre aria-label="Saved Markdown">{value}</pre></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
