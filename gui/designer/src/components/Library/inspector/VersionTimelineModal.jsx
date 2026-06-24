/**
 * VersionTimelineModal — the «История версий» overlay (entry point from the
 * Library). Wraps VersionTimeline; clicking a node calls onSelect (the host
 * navigates the library to that version) and closes.
 */
import VersionTimeline from './VersionTimeline';

export default function VersionTimelineModal({ model, onSelect, onClose }) {
  return (
    <div
      data-testid="version-timeline-modal"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(900px, 94vw)', maxHeight: '84vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-1, #fff)', border: '1px solid var(--border-default, #d6d3d1)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle, #e7e5e4)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #1c1917)' }}>История версий</div>
          <button
            type="button" data-testid="version-timeline-close" onClick={onClose}
            style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-default, #d6d3d1)', background: 'var(--surface-1, #fff)', color: 'var(--text-secondary, #57534e)', fontSize: 13 }}
          >✕</button>
        </div>
        <div style={{ padding: 14, overflow: 'auto', minHeight: 80 }}>
          <VersionTimeline model={model} onSelect={onSelect} />
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-subtle, #e7e5e4)', fontSize: 11, color: 'var(--text-tertiary, #78716c)' }}>
          серый — импорт / оригинал · янтарь — правка / версия · клик по узлу — открыть эту версию
        </div>
      </div>
    </div>
  );
}
