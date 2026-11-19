import { useEffect, useState } from 'react'
import { useAquaPhy } from './hooks/useAquaPhy.js'
import { useClima } from './hooks/useClima.js'
import { setSilencio, desbloquearAudio } from './lib/sound.js'
import Tecnica from './components/Tecnica.jsx'
import Ciudadana from './components/Ciudadana.jsx'
import * as I from './components/Iconos.jsx'
import './App.css'

const vistaDeHash = () => (location.hash === '#ciudadana' ? 'ciudadana' : 'tecnica')

function Reloj() {
  const [h, setH] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setH(new Date()), 1000); return () => clearInterval(id) }, [])
  return (
    <span className="reloj" title="Hora de Puebla">
      {h.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Mexico_City' })}
    </span>
  )
}

function Ondas({ agitado }) {
  return (
    <div className={`ondas ${agitado ? 'agitado' : ''}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`onda o${i}`} viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0 60 C 180 20 360 100 540 60 S 900 20 1080 60 S 1260 100 1440 60 V120 H0 Z M1440 60 C 1620 20 1800 100 1980 60 S 2340 20 2520 60 S 2700 100 2880 60 V120 H1440 Z" />
        </svg>
      ))}
    </div>
  )
}

function Ajustes({ a, onClose }) {
  const [server, setServer] = useState(a.cfg.server || 'blynk.cloud')
  const [token, setToken] = useState(a.cfg.token || '')
  const [calor, setCalor] = useState(false)
  return (
    <div className="velo" onClick={onClose}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="h-ajustes" onClick={(e) => e.stopPropagation()}>
        <header className="panel-cab">
          <h2 id="h-ajustes">Conexión con Blynk</h2>
          <button className="icono" onClick={onClose} aria-label="Cerrar"><I.Cerrar /></button>
        </header>
        <form onSubmit={(e) => { e.preventDefault(); a.conectarBlynk(token.trim() ? { server: server.trim(), token: token.trim() } : null); onClose() }}>
          <label className="campo">Servidor
            <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="blynk.cloud o ny3.blynk.cloud" />
          </label>
          <label className="campo">Auth token del dispositivo
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pégalo desde Blynk.Console" autoComplete="off" />
          </label>
          <p className="nota">El token se guarda solo en este navegador. Usa el servidor de tu región; aparece en la URL de Blynk.Console.</p>
          <div className="fila-btn">
            <button type="submit" className="btn btn-pri">{token.trim() ? 'Conectar' : 'Usar modo demo'}</button>
            {a.modo === 'blynk' && <button type="button" className="btn btn-sec" onClick={() => { a.conectarBlynk(null); onClose() }}>Volver al modo demo</button>}
          </div>
        </form>
        {a.modo === 'demo' && (
          <div className="demo-ctrl">
            <h3>Controles de demostración</h3>
            <label className="interruptor">
              <input type="checkbox" checked={calor} onChange={(e) => { setCalor(e.target.checked); a.simularCalor(e.target.checked) }} />
              <span>Simular calor en la placa (&gt; 55 °C)</span>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

function Modal({ m, onClose }) {
  if (!m) return null
  const calor = m.tipo === 'calor'
  return (
    <div className="velo" onClick={onClose}>
      <div className={`dialogo alerta-${m.tipo}`} role="alertdialog" aria-modal="true" aria-labelledby="h-modal" onClick={(e) => e.stopPropagation()}>
        <div className="alerta-ic">{calor ? <I.Termometro width={34} height={34} /> : <I.Candado width={34} height={34} />}</div>
        <h2 id="h-modal">{calor ? 'Alerta de temperatura' : 'Operación bloqueada'}</h2>
        <p>
          {calor
            ? 'La placa superó los 55 °C. La dosificación queda bloqueada por seguridad hasta que se enfríe.'
            : `El pH ya es ${m.ph.toFixed(2)} y el umbral es ${m.umbral.toFixed(2)}. No se requiere ácido.`}
        </p>
        <button className="btn btn-pri" onClick={onClose} autoFocus>Entendido</button>
      </div>
    </div>
  )
}

export default function App() {
  const a = useAquaPhy()
  const clima = useClima()
  const [vista, setVista] = useState(vistaDeHash)
  const [tema, setTema] = useState(() => {
    try { return localStorage.getItem('aquaphy.tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro') } catch { return 'claro' }
  })
  const [mudo, setMudo] = useState(false)
  const [ajustes, setAjustes] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = tema === 'oscuro' ? 'dark' : 'light'
    try { localStorage.setItem('aquaphy.tema', tema) } catch { /* */ }
  }, [tema])
  useEffect(() => {
    const f = () => setVista(vistaDeHash())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  useEffect(() => {
    const f = () => desbloquearAudio()
    addEventListener('pointerdown', f, { once: true })
    return () => removeEventListener('pointerdown', f)
  }, [])

  const cambiarVista = (v) => { setVista(v); history.replaceState(null, '', `#${v}`) }
  const conectado = a.modo === 'demo' ? true : a.enLinea && !a.error
  const dosificando = a.t.bomba === 1 || a.t.estado === 2

  return (
    <div className="app">
      <Ondas agitado={dosificando} />
      <nav className="barra-sup" aria-label="Principal">
        <a className="marca" href="#tecnica" onClick={(e) => { e.preventDefault(); cambiarVista('tecnica') }}>
          <span className="marca-logo"><I.Gota width={22} height={22} /></span>
          <span><strong>AquaPhy</strong><small>Puebla · pH y cloro en tandeo</small></span>
        </a>
        <div className="vistas" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={vista === 'tecnica'} onClick={() => cambiarVista('tecnica')}>Institucional</button>
          <button role="tab" aria-selected={vista === 'ciudadana'} onClick={() => cambiarVista('ciudadana')}>Ciudadana</button>
          <span className="vistas-pastilla" data-v={vista} aria-hidden="true" />
        </div>
        <div className="barra-der">
          <Reloj />
          <button className={`conexion ${conectado ? 'on' : 'off'}`} onClick={() => setAjustes(true)} title={a.error || ''}>
            <i />{a.modo === 'demo' ? 'Demo en línea' : conectado ? 'Blynk en línea' : 'Fuera de línea'}
          </button>
          <button className="icono" onClick={() => { setMudo(!mudo); setSilencio(!mudo) }} aria-label={mudo ? 'Activar sonido' : 'Silenciar'}>
            {mudo ? <I.Mudo /> : <I.Volumen />}
          </button>
          <button className="icono" onClick={() => setTema(tema === 'oscuro' ? 'claro' : 'oscuro')} aria-label="Cambiar tema">
            {tema === 'oscuro' ? <I.Sol /> : <I.Luna />}
          </button>
          <button className="icono" onClick={() => setAjustes(true)} aria-label="Conexión con Blynk"><I.Ajustes /></button>
        </div>
      </nav>

      <main key={vista} className="vista-entra">
        {vista === 'tecnica' ? <Tecnica a={a} clima={clima} /> : <Ciudadana a={a} clima={clima} />}
      </main>

      <footer className="pie">
        <span>AquaPhy · Hackatón MICROSIDE, reto de monitoreo y control de calidad del agua IoT</span>
        <span>Última lectura {a.ultimaLectura.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City' })} · {a.modo === 'demo' ? 'datos simulados' : 'datos de Blynk.Cloud'}</span>
      </footer>

      <div className="avisos" role="status" aria-live="polite">
        {a.avisos.map((x) => <div key={x.id} className={`aviso av-${x.tipo}`}>{x.tipo === 'dosis' && <I.Gota />}{x.texto}</div>)}
      </div>
      <Modal m={a.modal} onClose={() => a.setModal(null)} />
      {ajustes && <Ajustes a={a} onClose={() => setAjustes(false)} />}
    </div>
  )
}
