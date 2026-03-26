import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626' }}>Ошибка рендеринга</h2>
          <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, overflow: 'auto',
            border: '1px solid #fca5a5', fontSize: 13, lineHeight: 1.5 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#dc2626', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            Очистить данные и перезагрузить
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
