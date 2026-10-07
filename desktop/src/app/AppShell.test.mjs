import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { AppShell } from './AppShell';
const render = options => renderToStaticMarkup(React.createElement(AppShell, {
  settingsOpen:false, sidebarOpen:true, windowChromeClassName:'native-window', momentsActive:true,
  hasMomentsBackground:true, titlebar:React.createElement('header',null,'Titlebar'),
  sidebar:React.createElement('aside',null,'Navigation'), overlays:React.createElement('section',{role:'dialog'},'Recovery'),
  children:React.createElement('article',null,'Editor'), ...options,
}));
test('window chrome, content and recovery overlays keep their DOM ownership', () => {
  const html=render();
  assert.match(html,/shell sidebar-open/);
  assert.match(html,/native-window/);
  assert.match(html,/main-moments/);
  assert.match(html,/data-has-moments-background="true"/);
  assert.ok(html.indexOf('Titlebar')<html.indexOf('Navigation'));
  assert.ok(html.indexOf('Navigation')<html.indexOf('<main'));
  assert.ok(html.indexOf('Editor')<html.indexOf('</main>'));
  assert.ok(html.indexOf('</main>')<html.indexOf('role="dialog"'));
});
test('settings hides navigation and optional styles remain optional', () => {
  const html=render({settingsOpen:true,momentsActive:false});
  assert.match(html,/settings-open/);
  assert.match(html,/main-settings/);
  assert.ok(!html.includes('Navigation'));
  assert.ok(!html.includes('sidebar-open'));
  assert.ok(!html.includes('data-has-moments-background'));
  assert.ok(html.includes('Recovery'));
});
