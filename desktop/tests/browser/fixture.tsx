// Browser integration fixture. All writes stay in this tab's memory.
// Uses the production App, Lexical editor and session objects with a fake IPC boundary.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { PaidAiGateProvider } from '../../src/components/PaidAiGate';
import type { EditorDocument, DeliverySyncStatus, DeploymentPlan } from '../../src/types';
import '../../src/styles.css';

const document: EditorDocument = {
  id: 'fixture-blog', part_id: 'fixture-part', entity_type: 'blog', entity_id: 'fixture-item',
  slug: 'fixture-article', role: 'body', canonical_language: 'en', title: 'Integration article',
  visibility: 'private', updated_at: '2026-10-06', tags: [], relations: [], engagement: { likes: 0, comments: 0 },
  translations: ['en','zh'].map(language => ({ id: `fixture-${language}`, language,
    title: language === 'en' ? 'Integration article' : '集成验证文章', content: language === 'en'
      ? '# Integration article\n\nOriginal body.\n\n- First item\n- Second item\n\nInline $E=mc^2$ and \\(x+y\\).\n\n\\[ \\boxed{a + b} \\]\n\n$$\n\\frac{a}{b}\n$$\n\n```mermaid\nflowchart LR\n  A[Capture] --> B[Review]\n```'
      : '# 集成验证文章\n\n原始正文。', revision: 'r1',
    source_path: `resources/blog/fixture-article/parts/body/${language}.md` })),
};
let documents = [document];
let sync: DeliverySyncStatus = { local_head: 'local123', remote_head: 'remote123', local_commits: 1,
  remote_commits: 0, workspace_changes: 0, state: 'local_ahead' };
let saveCount=0, deployCount=0, pullCount=0, nextConflict=false, nextFailure=false;
let lastCommand='';
const plan: DeploymentPlan = { branch:'main', head:'local123', deploy_target:'fixture.invalid',
  dirty_count:0, media_asset_count:0, next_action:'deploy', commit_activity:[], scopes:[] };
const notify = () => window.dispatchEvent(new Event('fixture-change'));
Object.assign(window, { __TAURI_INTERNALS__: {
  convertFileSrc: (path: string) => path,
  invoke: async (command: string, args: Record<string, any> = {}) => {
    lastCommand=command; notify();
    switch(command) {
      case 'list_documents': return structuredClone(documents);
      case 'list_library_series': return [];
      case 'get_workspace_preferences': return { default_language:'en', identity: { display_name:'Fixture Author', avatar_label:'F', avatar_reference:'' } };
      case 'get_dashboard': return { total_views:0,total_likes:0,total_comments:0,pending_comments:0,human_interactions:0,crawler_interactions:0,
        ai_crawler_interactions:0,search_crawler_interactions:0,recent_items:[],deployed_views:0,deployed_likes:0,deployed_comments:0,
        deployed_human_interactions:0,deployed_ai_crawler_interactions:0,deployed_search_crawler_interactions:0,deployed_ai_chat_referrals:0,
        stats_synced_at:null,today_visits:0,daily_visits:[],daily_seo_visits:[],daily_geo_visits:[],top_content:[],top_sources:[],top_countries:[] };
      case 'get_deployment_plan': return structuredClone(plan);
      case 'get_delivery_sync_status': return structuredClone(sync);
      case 'get_version_status': return { scope:args.scope,scope_label:'Blog',branch:'main',head:'local123',dirty_count:0,changes:[],recent_commits:[] };
      case 'get_resume_sections': return [];
      case 'get_interaction_details': return { is_complete:true,likers:[],comments:[] };
      case 'save_document': {
        const t=documents[0].translations.find(t=>t.id===args.id)!;
        if(nextConflict) { nextConflict=false; t.revision='external-revision'; t.content='External disk version.'; notify(); }
        if(args.expectedRevision!==t.revision) throw new Error('source changed on disk; reload before saving');
        if(nextFailure) { nextFailure=false; throw new Error('fixture disk unavailable'); }
        t.content=args.content; t.title=args.title; t.revision=`saved-${++saveCount}`;
        notify(); return structuredClone(documents[0]);
      }
      case 'save_content_settings': {
        const t=documents[0].translations.find(t=>t.id===args.id)!;
        if(args.expectedRevision!==t.revision) throw new Error('source changed on disk; reload before saving');
        t.title=args.metadata.title; t.revision=`saved-${++saveCount}`;
        documents[0].title=t.title; documents[0].visibility=args.state.visibility;
        notify(); return structuredClone(documents[0]);
      }
      case 'deploy_content': deployCount++; sync={...sync,local_commits:0,state:'synchronized'};notify();return { success:true,content_commit:'local123',static_published:true,static_release:'fixture-release',stdout:'',stderr:'' };
      case 'verify_remote_content': return { verified:true,expected_content_commit:'local123',remote:{health:'ok',content_hash:'fixture',content_commit:'local123',generated_at:'2026-10-06',media_root_ok:true},mismatch_reason:null };
      case 'pull_remote_content': pullCount++;sync={...sync,state:'synchronized',local_commits:0,remote_commits:0};notify();return structuredClone(sync);
      default: throw new Error(`Unhandled fixture command: ${command}`);
    }
  },
} });
function FixtureControls() {
  const [,render]=React.useReducer(n=>n+1,0);
  React.useEffect(()=>{window.addEventListener('fixture-change',render);return()=>window.removeEventListener('fixture-change',render);},[]);
  return <details style={{position:'fixed',bottom:0,right:0,zIndex:20000,background:'#fff',color:'#111',padding:8,maxWidth:460}}>
    <summary>Integration fixture controls</summary>
    <p>No real workspace, network AI or deployment writes.</p>
    <button onClick={()=>{nextConflict=true;notify();}}>Conflict on next save</button>
    <button onClick={()=>{nextFailure=true;notify();}}>Fail next save</button>
    <button onClick={()=>{sync={...sync,state:'remote_ahead',remote_commits:1,local_commits:0,remote_head:`remote-${Date.now()}`};notify();}}>Remote ahead</button>
    <button onClick={()=>{localStorage.clear();location.reload();}}>Reset fixture</button>
    <output>Saved {saveCount}; deployed {deployCount}; pulled {pullCount}; last {lastCommand}; conflict armed {String(nextConflict)}</output>
    <pre aria-label="Persisted fixture text">{documents[0].translations.map(t=>`${t.language}: ${t.content}`).join('\n')}</pre>
  </details>;
}
createRoot(window.document.getElementById('root')!).render(<React.StrictMode><PaidAiGateProvider><App /></PaidAiGateProvider><FixtureControls /></React.StrictMode>);
