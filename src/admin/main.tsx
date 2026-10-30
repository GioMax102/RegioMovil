import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp';
import './admin.css';

class AdminBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="admin-login">
        <h1>No pudimos mostrar la administración</h1>
        <p>Recarga para volver a comprobar tu sesión.</p>
        <button onClick={() => location.reload()}>Recargar</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminBoundary>
      <AdminApp />
    </AdminBoundary>
  </React.StrictMode>,
);
