/**
 * EmptyCard — Dashboard «Наполни библиотеку» CTA.
 *
 * Amber-tinted call-to-action card per Library.html `.empty-card`.
 * «Выбрать набор» adds the 4-vector starter set directly to Коллекция.
 */
import { memo, useCallback } from 'react';
import { useStore } from '../../store';
import { buildStarterSet } from '../Library/lib/starter-set';

export const EmptyCard = memo(function EmptyCard() {
  const addLibraryEntriesBulk = useStore((s) => s.addLibraryEntriesBulk);
  const showToast = useStore((s) => s.showToast);

  const onAddStarterSet = useCallback(async () => {
    try {
      const entries = buildStarterSet();
      await addLibraryEntriesBulk(entries);
      showToast?.(`Базовый набор добавлен: ${entries.length} вектора`, 'success');
    } catch (e) {
      showToast?.(e?.message || 'Ошибка', 'error');
    }
  }, [addLibraryEntriesBulk, showToast]);

  return (
    <div className="empty-card" data-testid="ss-empty-card">
      <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>📚</span>
      <div style={{ flex: 1 }}>
        <h4>Сначала наполните библиотеку</h4>
        <p>Перетащите .dna / .gb в это окно или возьмите готовый набор: pUC19, pET28b, базовые CRISPR-векторы.</p>
      </div>
      <button
        type="button"
        className="empty-card-cta"
        data-testid="ss-empty-cta"
        onClick={onAddStarterSet}
      >Выбрать набор</button>
    </div>
  );
});

export default EmptyCard;
