/**
 * Sprint UX-1 prototype — root layout.
 *
 * Rendered from `main.jsx` when `?ux=prototype` is present in the URL. Lives
 * fully outside the main `<App />` tree so no Zustand wiring, no routing, no
 * side effects on the production flow. Three row-panels (Canvas Blocks / Plasmid
 * viewer / Annotation editor) — in K1 all three are placeholders, K2/K3/K4 fill
 * them with wrappers or minimal forks.
 */
import './prototype-tokens.css';
import { fixture } from './fixture';

export function isPrototypeURL(search) {
  try {
    return new URLSearchParams(search || '').get('ux') === 'prototype';
  } catch {
    return false;
  }
}

export default function Prototype() {
  return (
    <div className="ux-prototype-root">
      <header className="ux-proto-header">
        <h1 className="ux-proto-title">BodgeGene · UX-1 prototype</h1>
        <span className="ux-proto-subtitle">
          fixture: {fixture.name} · {fixture.length} bp · {fixture.annotations.length} annotations
        </span>
      </header>
      <main className="ux-proto-main">
        <section className="ux-proto-panel" aria-label="Canvas Blocks view prototype">
          <h2 className="ux-proto-panel-title">Canvas Blocks view</h2>
          <div className="ux-proto-panel-placeholder">Canvas Blocks prototype (K2)</div>
        </section>
        <section className="ux-proto-panel" aria-label="PlasmidViewer prototype">
          <h2 className="ux-proto-panel-title">Plasmid viewer</h2>
          <div className="ux-proto-panel-placeholder">PlasmidViewer prototype (K3)</div>
        </section>
        <section className="ux-proto-panel" aria-label="AnnotationEditor prototype">
          <h2 className="ux-proto-panel-title">Annotation editor</h2>
          <div className="ux-proto-panel-placeholder">AnnotationEditor prototype (K4)</div>
        </section>
      </main>
    </div>
  );
}
