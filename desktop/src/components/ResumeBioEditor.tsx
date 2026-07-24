import { FileText, LoaderCircle, Save, Type } from 'lucide-react';
import { LanguageCloseControls } from './LanguageCloseControls';
import MarkdownEditor from './MarkdownEditor';

export function ResumeBioEditor({
  value,
  language,
  sourcePath,
  disabled,
  dirty,
  toolbarVisible,
  onChange,
  onLanguageChange,
  onSave,
  onCancel,
  onToggleToolbar,
}: {
  value: string;
  language: string;
  sourcePath: string;
  disabled: boolean;
  dirty: boolean;
  toolbarVisible: boolean;
  onChange: (value: string) => void;
  onLanguageChange: (language: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleToolbar: () => void;
}) {
  return (
    <section className="content-editor-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-bio-editor-title">
      <div className="content-editor-shell">
        <header className="content-editor-header">
          <div className="content-editor-title">
            <span className="badge badge-resume">resume</span>
            <div>
              <h2 id="resume-bio-editor-title">Bio</h2>
              <p>summary · 1 Markdown part</p>
            </div>
          </div>
          <div className="content-editor-actions">
            <button
              type="button"
              className={`content-close content-toolbar-toggle ${toolbarVisible ? 'active' : ''}`}
              aria-pressed={toolbarVisible}
              onClick={onToggleToolbar}
              title={toolbarVisible ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
              aria-label={toolbarVisible ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
            >
              <Type size={15} />
            </button>
            <button
              type="button"
              className={`content-save ${disabled ? 'pending' : ''}`}
              disabled={!dirty || disabled}
              onClick={onSave}
            >
              {disabled ? <LoaderCircle size={15} /> : <Save size={15} />}
              {disabled ? 'Saving' : 'Save'}
            </button>
          </div>
        </header>

        <LanguageCloseControls
          fixed
          languages={[
            { language: 'en', dirty: dirty && language === 'en' },
            { language: 'zh', dirty: dirty && language === 'zh' },
          ]}
          activeLanguage={language}
          disabled={disabled}
          closeLabel="Close content editor"
          onLanguageSelect={onLanguageChange}
          onClose={onCancel}
        />

        <div className="content-editor-body">
          <aside className="content-part-rail" aria-label="Resume Markdown parts">
            <div className="content-part-rail-head">
              <span>Parts</span>
              <strong>1</strong>
            </div>
            <div className="document-row active">
              <FileText size={14} />
              <div className="document-copy">
                <strong>Bio</strong>
                <small>summary</small>
              </div>
              {dirty && <span className="dirty-dot" />}
            </div>
          </aside>

          <section className="content-writing-panel" aria-label="Resume bio Markdown editor">
            <header className="document-header content-document-header">
              <div className="document-identity">
                <FileText size={16} />
                <div>
                  <h2>Bio</h2>
                  <p>summary · {sourcePath}</p>
                </div>
              </div>
            </header>
            <div className="editor-frame content-editor-frame" data-entity="resume" data-toolbar={toolbarVisible ? 'visible' : 'hidden'}>
              <MarkdownEditor
                key={language}
                value={value}
                ariaLabel={`Resume bio editor (${language})`}
                disabled={disabled}
                toolbarVisible={toolbarVisible}
                onChange={onChange}
              />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
