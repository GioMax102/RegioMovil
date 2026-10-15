import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './responsive.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="error-screen">
          <h1>Volvamos al camino.</h1>
          <p>
            No pudimos mostrar esta pantalla. Tus trayectos guardados siguen en este dispositivo.
          </p>
          <button onClick={() => location.reload()}>Volver a intentar</button>
        </main>
      );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
if (
  'serviceWorker' in navigator &&
  !import.meta.env.DEV &&
  !location.href.startsWith('capacitor:')
) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
