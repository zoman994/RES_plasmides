/**
 * EmptyCard — Sprint StartScreen-Pixel.
 *
 * Amber-tinted call-to-action card per Library.html `.empty-card`.
 * CTA «Выбрать набор» is a stub (`console.log('TODO: pick-set')`).
 */
import { memo } from 'react';

export const EmptyCard = memo(function EmptyCard() {
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
        onClick={() => {
          // eslint-disable-next-line no-console
          console.log('TODO: pick-set');
        }}
      >Выбрать набор</button>
    </div>
  );
});

export default EmptyCard;
