import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeFileDragSession } from './nativeFileDrag.ts';
test('internal or orphan over events never open the upload target', () => {
  const drag = new NativeFileDragSession();
  assert.equal(drag.update({ type: 'over' }), false);
  assert.equal(drag.update({ type: 'enter', paths: [] }), false);
  assert.equal(drag.update({ type: 'over' }), false);
});
test('real file enter persists through over and resets on drop/leave', () => {
  const drag = new NativeFileDragSession();
  assert.equal(drag.update({ type: 'enter', paths: ['/fixture/image.png'] }), true);
  assert.equal(drag.update({ type: 'over' }), true);
  assert.equal(drag.update({ type: 'leave' }), false);
  assert.equal(drag.update({ type: 'over' }), false);
  assert.equal(drag.update({ type: 'enter', paths: ['/fixture/image.png'] }), true);
  assert.equal(drag.update({ type: 'drop', paths: ['/fixture/image.png'] }), false);
});
