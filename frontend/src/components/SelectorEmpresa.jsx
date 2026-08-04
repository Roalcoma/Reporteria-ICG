import { useState } from 'react';
import { api } from '../api';

/**
 * Paso posterior al login: el usuario elige la empresa de GESTION sobre la que
 * va a trabajar. Solo se listan las empresas a las que tiene permiso en ICG.
 */
export default function SelectorEmpresa({ usuario, empresas, onElegir }) {
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(null);

  const elegir = async (emp) => {
    setCargando(emp.codEmpresa); setError(null);
    try {
      onElegir(await api.fijarEmpresa(emp.codEmpresa));
    } catch (e) { setError(e.message); setCargando(null); }
  };

  return (
    <div className="login-wrap">
      <div className="empresa-box">
        <h1>Seleccione la empresa</h1>
        <p className="muted">{usuario} — empresas de gestión disponibles</p>
        {error && <div className="error">{error}</div>}
        {empresas?.length ? (
          <ul className="empresa-list">
            {empresas.map(e => (
              <li key={e.codEmpresa}>
                <button className="empresa-item" disabled={cargando != null}
                        onClick={() => elegir(e)}>
                  <span className="cod">{e.codEmpresa}</span>
                  <span>{e.nombre || '(sin nombre)'}</span>
                  {cargando === e.codEmpresa && <span className="muted"> …</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="error">Su usuario no tiene empresas de gestión asignadas en ICG.</div>
        )}
      </div>
    </div>
  );
}
