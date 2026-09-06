import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { formatHotkey } from '../lib/hotkeys';
import { STRINGS } from '../lib/strings';
import useModalKeyboardBoundary from '../hooks/useModalKeyboardBoundary';

const NAME_MAX = 100;
const DESC_MAX = 1000;
const TAG_MAX_CHARS = 50;
const TAG_MAX_COUNT = 20;

function normalizeTag(raw) {
  return (raw || '').trim().toLowerCase();
}

export default function ProjectInfoModal() {
  const projectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (projectId ? s.projects[projectId] : null));
  const allProjects = useStore(s => s.projects);
  const closeProjectInfo = useStore(s => s.closeProjectInfo);
  const renameProject = useStore(s => s.renameProject);
  const updateDescription = useStore(s => s.updateDescription);
  const addTag = useStore(s => s.addTag);
  const removeTag = useStore(s => s.removeTag);
  const showToast = useStore(s => s.showToast);
  const modalBoundary = useModalKeyboardBoundary(closeProjectInfo, { active: !!project });

  const initialTags = project?.tags || [];
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [tags, setTags] = useState(initialTags);
  const [tagInput, setTagInput] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, []);

  function addTagFromInput() {
    const norm = normalizeTag(tagInput);
    if (!norm) { setTagInput(''); return; }
    if (norm.length > TAG_MAX_CHARS) return;
    if (tags.includes(norm)) { setTagInput(''); return; }
    if (tags.length >= TAG_MAX_COUNT) return;
    setTags([...tags, norm]);
    setTagInput('');
  }

  function removeTagAt(tag) {
    setTags(tags.filter(t => t !== tag));
  }

  function addTagFromSuggestion(tag) {
    const norm = normalizeTag(tag);
    if (!norm) return;
    if (tags.includes(norm)) return;
    if (tags.length >= TAG_MAX_COUNT) return;
    setTags([...tags, norm]);
  }

  function onTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTagFromInput();
    }
  }

  function onSave() {
    const nameTrimmed = name.trim().slice(0, NAME_MAX) || 'Untitled';
    const descTrimmed = description.trim().slice(0, DESC_MAX);
    if (nameTrimmed !== project.name) renameProject(nameTrimmed);
    if (descTrimmed !== (project.description || '')) updateDescription(descTrimmed);
    const initialSet = new Set(initialTags);
    const finalSet = new Set(tags);
    for (const t of initialSet) if (!finalSet.has(t)) removeTag(t);
    for (const t of finalSet) if (!initialSet.has(t)) addTag(t);
    closeProjectInfo();
    showToast(STRINGS.projectInfo.savedToast, 'success');
  }

  function onCancel() {
    closeProjectInfo();
  }

  const tagsFull = tags.length >= TAG_MAX_COUNT;

  const tagSuggestions = useMemo(() => {
    if (!allProjects) return [];
    const counts = new Map();
    for (const p of Object.values(allProjects)) {
      if (!p || !Array.isArray(p.tags)) continue;
      for (const t of p.tags) {
        const norm = normalizeTag(t);
        if (!norm) continue;
        counts.set(norm, (counts.get(norm) || 0) + 1);
      }
    }
    const tagsSet = new Set(tags);
    return Array.from(counts.entries())
      .filter(([t]) => !tagsSet.has(t))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }, [allProjects, tags]);

  if (!project) return null;

  return (
    <div
      data-testid="project-info-modal-backdrop"
      role="dialog"
      {...modalBoundary}
      onClick={onCancel}
      className="modal-anim-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="project-info-modal"
        onClick={(e) => e.stopPropagation()}
        className="modal-anim-body"
        style={{
          background: 'var(--surface-1, #ffffff)',
          color: 'var(--text-primary, #1c1917)',
          padding: 0,
          borderRadius: 'var(--radius-lg, 8px)',
          minWidth: 480,
          maxWidth: 560,
          boxShadow: 'var(--shadow-xl)',
          border: '0.5px solid var(--border-default, #d6d3d1)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{STRINGS.projectInfo.title}</h2>
          <button
            type="button"
            onClick={onCancel}
            data-testid="project-info-close"
            title={`${STRINGS.projectInfo.closeTitle} ⋅ ${formatHotkey('escape')}`}
            aria-label={STRINGS.projectInfo.closeAria}
            style={{
              background: 'transparent', border: 'none',
              fontSize: 18, cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >×</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label
              htmlFor="project-info-name"
              style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}
            >{STRINGS.projectInfo.nameLabel}</label>
            <input
              ref={nameRef}
              id="project-info-name"
              data-testid="project-info-name"
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 13,
                border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                background: 'var(--surface-2)', color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="project-info-description"
              style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}
            >{STRINGS.projectInfo.descriptionLabel}</label>
            <textarea
              id="project-info-description"
              data-testid="project-info-description"
              rows={4}
              value={description}
              maxLength={DESC_MAX}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 13,
                border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                background: 'var(--surface-2)', color: 'var(--text-primary)',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}
            >{STRINGS.projectInfo.tagsLabel}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {tags.map(tag => (
                <span
                  key={tag}
                  data-testid={`project-info-tag-${tag}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, padding: '2px 4px 2px 8px',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    background: 'var(--surface-3, #e7e5e4)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTagAt(tag)}
                    data-testid={`project-info-tag-remove-${tag}`}
                    aria-label={STRINGS.projectInfo.tagRemoveAria(tag)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 12, lineHeight: 1, padding: '0 4px',
                      color: 'var(--text-tertiary)',
                    }}
                  >×</button>
                </span>
              ))}
            </div>
            {tagSuggestions.length > 0 && !tagsFull && (
              <div
                data-testid="project-info-tag-suggestions"
                style={{ marginBottom: 8 }}
              >
                <p style={{
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  margin: '0 0 4px',
                }}>{STRINGS.projectInfo.tagSuggestionsHeader}</p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {tagSuggestions.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTagFromSuggestion(tag)}
                      data-testid={`project-info-tag-suggestion-${tag}`}
                      title={STRINGS.projectInfo.tagAddSuggestionTitle(tag)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill, 9999px)',
                        border: '0.5px dashed var(--border-default)',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >+ {tag}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                data-testid="project-info-tag-input"
                type="text"
                value={tagInput}
                placeholder={tagsFull ? STRINGS.projectInfo.tagsLimitReached : STRINGS.projectInfo.tagInputPlaceholder}
                disabled={tagsFull}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                maxLength={TAG_MAX_CHARS}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 13,
                  border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-2)', color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                data-testid="project-info-tag-add"
                onClick={addTagFromInput}
                disabled={tagsFull || normalizeTag(tagInput) === ''}
                style={{
                  padding: '6px 14px', fontSize: 13,
                  border: '0.5px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-1)',
                  color: 'var(--text-primary)',
                  cursor: tagsFull ? 'not-allowed' : 'pointer',
                }}
              >{STRINGS.projectInfo.tagAddButton}</button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            padding: '12px 18px',
            borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
          }}
        >
          <button
            type="button"
            data-testid="project-info-cancel"
            onClick={onCancel}
            style={{
              padding: '6px 14px', fontSize: 13,
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'transparent', cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >{STRINGS.projectInfo.cancelButton}</button>
          <button
            type="button"
            data-testid="project-info-save"
            onClick={onSave}
            style={{
              padding: '6px 14px', fontSize: 13,
              border: '0.5px solid var(--accent-500)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-50)',
              color: 'var(--accent-text)',
              fontWeight: 500, cursor: 'pointer',
            }}
          >{STRINGS.projectInfo.saveButton}</button>
        </div>
      </div>
    </div>
  );
}
