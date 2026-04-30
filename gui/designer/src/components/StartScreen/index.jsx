// K4 stub. Full wireframe v7 layout lands in K5.
import { useStore } from '../../store';

export default function StartScreen({ onOpenFile }) {
  const createProject = useStore(s => s.createProject);
  return (
    <div data-testid="start-screen" style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>BodgeGene</h1>
      <p style={{ color: 'var(--text-secondary, #57534e)', fontSize: 13, marginTop: 8 }}>
        Стартовый экран (K4 stub). Wireframe v7 layout — K5.
      </p>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => createProject()} type="button" data-testid="start-new">
          + New project
        </button>
        <button onClick={onOpenFile} type="button" data-testid="start-open">
          ↑ Open .bodge…
        </button>
      </div>
    </div>
  );
}
