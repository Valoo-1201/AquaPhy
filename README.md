# AquaPhy

Monitoreo de pH y control de dosificación para el agua de tandeo en Puebla.
React + Vite, datos en vivo de **Blynk.Cloud**, clima y temperatura del suelo de **Open-Meteo**
y datos de vivienda del **Censo INEGI 2020**.

- **Vista institucional:** curva de eficacia del cloro, pH con indicador universal, consola con PIN,
  paro de emergencia, gráfica en vivo, 24 h con cortes de tandeo, clima y suelo, mapa de nodos, INEGI y bitácora.
- **Vista ciudadana:** Tali, la gota en 3D (Three.js), que cambia según el estado del agua; cuenta regresiva del
  tandeo, botón «¡Ya cayó el agua!», gemelo digital del tinaco y tarjetas educativas.
- **Alertas:** avisos emergentes, ventanas de bloqueo por temperatura o pH, y sonidos sincronizados con el
  buzzer (1 tono largo al iniciar, 3 cortos al terminar, gotitas mientras la bomba está encendida).

## Ejecutar

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # carpeta dist/ para Vercel o Netlify
npm run build:single # dist-single/index.html autocontenido (widget HTML de Blynk o compartir)
```

Sin token arranca en **modo demo**: un simulador replica la máquina de estados del firmware.
Engrane → «Conexión con Blynk» para pegar el token. El mismo diálogo tiene «Simular calor» para mostrar la alerta de temperatura.

Para fijar el token en el despliegue, crea `.env` a partir de `.env.example`.
El token queda visible en el navegador; úsalo solo para la demo.

## Blynk: Datastreams de la plantilla

| Pin | Nombre | Tipo | Rango | Uso |
|---|---|---|---|---|
| V0 | pH | Double | 0–14, 3 decimales | Lectura filtrada |
| V1 | Umbral | Double | 4.5–7, 2 decimales | Umbral de apagado |
| V2 | Dosificar | Integer | 0–2 | 1 iniciar, 2 detener |
| V3 | Estado | Integer | 0–4 | Reposo, Dosificando, Estabilizando, Umbral alcanzado, Paro |
| V4 | Bomba | Integer | 0–1 | Relé |
| V5 | Temp. placa | Double | 0–100 °C | `temperatureRead()` |
| V6 | Color | String | | `#RRGGBB` del indicador universal |
| V7 | Paro | Integer | 0–1 | Paro de emergencia |
| V8 | Ácido | Double | 0–200 mL | mL dosificados |
| V9 | Voltaje | Double | 0–15 V | Simulado (panel solar) |
| V10 | Pulso | Integer | 0–2000 ms | Último pulso |
| V11 | pH crudo | Double | 0–14, 3 decimales | Sin filtrar, para ver el ruido |
| V12 | ADC | Integer | 0–1023 | Cuentas del ADC de 10 bits |

Eventos opcionales (Templates → Events): `dosis_inicio`, `dosis_bloqueada`, `paro_emergencia`, `temperatura_alta`.

## Firmware

`firmware/AquaPhy_ESP32/AquaPhy_ESP32.ino`, basado en el código original del equipo:

1. Pon `BLYNK_TEMPLATE_ID`, `BLYNK_AUTH_TOKEN`, WiFi y el pin del relé.
2. Con `MODO_SIMULACION = true` funciona sin sonda. Para la sonda real ponlo en `false`. La calibración ya trae
   la tabla del reto (pH 7 = 1.648 V, pH 4 = 2.175 V, es decir pH = (892 − ADC) / 54.4). Si tu sonda difiere, mide con el comando `C`.
3. El control empieza con pulsos cortos, aplica el 75 % del pulso calculado, espera 3 s, mide cuánto bajó el pH y corrige su
   estimación antes del siguiente pulso. Así se acerca al umbral sin pasarse.
4. **XN44:** los puntos donde va el comando del módulo de audio están marcados en `alertaInicio()` y `alertaFin()`.

## Datos

- INEGI, Censo 2020, estado de Puebla: 1 713 381 viviendas particulares habitadas; 72.8 % con tinaco,
  42.4 % con cisterna o aljibe y 81.3 % con alguno de los dos. Cuautlancingo: 70.9 % y 49.7 %.
- Eficacia del cloro: fracción de HOCl = 1 / (1 + 10^(pH − pKa)), con pKa dependiente de la temperatura (Morris, 1966).
  Se usa la temperatura del suelo a 54 cm como referencia del agua en tuberías.
- Rango seguro de pH 6.5–8.5: NOM-127-SSA1-2021.
- Los horarios de tandeo por colonia y los 5 nodos adicionales del mapa son **simulados**.
