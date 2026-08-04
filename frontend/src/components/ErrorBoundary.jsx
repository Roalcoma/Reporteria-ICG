import { Component } from 'react';

/**
 * Red de seguridad: si una pantalla lanza un error durante el render, React
 * desmonta TODO el arbol y el usuario ve una pagina en blanco, sin pista alguna.
 * Este limite atrapa el fallo, deja el resto de la aplicacion en pie y muestra
 * el mensaje para poder diagnosticarlo.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('Error en la pantalla:', error, info?.componentStack);
  }

  reintentar = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="pantalla-error">
        <h2>Esta pantalla no se pudo mostrar</h2>
        <p className="muted">
          El resto de la aplicación sigue funcionando: puedes volver a intentarlo
          o cambiar de sección.
        </p>
        <pre className="error-detalle">{error.message || String(error)}</pre>
        {info?.componentStack && (
          <details>
            <summary>Detalle técnico</summary>
            <pre className="error-detalle">{info.componentStack.trim()}</pre>
          </details>
        )}
        <div className="acciones">
          <button className="primary" onClick={this.reintentar}>Reintentar</button>
        </div>
      </div>
    );
  }
}
