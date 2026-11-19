import { FUENTES, SIMULADOS } from '../data/fuentes.js'

export default function Fuentes() {
  return (
    <article className="panel fuentes" aria-labelledby="h-fuentes">
      <header className="panel-cab">
        <h2 id="h-fuentes">Fuentes y transparencia de datos</h2>
        <span className="dato-sec">{FUENTES.length} datos verificados · {SIMULADOS.length} elementos simulados</span>
      </header>
      <div className="fuentes-cont">
        <div>
          <h3>Datos reales</h3>
          <ul className="fuentes-lista">
            {FUENTES.map((f) => (
              <li key={f.id}>
                <span className="chip chip-real">{f.tema}</span>
                <p>{f.dato}</p>
                <a href={f.url} target="_blank" rel="noreferrer">{f.fuente}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Qué es simulado y por qué</h3>
          <ul className="fuentes-lista">
            {SIMULADOS.map((s) => (
              <li key={s.que}>
                <span className="chip chip-sim">Simulado</span>
                <p><strong>{s.que}.</strong> {s.regla}</p>
              </li>
            ))}
          </ul>
          <p className="nota">El pH, el umbral, el estado de la bomba y el ácido dosificado del nodo Centro Histórico vienen del ESP32 real vía Blynk. Sin conexión, la página usa el simulador y lo indica.</p>
        </div>
      </div>
    </article>
  )
}
