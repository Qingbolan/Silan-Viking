import { useState } from 'react';
import type { PagePlugin, PagePluginContext } from '../../src/plugins/PagePlugin';

function ResearchPage({ language }: PagePluginContext) {
  const [note, setNote] = useState('');
  return <label>{language === 'zh' ? '研究笔记' : 'Research note'}
    <textarea value={note} onChange={event => setNote(event.target.value)} />
  </label>;
}

export const researchPagePlugin: PagePlugin = {
  apiVersion: 1,
  id: 'example.research',
  title: 'Research',
  order: 10,
  Page: ResearchPage,
  Actions: ({ openDashboard }) => <button type="button" onClick={openDashboard}>Dashboard</button>,
};
