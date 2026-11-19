// ============================================================================
//  AquaPhy · Nodo ESP32 con Blynk.Cloud
//  Reto: Monitoreo y control de calidad de agua IoT (Hackatón MICROSIDE)
//
//  - Lee la sonda de pH (ADC de 10 bits, pendiente negativa) con filtro
//    de mediana recortada + promedio exponencial.
//  - Dosifica ácido (pH 4) con pulsos de bomba calculados para acercarse
//    al umbral sin pasarse; aprende la respuesta real del agua en cada pulso.
//  - Bloquea el inicio si el pH ya está en el umbral, si hay paro de
//    emergencia o si la placa pasa de 55 °C.
//  - Alertas: 1 tono largo al iniciar el ciclo, 3 cortos al terminar.
//  - Color del indicador universal en el LED XN03A (Serial2).
//
//  Librería: Blynk (Blynk Inc.) ≥ 1.3  ·  Placa: ESP32-S3 Dev Module
// ============================================================================

// ---------- Blynk: copia estos tres valores desde Blynk.Console ----------
#define BLYNK_TEMPLATE_ID   "TMPLxxxxxxxx"
#define BLYNK_TEMPLATE_NAME "AquaPhy"
#define BLYNK_AUTH_TOKEN    "TU_TOKEN_AQUI"
#define BLYNK_PRINT Serial

#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>
#include <math.h>
#include <stdlib.h>
#include <ctype.h>

const char WIFI_SSID[] = "TU_RED";
const char WIFI_PASS[] = "TU_CONTRASENA";

// ---------- Hardware ----------
// true: sin sonda ni bomba, el pH se simula (igual que tu código base).
constexpr bool MODO_SIMULACION = true;

constexpr int PIN_PH    = 1;   // Debe ser ADC1 (GPIO1–10 en S3); ADC2 no funciona con WiFi.
constexpr int PIN_RELE  = 5;   // Relé de la bomba. Ajusta al pin de tu kit.
constexpr bool RELE_ACTIVO_ALTO = true;
constexpr int PIN_PIEZO = -1;  // GPIO de un piezo pasivo; -1 = solo Monitor serie.
constexpr int LED_RX = 9, LED_TX = 10; // Serial2 hacia el XN03A

// ---------- Calibración de la sonda (pendiente negativa) ----------
// Mide el voltaje con buffer pH 7 y pH 4 usando el comando C del Monitor serie.
constexpr float CAL_V_PH7 = 1.500f;  // V con buffer pH 7
constexpr float CAL_V_PH4 = 2.030f;  // V con buffer pH 4 (mayor: pendiente negativa)
constexpr float PENDIENTE = (7.0f - 4.0f) / (CAL_V_PH7 - CAL_V_PH4); // pH por volt (< 0)

// ---------- Dosificación ----------
constexpr float PH_INICIAL_SIM   = 7.30f;
constexpr float PH_SOLUCION      = 4.00f;
constexpr float UMBRAL_MIN = 4.50f, UMBRAL_MAX = 7.00f;
constexpr float BANDA            = 0.03f;   // tolerancia para dar por alcanzado el umbral
constexpr float SEGURIDAD        = 0.80f;   // aplica solo el 80 % del pulso calculado
constexpr uint32_t PULSO_MIN_MS  = 50;      // el relé conmuta en ~50 ms
constexpr uint32_t PULSO_MAX_MS  = 800;     // 800 ms ≈ 26 mL con la bomba de 33 mL/s
constexpr uint32_t ESTABILIZACION_MS = 3000;
constexpr float CAUDAL_ML_POR_MS = 0.033f;
constexpr float TEMP_LIMITE      = 55.0f;
// Estimación inicial de cuánto baja el pH por ms de bomba. Se corrige sola.
float kEstimado = 0.00012f;
constexpr float K_REAL_SIM = 0.00015f;      // solo en simulación

// ---------- Pines virtuales (deben coincidir con src/config.js) ----------
#define VP_PH       V0
#define VP_UMBRAL   V1
#define VP_DOSIS    V2   // 1 = iniciar, 2 = detener, 0 = nada (compatible con botón push)
#define VP_ESTADO   V3
#define VP_BOMBA    V4
#define VP_TEMP     V5
#define VP_COLOR    V6
#define VP_PARO     V7
#define VP_ACIDO    V8
#define VP_VOLTAJE  V9
#define VP_PULSO    V10

enum Estado { REPOSO, DOSIFICANDO, ESTABILIZANDO, FINALIZADO, PARO };
Estado estado = REPOSO;
const char* NOMBRES_ESTADO[] = { "REPOSO", "DOSIFICANDO", "ESTABILIZANDO", "FINALIZADO", "PARO" };

float phFiltrado = PH_INICIAL_SIM;
float phSimulado = PH_INICIAL_SIM;
float umbral = 6.80f;
float phAlAbrir = PH_INICIAL_SIM;
float acidoML = 0;
float tempPlaca = 0;
uint32_t inicioEtapa = 0, duracionPulso = 0;
bool ledActivo = false;
bool pausado = false;
uint32_t inicioPausa = 0;

BlynkTimer timer;

struct ColorPH { const char* nombre; uint8_t r, g, b; };
const ColorPH COLORES[] = {
  {"Rojo", 255, 0, 0}, {"Rojo anaranjado", 255, 69, 0}, {"Naranja", 255, 128, 0},
  {"Amarillo naranja", 255, 190, 0}, {"Amarillo", 255, 230, 0}, {"Verde amarillento", 150, 220, 0},
  {"Verde", 0, 190, 0}, {"Verde", 0, 190, 0}, {"Verde", 0, 190, 0},
  {"Verde azulado", 0, 185, 140}, {"Azul verdoso", 0, 155, 190}, {"Azul", 0, 90, 235},
  {"Azul violaceo", 67, 60, 210}, {"Purpura", 125, 45, 190}, {"Violeta", 160, 45, 225}
};

// ============================================================================
//  Lectura de pH con filtro
// ============================================================================
constexpr int N_MUESTRAS = 15;
float muestras[N_MUESTRAS];
int idxMuestra = 0;
bool bufferLleno = false;

float leerVoltaje() {
  return analogReadMilliVolts(PIN_PH) / 1000.0f;   // usa la calibración de fábrica del ADC
}

float voltajeAPH(float v) {
  return 7.0f + (v - CAL_V_PH7) * PENDIENTE;
}

void tomarMuestra() {
  float ph;
  if (MODO_SIMULACION) {
    ph = phSimulado + ((float)random(-100, 101) / 100.0f) * 0.02f;   // ruido ±0.02
  } else {
    ph = voltajeAPH(leerVoltaje());
  }
  muestras[idxMuestra] = ph;
  idxMuestra = (idxMuestra + 1) % N_MUESTRAS;
  if (idxMuestra == 0) bufferLleno = true;
}

int compararFloat(const void* a, const void* b) {
  const float x = *(const float*)a, y = *(const float*)b;
  return (x > y) - (x < y);
}

// Mediana recortada (descarta 3 extremos por lado) + promedio exponencial.
void actualizarFiltro() {
  const int n = bufferLleno ? N_MUESTRAS : idxMuestra;
  if (n < 5) return;
  float copia[N_MUESTRAS];
  memcpy(copia, muestras, sizeof(float) * n);
  qsort(copia, n, sizeof(float), compararFloat);
  const int recorte = n / 5;
  float suma = 0;
  for (int i = recorte; i < n - recorte; ++i) suma += copia[i];
  const float media = suma / (n - 2 * recorte);
  phFiltrado = 0.7f * phFiltrado + 0.3f * constrain(media, 0.0f, 14.0f);
}

// ============================================================================
//  Bomba y alertas
// ============================================================================
void bomba(bool on) {
  digitalWrite(PIN_RELE, (on == RELE_ACTIVO_ALTO) ? HIGH : LOW);
  Blynk.virtualWrite(VP_BOMBA, on ? 1 : 0);
}

uint8_t cortosPendientes = 0;
uint32_t inicioSerieCorta = 0;

void alertaInicio() {
  Serial.println("ALERTA|INICIO  (1 tono largo)");
  // XN44: envía aquí el comando de tu módulo de audio para el tono largo.
  if (PIN_PIEZO >= 0) tone(PIN_PIEZO, 880, 650);
  Blynk.logEvent("dosis_inicio", String("Dosificando hacia pH ") + String(umbral, 2));
}

void alertaFin(const char* motivo) {
  Serial.printf("ALERTA|FIN (%s)  (3 tonos cortos)\n", motivo);
  // XN44: envía aquí el comando de tu módulo de audio para los 3 tonos cortos.
  if (PIN_PIEZO >= 0) { noTone(PIN_PIEZO); inicioSerieCorta = millis(); cortosPendientes = 3; }
}

void actualizarSonido(uint32_t ahora) {
  if (cortosPendientes == 0) return;
  if (ahora - inicioSerieCorta >= (3 - cortosPendientes) * 220UL) {
    tone(PIN_PIEZO, 660, 120);
    --cortosPendientes;
  }
}

// ============================================================================
//  Máquina de estados de dosificación
// ============================================================================
bool cicloActivo() { return estado == DOSIFICANDO || estado == ESTABILIZANDO; }

void publicarEstado() {
  Blynk.virtualWrite(VP_ESTADO, (int)estado);
  Blynk.virtualWrite(VP_PULSO, (int)duracionPulso);
}

void abrirPulso(uint32_t ahora) {
  phAlAbrir = phFiltrado;
  const float calculado = (phFiltrado - umbral) / kEstimado * SEGURIDAD;
  duracionPulso = (uint32_t)constrain(calculado, (float)PULSO_MIN_MS, (float)PULSO_MAX_MS);
  inicioEtapa = ahora;
  estado = DOSIFICANDO;
  bomba(true);
  publicarEstado();
  Serial.printf("Pulso de %lu ms (k=%.6f pH/ms)\n", (unsigned long)duracionPulso, kEstimado);
}

void terminar(Estado final, const char* motivo) {
  bomba(false);
  estado = final;
  pausado = false;
  publicarEstado();
  alertaFin(motivo);
}

void iniciar(float objetivo) {
  if (estado == PARO)           { Serial.println("Bloqueado: paro de emergencia activo."); return; }
  if (cicloActivo())            { Serial.println("Ya hay un ciclo activo. Envia D para detenerlo."); return; }
  if (tempPlaca > TEMP_LIMITE)  { Serial.println("Bloqueado: placa demasiado caliente."); return; }
  if (phFiltrado <= objetivo + BANDA) {
    Serial.println("Inicio bloqueado: pH en el umbral o por debajo.");
    Blynk.logEvent("dosis_bloqueada", "El pH ya esta en el umbral");
    return;
  }
  umbral = objetivo;
  alertaInicio();
  abrirPulso(millis());
}

void actualizarProceso(uint32_t ahora) {
  if (!cicloActivo() || pausado) return;
  const uint32_t transcurrido = ahora - inicioEtapa;

  if (estado == DOSIFICANDO) {
    if (MODO_SIMULACION) {
      const uint32_t abierta = min(transcurrido, duracionPulso);
      phSimulado = max(PH_SOLUCION, phAlAbrir - abierta * K_REAL_SIM);
    }
    if (phFiltrado <= umbral) {
      acidoML += min(transcurrido, duracionPulso) * CAUDAL_ML_POR_MS;
      terminar(FINALIZADO, "umbral alcanzado");
    } else if (transcurrido >= duracionPulso) {
      bomba(false);
      acidoML += duracionPulso * CAUDAL_ML_POR_MS;
      estado = ESTABILIZANDO;
      inicioEtapa = ahora;
      publicarEstado();
    }
  } else if (transcurrido >= ESTABILIZACION_MS) {
    // Aprende cuánto bajó realmente el pH por ms de bomba.
    const float medido = (phAlAbrir - phFiltrado) / (float)duracionPulso;
    if (medido > 0) kEstimado = constrain(0.5f * kEstimado + 0.5f * medido, 0.00002f, 0.002f);
    if (phFiltrado - umbral <= BANDA) terminar(FINALIZADO, "umbral alcanzado");
    else abrirPulso(ahora);
  }
}

// ============================================================================
//  Blynk
// ============================================================================
BLYNK_CONNECTED() {
  Blynk.syncVirtual(VP_UMBRAL, VP_PARO);
  publicarEstado();
}

BLYNK_WRITE(VP_UMBRAL) {
  const float v = param.asFloat();
  if (!cicloActivo() && v >= UMBRAL_MIN && v <= UMBRAL_MAX) umbral = v;
  else Blynk.virtualWrite(VP_UMBRAL, umbral);   // rechaza y regresa el valor vigente
}

BLYNK_WRITE(VP_DOSIS) {
  const int orden = param.asInt();
  if (orden == 1) iniciar(umbral);
  else if (orden == 2 && cicloActivo()) terminar(REPOSO, "detenido");
  Blynk.virtualWrite(VP_DOSIS, 0);
}

BLYNK_WRITE(VP_PARO) {
  if (param.asInt() == 1) {
    if (cicloActivo()) alertaFin("paro");
    bomba(false);
    estado = PARO;
    Blynk.logEvent("paro_emergencia", "Paro de emergencia activado");
  } else if (estado == PARO) {
    estado = REPOSO;
  }
  publicarEstado();
}

const ColorPH& colorActual() {
  return COLORES[constrain((int)lroundf(phFiltrado), 0, 14)];
}

void enviarTelemetria() {
  tempPlaca = temperatureRead();
  if (tempPlaca > TEMP_LIMITE && cicloActivo()) {
    terminar(REPOSO, "temperatura");
    Blynk.logEvent("temperatura_alta", String("Placa a ") + String(tempPlaca, 1) + " C");
  }
  const ColorPH& c = colorActual();
  char hex[8];
  snprintf(hex, sizeof(hex), "#%02X%02X%02X", c.r, c.g, c.b);

  Blynk.virtualWrite(VP_PH, phFiltrado);
  Blynk.virtualWrite(VP_TEMP, tempPlaca);
  Blynk.virtualWrite(VP_COLOR, hex);
  Blynk.virtualWrite(VP_ACIDO, acidoML);
  Blynk.virtualWrite(VP_VOLTAJE, 12.6f);   // simulado: conecta aquí un divisor si mides el panel
  Blynk.virtualWrite(VP_ESTADO, (int)estado);
  Blynk.setProperty(VP_PH, "color", hex);   // el widget de pH toma el color del indicador

  Serial.printf("pH %.3f | Umbral %.2f | %s | Bomba %s | %.1f C | %s\n",
                phFiltrado, umbral, pausado ? "PAUSADO" : NOMBRES_ESTADO[estado],
                estado == DOSIFICANDO ? "on" : "off", tempPlaca, c.nombre);

  static int ultimoColor = -1;
  const int idx = constrain((int)lroundf(phFiltrado), 0, 14);
  if (ledActivo && idx != ultimoColor) {
    Serial2.printf("XN03A+S=%u,%u,%u\r\n", c.r, c.g, c.b);
    ultimoColor = idx;
  }
}

// ============================================================================
//  Monitor serie (mismos comandos que el código base + C de calibración)
// ============================================================================
void ejecutar(char* orden) {
  switch (toupper((unsigned char)orden[0])) {
    case 'I': {
      char* fin;
      const float objetivo = strtof(orden + 1, &fin);
      if (fin == orden + 1 || *fin != '\0' || !isfinite(objetivo) || objetivo < UMBRAL_MIN || objetivo > UMBRAL_MAX) {
        Serial.println("Usa I seguido de un umbral de 4.50 a 7.00. Ejemplo: I 5.50");
        return;
      }
      iniciar(objetivo);
      Blynk.virtualWrite(VP_UMBRAL, umbral);
      break;
    }
    case 'L':
      if (!ledActivo) { Serial2.begin(115200, SERIAL_8N1, LED_RX, LED_TX); ledActivo = true; }
      break;
    case 'C':
      Serial.printf("Calibracion | V = %.4f | pH calculado = %.3f\n", leerVoltaje(), voltajeAPH(leerVoltaje()));
      break;
    case 'T':
      if (!MODO_SIMULACION) { Serial.println("T solo funciona en modo simulacion."); return; }
      if (cicloActivo()) { Serial.println("Envia D antes de repetir T."); return; }
      phSimulado = phFiltrado = 5.72f;
      iniciar(5.45f);
      break;
    case 'P':
      if (cicloActivo() && !pausado) { inicioPausa = millis(); pausado = true; bomba(false); }
      break;
    case 'R':
      if (pausado) { inicioEtapa += millis() - inicioPausa; pausado = false; if (estado == DOSIFICANDO) bomba(true); }
      break;
    case 'D':
      if (cicloActivo()) terminar(REPOSO, "detenido");
      break;
    case 'N':
      bomba(false); estado = REPOSO; pausado = false; acidoML = 0;
      phSimulado = phFiltrado = PH_INICIAL_SIM;
      publicarEstado();
      break;
    default:
      Serial.println("I 5.50: iniciar | T: prueba | L: LED | C: calibrar | P/R: pausa | D: detener | N: reiniciar");
  }
}

void leerComandos() {
  static char comando[32];
  static size_t longitud = 0;
  static bool desbordado = false;
  for (int i = 0; i < 32 && Serial.available(); ++i) {
    const char c = Serial.read();
    if (c == '\r' || c == '\n') {
      comando[longitud] = '\0';
      if (desbordado) Serial.println("Comando demasiado largo.");
      else if (longitud > 0) ejecutar(comando);
      longitud = 0; desbordado = false;
    } else if (longitud < sizeof(comando) - 1) comando[longitud++] = c;
    else desbordado = true;
  }
}

// ============================================================================
void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELE, OUTPUT);
  digitalWrite(PIN_RELE, RELE_ACTIVO_ALTO ? LOW : HIGH);   // bomba apagada al arrancar
  analogReadResolution(10);                                 // el reto especifica ADC de 10 bits
  analogSetPinAttenuation(PIN_PH, ADC_11db);                // rango hasta ~3.1 V
  randomSeed(esp_random());

  Serial2.begin(115200, SERIAL_8N1, LED_RX, LED_TX);
  ledActivo = true;

  Serial.println("AquaPhy | conectando a WiFi y Blynk...");
  Blynk.begin(BLYNK_AUTH_TOKEN, WIFI_SSID, WIFI_PASS);

  timer.setInterval(20L, tomarMuestra);        // 50 muestras/s
  timer.setInterval(200L, actualizarFiltro);   // pH filtrado 5 veces/s
  timer.setInterval(1000L, enviarTelemetria);  // nube 1 vez/s
}

void loop() {
  Blynk.run();
  timer.run();
  const uint32_t ahora = millis();
  actualizarProceso(ahora);
  actualizarSonido(ahora);
  leerComandos();
  if (ledActivo) for (int i = 0; i < 64 && Serial2.available(); ++i) Serial2.read();
}
