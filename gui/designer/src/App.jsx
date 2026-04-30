import { useEffect } from 'react';
import { useStore, bootstrapStore } from './store';

export default function App() {
  useEffect(() => {
    bootstrapStore();
  }, []);
  const theme = useStore(s => s.theme);
  return (
    <div data-theme={theme} style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>BodgeGene v0.6.0-dev</h1>
      <p style={{ color: '#666', fontSize: 13, marginTop: 8 }}>
        M-A scaffold (K2). UI wiring lands in K4–K6.
      </p>
    </div>
  );
}
