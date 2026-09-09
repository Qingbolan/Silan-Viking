import assert from 'node:assert/strict';
import test from 'node:test';
import { contentVisibilityFor, seriesVisibilityFor, hasDocumentStateChanges } from './contentVisibility.ts';
import { countResourcesByShelf, filterResourceDocuments, isPrivateResource } from './resourceVisibility.ts';
const documents = ['blog','episode','project','moment'].flatMap(kind => ['public','private'].map(visibility => ({
 id:`${kind}-${visibility}`, entity_id:`${kind}-${visibility}`, entity_type:kind, title:kind, slug:kind,
 visibility, translations:[],
})));
test('library retains both public and private content',()=>{
 assert.equal(filterResourceDocuments(documents,{view:'all'}).length,8);
 assert.equal(countResourcesByShelf(documents).get('blog'),4);
 assert.equal(filterResourceDocuments(documents,{view:'private'}).length,4);
 assert.equal(isPrivateResource({visibility:'private'}),true);
});
test('only Public and Private transitions are offered',()=>{
 assert.deepEqual(contentVisibilityFor('private').actions.map(a=>a.nextState),[{visibility:'public'}]);
 assert.deepEqual(contentVisibilityFor('public').actions.map(a=>a.nextState),[{visibility:'private'}]);
});
test('mixed series is aggregate-only and supports either batch visibility',()=>{
 const state=seriesVisibilityFor([{visibility:'public'},{visibility:'private'}]);
 assert.equal(state.visibility,'mixed');
 assert.deepEqual(state.actions.map(a=>a.nextState),[{visibility:'public'},{visibility:'private'}]);
});
test('visibility and pin changes enable saving',()=>{
 const current={visibility:'private',pinned:false};
 assert.equal(hasDocumentStateChanges(current,current),false);
 assert.equal(hasDocumentStateChanges(current,{visibility:'public'}),true);
 assert.equal(hasDocumentStateChanges(current,{...current,pinned:true}),true);
});
