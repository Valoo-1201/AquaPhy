import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { estadoCiudadano, MENSAJES, fraccionHOCl, colorPH } from '../lib/chem.js'
import { COLONIAS } from '../config.js'
import { desbloquearAudio } from '../lib/sound.js'
import { INEGI } from './Tecnica.jsx'
import * as I from './Iconos.jsx'

const Gota3D = lazy(() => import('./Gota3D.jsx'))

class SinWebGL extends Component {
  constructor(p) { super(p); this.state = { error: false } }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? this.props.respaldo : this.props.children }
}

function GotaPlana() {
  return (
    <svg viewBox="0 0 200 240" className="gota-plana" role="img" aria-label="Tali, la gota de AquaPhy">
      <path d="M100 10C100 10 30 100 30 150a70 70 0 0 0 140 0C170 100 100 10 100 10z" fill="#22b8d8" />
      <path d="M78 140q8-10 16 0M106 140q8-10 16 0" stroke="#0d1b3d" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M84 170q16 14 32 0" stroke="#0d1b3d" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Próxima llegada de agua según el calendario de la colonia.
function proximoTandeo(col, ahora = new Date()) {
  for (let d = 0; d <= 8; d++) {
    const dia = new Date(ahora)
    dia.setDate(ahora.getDate() + d)
    if (!col.dias.includes(dia.getDay())) continue
    const ini = new Date(dia); ini.setHours(col.hora, 0, 0, 0)
    const fin = new Date(ini.getTime() + col.horas * 3600e3)
    if (ahora >= ini && ahora < fin) return { ahora: true, fin }
    if (ini > ahora) return { ahora: false, ini }
  }
  return null
}

function Tandeo({ a, colonia, setColonia }) {
  const [now, setNow] = useState(new Date())
  const [enviado, setEnviado] = useState(false)
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const col = COLONIAS.find((c) => c.id === colonia) ?? COLONIAS[0]
  const p = proximoTandeo(col, now)
  const resta = p && !p.ahora ? p.ini - now : 0
  const hh = Math.floor(resta / 3600e3)
  const mm = Math.floor((resta % 3600e3) / 60e3)
  const ss = Math.floor((resta % 60e3) / 1000)
  const frac = Math.max(0, Math.min(1, 1 - resta / (72 * 3600e3)))
  const R = 62
  const L = 2 * Math.PI * R
  const dia = p && !p.ahora ? p.ini.toLocaleDateString('es-MX', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <section className="panel tandeo" aria-labelledby="h-tandeo">
      <header className="panel-cab">
        <h2 id="h-tandeo">Próxima llegada de agua</h2>
        <label className="colonia">
          <I.Pin />
          <span className="sr">Colonia</span>
          <select value={colonia} onChange={(e) => setColonia(e.target.value)}>
            {COLONIAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      </header>
      {p?.ahora ? (
        <div className="tandeo-ahora">
          <I.Gota width={40} height={40} />
          <p><strong>El agua está llegando a {col.nombre}.</strong> Hasta las {p.fin.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.</p>
        </div>
      ) : (
        <div className="cuenta">
          <svg viewBox="0 0 150 150" className="anillo" aria-hidden="true">
            <circle cx="75" cy="75" r={R} className="anillo-fondo" />
            <circle cx="75" cy="75" r={R} className="anillo-valor" strokeDasharray={L} strokeDashoffset={L * (1 - frac)} />
          </svg>
          <div className="cuenta-num" role="timer" aria-live="off">
            <div><strong>{hh}</strong><span>horas</span></div>
            <div><strong>{String(mm).padStart(2, '0')}</strong><span>min</span></div>
            <div><strong>{String(ss).padStart(2, '0')}</strong><span>seg</span></div>
          </div>
          <p className="cuenta-dia">Llega el {dia}</p>
        </div>
      )}
      <button
        className="btn btn-agua"
        onClick={() => { desbloquearAudio(); a.reportarAgua(col.nombre); setEnviado(true); setTimeout(() => setEnviado(false), 4000) }}
      >
        <I.Campana /> {enviado ? 'Reporte enviado, midiendo el agua' : '¡Ya cayó el agua en mi casa!'}
      </button>
      <p className="nota centro">{a.reportes} vecinos de tu colonia reportaron hoy · Horarios de demostración</p>
    </section>
  )
}

function TinacoGemelo({ t, nivel }) {
  const c = colorPH(t.ph)
  const H = 200
  const agua = 34 + (H - 40) * (1 - nivel / 100)
  return (
    <section className="panel tinaco" aria-labelledby="h-tinaco">
      <header className="panel-cab">
        <h2 id="h-tinaco">Tu tinaco ahora</h2>
        <span className="dato-sec">1 100 L · {nivel} %</span>
      </header>
      <svg viewBox="0 0 240 250" className={`tinaco-svg ${t.bomba ? 'dosis' : ''} ${t.estado === 2 ? 'mezcla' : ''}`} role="img"
        aria-label={`Tinaco al ${nivel} %. ${t.bomba ? 'Cayendo una gota de ácido.' : ''}`}>
        <defs>
          <clipPath id="tanque"><rect x="40" y="34" width="160" height="196" rx="26" /></clipPath>
          <linearGradient id="aguaG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#5cc8f0" /><stop offset="1" stopColor="#1d3e9e" />
          </linearGradient>
        </defs>
        <rect x="94" y="6" width="52" height="16" rx="6" className="tinaco-tapa" />
        <rect x="70" y="20" width="100" height="18" rx="9" className="tinaco-tapa" />
        <rect x="40" y="34" width="160" height="196" rx="26" className="tinaco-cuerpo" />
        <g clipPath="url(#tanque)">
          <rect x="40" y={agua} width="160" height={H} fill="url(#aguaG)" />
          <rect x="40" y={agua} width="160" height={H} fill={c.hex} opacity="0.22" />
          <path className="ola" d={`M-40 ${agua} q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 v20 h-320z`} fill="#8fdcf7" opacity="0.7" />
          <ellipse className="remolino" cx="120" cy={agua + 60} rx="44" ry="10" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="10 8" />
          <rect x="52" y="44" width="10" height="170" rx="5" fill="white" opacity="0.35" />
        </g>
        <path className="gota-cae" d="M120 40c0 0-7 9-7 14a7 7 0 0 0 14 0c0-5-7-14-7-14z" fill="#f2b705" />
      </svg>
      <p className="nota centro">
        {t.bomba ? 'Cae una gota de ácido para bajar el pH.' : t.estado === 2 ? 'El agua se está mezclando.' : `El color del agua sigue al indicador universal: ${c.nombre.toLowerCase()}.`}
      </p>
    </section>
  )
}

const TARJETAS = [
  { t: '¿Por qué checamos el pH?', d: 'Si el pH es alto, el cloro que le echas a la cisterna casi no mata bacterias. Con pH 7 trabaja el triple de bien que con pH 8.', ic: <I.Gota width={34} height={34} /> },
  { t: 'El tandeo estanca el agua', d: 'Cuando el agua se queda días en el tinaco el cloro se gasta. AquaPhy vigila qué pasa con el agua guardada en tu casa.', ic: <I.Reloj width={34} height={34} /> },
  { t: 'Lava tu cisterna cada 6 meses', d: 'Cepilla las paredes y el fondo, enjuaga bien y tapa siempre el tinaco para que no entre polvo ni insectos.', ic: <I.Tinaco width={34} height={34} /> },
  { t: 'Rango seguro: 6.5 a 8.5', d: 'Es el pH que marca la norma mexicana NOM-127 para agua de uso y consumo humano.', ic: <I.Pin width={34} height={34} /> },
]

function Carrusel() {
  const ref = useRef(null)
  const mover = (s) => ref.current?.scrollBy({ left: s * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <section className="panel carrusel" aria-labelledby="h-aprende">
      <header className="panel-cab">
        <h2 id="h-aprende">Cuida tu agua</h2>
        <div className="carrusel-nav">
          <button onClick={() => mover(-1)} aria-label="Anterior"><I.FlechaIzq /></button>
          <button onClick={() => mover(1)} aria-label="Siguiente"><I.Flecha /></button>
        </div>
      </header>
      <ul ref={ref} className="carrusel-pista">
        {TARJETAS.map((c, i) => (
          <li key={c.t} className={`tarjeta-edu e${i}`}>
            <div className="tarjeta-ic">{c.ic}</div>
            <h3>{c.t}</h3>
            <p>{c.d}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Ciudadana({ a, clima }) {
  const { t } = a
  const animo = a.midiendo && t.estado === 0 ? 'mezclando' : estadoCiudadano(t)
  const msg = MENSAJES[animo]
  const [colonia, setColonia] = useState('centro')
  const [nivel, setNivel] = useState(72)
  const ultimoReporte = useRef(a.reportes)
  useEffect(() => {
    if (a.reportes !== ultimoReporte.current) { ultimoReporte.current = a.reportes; setNivel(96) }
  }, [a.reportes])
  useEffect(() => { const id = setInterval(() => setNivel((n) => Math.max(18, n - 1)), 45000); return () => clearInterval(id) }, [])
  const cloro = Math.round(fraccionHOCl(t.ph, clima.suelo.s54) * 100)
  const guardan = useMemo(() => Math.round(INEGI.alguno / 10), [])

  return (
    <>
      <section className={`heroe-ciu tono-${msg.tono}`} aria-labelledby="h-ciu">
        <div className="heroe-ciu-in">
          <div className="escena">
            <SinWebGL respaldo={<GotaPlana />}>
              <Suspense fallback={<GotaPlana />}>
                <Gota3D animo={animo} />
              </Suspense>
            </SinWebGL>
            <p className="escena-nota">Tali sigue tu cursor. Tócala.</p>
          </div>
          <div className="heroe-ciu-texto">
            <span className={`chip grande tono-${msg.tono}`}><i />{msg.tono === 'ok' ? 'Todo en orden' : msg.tono === 'aviso' ? 'Atención' : 'Alerta'}</span>
            <h1 id="h-ciu">{msg.titulo}</h1>
            <p className="heroe-sub">{msg.texto}</p>
            <dl className="mini">
              <div><dt>pH ahora</dt><dd>{t.ph.toFixed(2)}</dd></div>
              <div><dt>Fuerza del cloro</dt><dd>{cloro} %</dd></div>
              <div><dt>Hogares poblanos que guardan agua</dt><dd>{guardan} de 10</dd></div>
            </dl>
          </div>
        </div>
      </section>
      <div className="rejilla ciu">
        <Tandeo a={a} colonia={colonia} setColonia={setColonia} />
        <TinacoGemelo t={t} nivel={nivel} />
        <Carrusel />
      </div>
    </>
  )
}
