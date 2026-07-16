/**
 * SearchFilterMenu — K2.2. The "+ Filter" menu (§9.3). A menu-button opens a
 * role=menu of filter TYPES with roving focus (Arrow/Home/End, focus the first
 * item on open). Choosing a type opens a stage:
 *   • text (name/annotation/tag) → a role=dialog popover with an input (NOT an
 *     input nested inside role=menu), committed on Enter;
 *   • enum (type/status) → a role=menu of the supplied options;
 *   • entity (project) → a role=menu of {projectId,label} options; committing
 *     passes the STABLE identity, never a typed name (spec §617).
 * Emitting calls onAddFilter(def, value) — the surface turns it into a chip.
 *
 * Full lifecycle, fail-closed: disabling closes immediately and blocks
 * pick/commit (and re-enabling does not resurrect a stage); Enter/Escape during
 * IME composition neither commit nor close; focus returns to the trigger after
 * close/Escape/select; a def / option / trigger without a real name, and an
 * empty value, are refused.
 *
 * UI-only: React + the project Icon + in-cluster siblings.
 * No manual useMemo/useCallback (AGENTS.md §244 — React Compiler memoizes).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { hasText } from './searchUiContract';

const MENU_STYLE = {
  position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 2,
  listStyle: 'none', margin: 0, padding: '4px 0', minWidth: 170,
  background: 'var(--surface-1)', border: '1px solid var(--border-default)',
  borderRadius: 8, boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))',
};
const ITEM_STYLE = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '4px 10px', fontSize: 12, cursor: 'pointer',
  background: 'transparent', border: 'none', color: 'var(--text-primary)',
};

export default function SearchFilterMenu({
  filterDefs = [],
  enumOptions = {},
  entityOptions = {},
  onAddFilter,
  triggerLabel,
  ariaLabel,
  disabled = false,
  testId = 'search-filter',
}) {
  const [open, setOpen] = useState(false);
  // The picked filter is held by STABLE id, not as a captured object — it is
  // re-resolved from the current actionable set every render (corr3-1), so a def
  // the parent removes can never keep a live stage.
  const [activeDefId, setActiveDefId] = useState(null); // null → showing the type list
  const [textValue, setTextValue] = useState('');
  // Roving focus is tracked by the item KEY, not a numeric index (corr3-2), so
  // focus follows the item across a reorder / shrink instead of a fixed slot.
  const [activeKey, setActiveKey] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const composingRef = useRef(false);

  // A single accessible name for the trigger AND the menu popup: the explicit
  // ariaLabel, else the visible triggerLabel. Computed first because losing it is
  // one of the conditions that must drain the session (corr3-3).
  const accessibleLabel = hasText(ariaLabel) ? ariaLabel.trim() : (hasText(triggerLabel) ? triggerLabel.trim() : null);

  const validEnum = (def) => (enumOptions[def.enumKey] || []).filter((o) => hasText(o.label) && hasText(o.value == null ? '' : String(o.value)));
  const validEntity = (def) => (entityOptions[def.entityKind] || []).filter((o) => hasText(o.label) && hasText(o.projectId));

  // A def is offered only if it is actionable: a supported inputType AND (for
  // enum/entity) at least one valid option. This keeps an unknown-type def or an
  // option-less enum out of the menu, so a chosen stage can never be empty.
  const actionableDef = (d) => {
    if (!hasText(d.label)) return false;
    if (d.inputType === 'text') return true;
    if (d.inputType === 'enum') return validEnum(d).length > 0;
    if (d.inputType === 'entity') return validEntity(d).length > 0;
    return false;
  };
  const actionableDefs = filterDefs.filter(actionableDef);
  // Resolve the active def FRESH by id among the current actionable defs. If the
  // parent removed it (or its options drained so it is no longer actionable), it
  // resolves to null → activeDefLost → full drain below.
  const activeDef = activeDefId != null ? actionableDefs.find((d) => d.id === activeDefId) || null : null;
  const activeDefLost = activeDefId != null && activeDef == null;
  const enumList = activeDef && activeDef.inputType === 'enum' ? validEnum(activeDef) : [];
  const entityList = activeDef && activeDef.inputType === 'entity' ? validEntity(activeDef) : [];

  // Whether the CURRENT open stage has anything to show. Text always has content
  // (the input); a menuitem stage needs at least one item.
  const stageHasContent = !activeDef ? actionableDefs.length > 0
    : activeDef.inputType === 'text' ? true
      : activeDef.inputType === 'enum' ? enumList.length > 0
        : activeDef.inputType === 'entity' ? entityList.length > 0
          : false; // unknown inputType → no content

  // Continuous fail-closed drain. The session is fully torn down (closed + stage
  // cleared) when: the control is disabled, its accessible name is gone (corr3-3),
  // the active def dropped out of the actionable set (corr3-1), or an OPEN stage
  // drained to nothing after open. Render-time pure-state setters only (no ref
  // write); the composition flag is cleared in an effect below; the refocus
  // effect returns focus. Guards keep the setState convergent.
  const sessionDead = disabled || !accessibleLabel;
  const shouldDrain = sessionDead || activeDefLost || (open && !stageHasContent);
  if (shouldDrain) {
    if (open) setOpen(false);
    if (activeDefId != null) setActiveDefId(null);
    if (textValue) setTextValue('');
    if (activeKey != null) setActiveKey(null);
  }
  const effectiveOpen = open && !disabled && !!accessibleLabel;

  const resetStages = () => { setActiveDefId(null); setTextValue(''); setActiveKey(null); composingRef.current = false; };
  const closeAndRefocus = () => { setOpen(false); resetStages(); triggerRef.current?.focus(); };

  const pickDef = (def) => { if (disabled) return; setActiveDefId(def.id); setTextValue(''); setActiveKey(null); };
  const commitText = () => { if (disabled || !activeDef || !hasText(textValue)) return; onAddFilter?.(activeDef, textValue.trim()); closeAndRefocus(); };
  const commitEnum = (opt) => { if (disabled || !activeDef) return; onAddFilter?.(activeDef, opt.value); closeAndRefocus(); };
  const commitEntity = (opt) => { if (disabled || !activeDef) return; onAddFilter?.(activeDef, { projectId: opt.projectId, label: opt.label }); closeAndRefocus(); };

  const isMenuStage = effectiveOpen && stageHasContent && (!activeDef || activeDef.inputType === 'enum' || activeDef.inputType === 'entity');
  const isTextStage = effectiveOpen && activeDef && activeDef.inputType === 'text';
  const menuItems = !effectiveOpen ? []
    : !activeDef ? actionableDefs.map((d) => ({ key: d.id, tid: `${testId}-def-${d.id}`, label: d.label, activate: () => pickDef(d) }))
      : activeDef.inputType === 'enum' ? enumList.map((o) => ({ key: o.value, tid: `${testId}-enum-${o.value}`, label: o.label, activate: () => commitEnum(o) }))
        : activeDef.inputType === 'entity' ? entityList.map((o) => ({ key: o.projectId, tid: `${testId}-entity-${o.projectId}`, label: o.label, activate: () => commitEntity(o) }))
          : [];
  // The effective roving target: the stored key if still present, else the first
  // item. Because focus tracks the KEY, the DOM-focused item and the tabIndex=0
  // item stay on the SAME element across a reorder or shrink (corr3-2).
  const effectiveActiveKey = menuItems.some((it) => it.key === activeKey) ? activeKey : (menuItems.length ? menuItems[0].key : null);
  const moveActive = (delta) => {
    const count = menuItems.length;
    if (!count) return;
    const cur = menuItems.findIndex((it) => it.key === effectiveActiveKey);
    const base = cur < 0 ? 0 : cur;
    setActiveKey(menuItems[(base + delta + count) % count].key);
  };

  // Roving focus: focus the active menuitem whenever a menuitem stage renders.
  // Locates the node by its data-menukey so it depends only on the active KEY (not
  // a raw index): a reorder that keeps the same key does not steal focus, while
  // losing the key refocuses the fallback (first) item.
  useEffect(() => {
    if (!isMenuStage) return;
    const nodes = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (!nodes || !nodes.length) return;
    let target = nodes[0];
    for (const n of nodes) { if (n.getAttribute('data-menukey') === String(effectiveActiveKey)) { target = n; break; } }
    target.focus();
  }, [isMenuStage, activeDef, effectiveActiveKey]);

  // Single authoritative invariant for ANY popup open → closed transition
  // (Escape, select, disable, drain, activeDefLost, lost accessible name):
  //   1) abandon any in-flight IME composition — a stuck composing flag would
  //      otherwise swallow the next Enter/Escape after the popup re-opens;
  //   2) if a drained menuitem unmounted and dropped focus to the body, return
  //      focus to the trigger so keyboard control is never stuck.
  // A ref cannot be written during render, so this lives in the effect that fires
  // on exactly that transition. Composition can only start while the text stage is
  // open (popupOpen true), so clearing it on close is both sufficient and safe.
  const popupOpen = isMenuStage || isTextStage;
  const wasPopupOpenRef = useRef(false);
  useEffect(() => {
    if (wasPopupOpenRef.current && !popupOpen) {
      composingRef.current = false;
      if (document.activeElement === document.body || document.activeElement == null) {
        triggerRef.current?.focus();
      }
    }
    wasPopupOpenRef.current = popupOpen;
  }, [popupOpen]);

  // Fail-closed: without an accessible name, the "+ Filter" affordance is not
  // rendered (no unnamed control / popup). The drain above already tore the
  // session down, so a later restored label starts clean — no resurrection.
  if (!accessibleLabel) return null;

  const onMenuKeyDown = (e) => {
    if (composingRef.current || e.nativeEvent?.isComposing) return;
    const count = menuItems.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1); break;
      case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
      case 'Home': e.preventDefault(); if (count) setActiveKey(menuItems[0].key); break;
      case 'End': e.preventDefault(); if (count) setActiveKey(menuItems[count - 1].key); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); closeAndRefocus(); break;
      default: break;
    }
  };

  const onTextKeyDown = (e) => {
    if (composingRef.current || e.nativeEvent?.isComposing) return; // IME: do not act mid-composition
    if (e.key === 'Enter') { e.preventDefault(); commitText(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAndRefocus(); }
  };

  return (
    <div data-testid={testId} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={`${testId}-trigger`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={effectiveOpen ? 'true' : 'false'}
        aria-label={accessibleLabel}
        // Never open a menu with nothing to offer.
        onClick={() => { if (disabled) return; if (open) closeAndRefocus(); else if (actionableDefs.length > 0) setOpen(true); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '3px 8px', fontSize: 12,
          background: 'transparent', color: 'var(--text-secondary)',
          border: '1px dashed var(--border-default)', borderRadius: 8,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <Icon name="filter" size={12} />
        <span>{triggerLabel}</span>
      </button>

      {isMenuStage && (
        <ul
          ref={menuRef}
          data-testid={`${testId}-menu`}
          role="menu"
          aria-label={accessibleLabel}
          onKeyDown={onMenuKeyDown}
          style={MENU_STYLE}
        >
          {menuItems.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={it.key === effectiveActiveKey ? 0 : -1}
                data-testid={it.tid}
                data-menukey={String(it.key)}
                onClick={it.activate}
                style={ITEM_STYLE}
              >{it.label}</button>
            </li>
          ))}
        </ul>
      )}

      {isTextStage && (
        <div
          data-testid={`${testId}-value`}
          role="dialog"
          aria-label={activeDef.label}
          style={{ ...MENU_STYLE, padding: 8 }}
        >
          <input
            data-testid={`${testId}-value-input`}
            type="text"
            autoFocus
            aria-label={activeDef.label}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            // A blur abandons any in-flight composition; clear the flag defensively
            // so a compositionend that never arrives can't leave Enter/Escape stuck.
            onBlur={() => { composingRef.current = false; }}
            onKeyDown={onTextKeyDown}
            style={{
              width: 150, padding: '3px 6px', fontSize: 12,
              border: '1px solid var(--border-default)', borderRadius: 6,
              background: 'var(--surface-2)', color: 'var(--text-primary)',
            }}
          />
        </div>
      )}
    </div>
  );
}
