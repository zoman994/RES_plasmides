import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { purgeStaleServiceWorkers } from './lib/pwa-install.js'

// V77 — DEV ONLY. A service worker from a past build/preview keeps
// serving its old precache on the dev origin, so `npm run dev` shows
// stale code. import.meta.env.DEV is false in the production build, so
// the real PWA SW (offline) is untouched there. If a SW was still
// controlling this page, reload ONCE (sessionStorage-guarded — no loop)
// so the dev server serves fresh files.
if (import.meta.env.DEV) {
  purgeStaleServiceWorkers().then((r) => {
    if (r.hadController && !sessionStorage.getItem('bg-dev-sw-purged')) {
      sessionStorage.setItem('bg-dev-sw-purged', '1');
      window.location.reload();
    }
  }).catch(() => { /* best-effort */ });
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626' }}>Render error</h2>
          <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, overflow: 'auto',
            border: '1px solid #fca5a5', fontSize: 13, lineHeight: 1.5 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button onClick={() => { try { localStorage.clear(); } catch { /* ignore */ } window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#dc2626', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            Clear data and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
