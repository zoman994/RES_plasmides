/**
 * ActionsBar — primary actions for ImportStartScreen.
 *
 * mode='single' → 3 primary (canvas / library / annotate) + Действия ▾ dropdown
 * mode='multi'  → 2 primary (annotate→library / library) + restricted dropdown
 *                 with На канвас / Restriction / Мутагенез / Разобрать all disabled
 */

import { useState } from 'react';

const SECONDARY = [
  { id: 'restriction', label: 'Restriction' },
  { id: 'mutagenesis', label: 'Мутагенез' },
  { id: 'disassemble', label: 'Разобрать' },
];

const TIP_NEEDS_CANVAS = 'доступно для одиночной плазмиды на канвасе';
const TIP_NEEDS_SINGLE = 'доступно для одиночной загрузки';

export default function ActionsBar({ mode = 'single', onAction, count = 1 }) {
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const isMulti = mode === 'multi';

  return (
    <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
      {!isMulti && (
        <>
          <button
            onClick={() => onAction?.('canvas')}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            data-testid="action-canvas"
          >
            На канвас
          </button>
          <button
            onClick={() => onAction?.('library')}
            className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            data-testid="action-library"
          >
            В библиотеку
          </button>
          <button
            onClick={() => onAction?.('annotate')}
            className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            data-testid="action-annotate"
          >
            Аннотировать
          </button>
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
          <button
            onClick={() => onAction?.('annotate-batch')}
            className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            data-testid="action-annotate-batch"
          >
            Аннотировать → в библиотеку
          </button>
          <button
            onClick={() => onAction?.('library-batch')}
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
          className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Действия ▾
        </button>
        {secondaryOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded shadow-lg w-44">
            {SECONDARY.map((a) => (
              <button
                key={a.id}
                disabled
                title={isMulti ? TIP_NEEDS_SINGLE : TIP_NEEDS_CANVAS}
                className="w-full text-left text-xs px-3 py-1.5 text-gray-400 cursor-not-allowed border-b border-gray-100 last:border-b-0"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
