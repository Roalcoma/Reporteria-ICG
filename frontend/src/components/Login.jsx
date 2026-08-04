import { useState } from 'react';
import { api } from '../api';

/**
 * Login SOLO POR CONTRASENA: en ICG la clave identifica al usuario
 * (verificado: sin claves duplicadas entre usuarios activos).
 * Al validar, el backend devuelve las empresas de gestion permitidas.
 */
export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setCargando(true); setError(null);
    try {
      onLogin(await api.login(password));
    } catch (err) { setError(err.message); setPassword(''); }
    finally { setCargando(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1>ICG Reportería</h1>
        <label>
          <span>Contraseña</span>
          <input type="password" value={password} autoFocus
                 onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={cargando || !password}>
          {cargando ? 'Validando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
