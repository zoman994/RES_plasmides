/**
 * ActionsBar — primary actions for ImportStartScreen.
 *
 * mode='single' → Polish layout:
 *     [На канвас] [В библиотеку]?  |  [Аннотировать]    ⋯
 *   primary destinations on the left, annotate after a vertical divider,
 *   ellipsis-icon dropdown on the far right with low-frequency actions
 *   (download .gb / delete from session).
 * mode='multi'  → На канвас (disabled) + В библиотеку (N) + ⋯ dropdown
 *                 (multi-mode actions are gated to library batch only).
 *
 * libraryEnabled (single-mode only): when false the «В библиотеку» button is
 * hidden — used for catalog items already in the library where adding again
 * would be a no-op. SingleInspector flips it on once the user annotates the
 * item or pastes/imports a new sequence.
 *
 * «Заменить файл» dropdown entry was dropped 28.04.2026 — duplicated a simple
 * catalog click + the modal close-and-redrop. Restriction / Мутагенез /
 * Разобрать removed entirely (Polish §6) — they operate on post-canvas state
 * and surface via canvas ContextMenu.
 */

import { useState } from 'react';

const TIP_NEEDS_SINGLE = 'доступно для одиночной загрузки';

export default function ActionsBar({
  mode = 'single',
  onAction,
  count = 1,
  hasParsedItem = true,
  exportEnabled = false,
  libraryEnabled = true,
}) {
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const isMulti = mode === 'multi';
  const fire = (id) => {
    setSecondaryOpen(false);
    onAction?.(id);
  };

  return (
    <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
      {!isMulti && (
        <>
          <button
            onClick={() => fire('canvas')}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            data-testid="action-canvas"
          >
            На канвас
          </button>
          {libraryEnabled && (
            <button
              onClick={() => fire('library')}
              className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              data-testid="action-library"
            >
              В библиотеку
            </button>
          )}
          <span className="w-px h-5 bg-gray-200 mx-1" data-testid="actions-divider" />
        </>
      )}
      {isMulti && (
        <>
          <button
            disabled
            title={TIP_NEEDS_SINGLE}
            className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-400 cursor-not-allowed"
            data-testid="action-canvas-disabled"
          >
            На канвас
          </button>
          {/* Kfix-3 (F-E): single primary action — per-row checkbox controls
              whether autoAnnotate runs before addPart. */}
          <button
            onClick={() => fire('library-batch')}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            data-testid="action-library-batch"
          >
            В библиотеку ({count})
          </button>
        </>
      )}
      <div className="relative">
        <button
          onClick={() => setSecondaryOpen((v) => !v)}
          className="text-base leading-none px-2.5 py-1.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          aria-label="Дополнительно"
          title="Дополнительно"
          data-testid="action-secondary-toggle"
        >
          ⋯
        </button>
        {secondaryOpen && (
          <div
            className="absolute right-0 bottom-full mb-1 z-10 bg-white border border-gray-200 rounded shadow-lg w-48 py-1"
            data-testid="actions-secondary-popup"
          >
            {!isMulti && (
              <>
                <button
                  type="button"
                  onClick={() => fire('annotate')}
                  disabled={!hasParsedItem}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                  data-testid="action-annotate"
                >
                  📥 Авто-аннотация
                </button>
                <div className="my-1 border-t border-gray-100" />
              </>
            )}
            <button
              type="button"
              onClick={() => fire('download-gb')}
              disabled={!exportEnabled || !hasParsedItem}
              title={!exportEnabled ? 'скоро' : undefined}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
              data-testid="action-download-gb"
            >
              💾 Скачать как .gb
            </button>
            <button
              type="button"
              onClick={() => fire('delete')}
              disabled={!hasParsedItem}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-red-50 text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed"
              data-testid="action-delete"
            >
              🗑 Удалить из сессии
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
