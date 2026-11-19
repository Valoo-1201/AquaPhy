import { useEffect, useState } from 'react'
import { PUEBLA } from '../config.js'

// Open-Meteo: sin clave de API. La temperatura del suelo a 54 cm sirve como
// referencia de la temperatura del agua en tuberías enterradas.
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${PUEBLA.lat}&longitude=${PUEBLA.lng}` +
  '&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code' +
  '&hourly=soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm,precipitation_probability' +
  '&timezone=America%2FMexico_City&forecast_days=1'

const RESPALDO = {
  real: false, temp: 21, humedad: 48, lluvia: 0, viento: 7, codigo: 1, probLluvia: 10,
  suelo: { s0: 24.1, s6: 21.8, s18: 19.6, s54: 18.4 },
}

export function useClima() {
  const [clima, setClima] = useState(RESPALDO)
  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      try {
        const r = await fetch(URL)
        if (!r.ok) throw new Error()
        const d = await r.json()
        const ahora = d.current.time.slice(0, 13)
        let i = d.hourly.time.findIndex((x) => x.startsWith(ahora))
        if (i < 0) i = new Date().getHours()
        if (!vivo) return
        setClima({
          real: true,
          temp: d.current.temperature_2m,
          humedad: d.current.relative_humidity_2m,
          lluvia: d.current.precipitation,
          viento: d.current.wind_speed_10m,
          codigo: d.current.weather_code,
          probLluvia: d.hourly.precipitation_probability?.[i] ?? 0,
          suelo: {
            s0: d.hourly.soil_temperature_0cm[i], s6: d.hourly.soil_temperature_6cm[i],
            s18: d.hourly.soil_temperature_18cm[i], s54: d.hourly.soil_temperature_54cm[i],
          },
        })
      } catch { /* se quedan los valores de referencia */ }
    }
    cargar()
    const id = setInterval(cargar, 15 * 60 * 1000)
    return () => { vivo = false; clearInterval(id) }
  }, [])
  return clima
}

export function describirClima(c) {
  if (c >= 95) return 'Tormenta'
  if (c >= 80) return 'Chubascos'
  if (c >= 61) return 'Lluvia'
  if (c >= 51) return 'Llovizna'
  if (c >= 45) return 'Niebla'
  if (c >= 2) return 'Nublado'
  if (c === 1) return 'Mayormente despejado'
  return 'Despejado'
}
