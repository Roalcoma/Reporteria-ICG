import { useEffect, useState, lazy, Suspense } from 'react';
import { api } from './api';
import Login from './components/Login';
import SelectorEmpresa from './components/SelectorEmpresa';
import ArbolReportes from './components/ArbolReportes';
import ReporteViewer from './components/ReporteViewer';
import Programaciones from './components/Programaciones';
import Auditoria from './components/Auditoria';
import Procedimientos from './components/Procedimientos';
import Branding from './components/Branding';
import Usuarios from './components/Usuarios';
import Portabilidad from './components/Portabilidad';
import ErrorBoundary from './components/ErrorBoundary';
import Perfiles from './components/Perfiles';
import Icono from './components/Icono';

// Los dashboards arrastran ECharts: se cargan solo al entrar en la sección.
const Dashboards = lazy(() => import('./components/Dashboards'));
// El editor de orígenes usa Monaco: mismo motivo.
const Origenes = lazy(() => import('./components/Origenes'));
import HistorialReporte from './components/HistorialReporte';

// El editor arrastra Monaco (~MBs): se carga solo cuando un creador lo abre.
const ReporteEditor = lazy(() => import('./components/ReporteEditor'));

/** Flujo: contraseña -> elegir empresa de gestión -> trabajar con reportes. */
export default function App() {
  const [user, setUser] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [empresa, setEmpresa] = useState(null);   // empresa de gestión activa
  const [listo, setListo] = useState(false);
  const [reporteId, setReporteId] = useState(null);
  // vista: 'VISOR' | 'EDITOR' | 'PROGRAMACIONES'
  const [vista, setVista] = useState('VISOR');
  const [refrescarArbol, setRefrescarArbol] = useState(0);

  // Tema claro/oscuro. Se recuerda entre sesiones y, la primera vez, se toma
  // la preferencia del sistema operativo en lugar de imponer el modo claro.
  const [tema, setTema] = useState(() =>
    localStorage.getItem('tema') ||
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'));

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('tema', tema);
  }, [tema]);

  const alternarTema = () => setTema(t => (t === 'oscuro' ? 'claro' : 'oscuro'));

  // Rehidrata la sesión si la cookie sigue viva.
  useEffect(() => {
    api.me()
      .then(async (u) => {
        setUser(u);
        if (u.empresaGestion) setEmpresa(u.empresaGestion);
        else setEmpresas(await api.empresas('GESTION').catch(() => []));
      })
      .catch(() => {})
      .finally(() => setListo(true));
  }, []);

  const onLogin = (r) => { setUser(r); setEmpresas(r.empresas || []); };

  const salir = async () => {
    await api.logout().catch(() => {});
    setUser(null); setEmpresa(null); setEmpresas([]); setReporteId(null);
  };

  const cambiarEmpresa = async () => {
    setEmpresa(null); setReporteId(null);
    setEmpresas(await api.empresas('GESTION').catch(() => []));
  };

  if (!listo) return <div className="muted center">Cargando…</div>;
  if (!user) return <Login onLogin={onLogin} />;
  if (!empresa) {
    return <SelectorEmpresa usuario={user.usuario} empresas={empresas} onElegir={setEmpresa} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>ICG Reportería</strong>
        <button className="empresa-chip" onClick={cambiarEmpresa} title="Cambiar empresa">
          <Icono nombre="edificio" /> {empresa.nombre || empresa.codEmpresa}
        </button>
        <div className="spacer" />
        {user.permisos?.PuedeCrear && (
          <button onClick={() => { setReporteId(null); setVista('EDITOR'); }}>
            <Icono nombre="añadir" /> Nuevo reporte
          </button>
        )}
        {user.permisos?.PuedeEditar && reporteId && vista === 'VISOR' && (
          <button onClick={() => setVista('EDITOR')}><Icono nombre="editar" /> Editar</button>
        )}
        <button className={vista === 'DASHBOARDS' ? 'empresa-chip' : ''}
                onClick={() => setVista(v => (v === 'DASHBOARDS' ? 'VISOR' : 'DASHBOARDS'))}
                title="Paneles que puedes armar tú mismo">
          <Icono nombre="panel" /> Dashboards
        </button>
        {reporteId && vista === 'VISOR' && (
          <button onClick={() => setVista('HISTORIAL')} title="Ver evolución y quién lo consultó">
            <Icono nombre="historial" /> Historial
          </button>
        )}
        <button className={vista === 'PROGRAMACIONES' ? 'empresa-chip' : ''}
                onClick={() => setVista(v => (v === 'PROGRAMACIONES' ? 'VISOR' : 'PROGRAMACIONES'))}>
          <Icono nombre="reloj" /> Envíos
        </button>
        {(user.permisos?.PuedeEditar || user.permisos?.PuedeCrear) && (
          <>
            <button className={vista === 'PORTABILIDAD' ? 'empresa-chip' : ''}
                    onClick={() => setVista(v => (v === 'PORTABILIDAD' ? 'VISOR' : 'PORTABILIDAD'))}
                    title="Exportar/importar definiciones de reportes">
              <Icono nombre="paquete" /> Portabilidad
            </button>
            <button className={vista === 'BRANDING' ? 'empresa-chip' : ''}
                    onClick={() => setVista(v => (v === 'BRANDING' ? 'VISOR' : 'BRANDING'))}>
              <Icono nombre="paleta" /> Branding
            </button>
            <button className={vista === 'PROCEDIMIENTOS' ? 'empresa-chip' : ''}
                    onClick={() => setVista(v => (v === 'PROCEDIMIENTOS' ? 'VISOR' : 'PROCEDIMIENTOS'))}>
              <Icono nombre="escudo" /> SPs
            </button>
            <button className={vista === 'AUDITORIA' ? 'empresa-chip' : ''}
                    onClick={() => setVista(v => (v === 'AUDITORIA' ? 'VISOR' : 'AUDITORIA'))}>
              <Icono nombre="barras" /> Auditoría
            </button>
          </>
        )}
        {/* El catálogo de orígenes lo administra solo el SUPERVISOR de ICG. */}
        {user.codUsuario === 0 && (
          <button className={vista === 'ORIGENES' ? 'empresa-chip' : ''}
                  onClick={() => setVista(v => (v === 'ORIGENES' ? 'VISOR' : 'ORIGENES'))}
                  title="Orígenes de datos para los dashboards">
            <Icono nombre="baseDatos" /> Orígenes
          </button>
        )}
        {user.permisos?.PuedeAdministrar && (
          <>
            <button className={vista === 'PERFILES' ? 'empresa-chip' : ''}
                    onClick={() => setVista(v => (v === 'PERFILES' ? 'VISOR' : 'PERFILES'))}
                    title="Agrupar reportes y asignarlos a usuarios">
              <Icono nombre="perfiles" /> Perfiles
            </button>
            <button className={vista === 'USUARIOS' ? 'empresa-chip' : ''}
                    onClick={() => setVista(v => (v === 'USUARIOS' ? 'VISOR' : 'USUARIOS'))}>
              <Icono nombre="usuarios" /> Usuarios
            </button>
          </>
        )}
        <span className="muted">{user.usuario} · {user.rol}</span>
        <button onClick={alternarTema}
                title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
          <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'}
                 titulo={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'} />
        </button>
        <button onClick={salir}><Icono nombre="salir" /> Salir</button>
      </header>
      <div className="layout">
        <aside>
          <ArbolReportes key={refrescarArbol} seleccionado={reporteId}
            permisos={user.permisos}
            onSeleccionar={(id) => { setReporteId(id); setVista(id ? 'VISOR' : 'VISOR'); }} />
        </aside>
        <main>
          {/* La `key` reinicia el limite al cambiar de seccion, para que un
              fallo en una pantalla no bloquee las demas. */}
          <ErrorBoundary key={vista}>
          {vista === 'DASHBOARDS' ? (
            <Suspense fallback={<p className="muted">Cargando dashboards…</p>}>
              <Dashboards permisos={user.permisos} />
            </Suspense>
          ) : vista === 'ORIGENES' ? (
            <Suspense fallback={<p className="muted">Cargando editor…</p>}>
              <Origenes />
            </Suspense>
          ) : vista === 'PROGRAMACIONES' ? (
            <Programaciones permisos={user.permisos} />
          ) : vista === 'AUDITORIA' ? (
            <Auditoria />
          ) : vista === 'PROCEDIMIENTOS' ? (
            <Procedimientos permisos={user.permisos} />
          ) : vista === 'BRANDING' ? (
            <Branding permisos={user.permisos} />
          ) : vista === 'USUARIOS' ? (
            <Usuarios usuarioActual={user} />
          ) : vista === 'PERFILES' ? (
            <Perfiles />
          ) : vista === 'PORTABILIDAD' ? (
            <Portabilidad onImportado={(id) => {
              setReporteId(id); setRefrescarArbol(n => n + 1);
            }} />
          ) : vista === 'HISTORIAL' ? (
            <HistorialReporte reporteId={reporteId} onCerrar={() => setVista('VISOR')} />
          ) : vista === 'EDITOR' ? (
            <Suspense fallback={<p className="muted">Cargando editor…</p>}>
              <ReporteEditor reporteId={reporteId}
                onGuardado={(id) => {
                  setReporteId(id); setVista('VISOR'); setRefrescarArbol(n => n + 1);
                }}
                onCancelar={() => setVista('VISOR')} />
            </Suspense>
          ) : reporteId ? (
            <ReporteViewer reporteId={reporteId} empresaGestion={empresa} />
          ) : (
            <p className="muted">Selecciona un reporte del panel izquierdo.</p>
          )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
