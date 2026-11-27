/*
 * ============================================================================
 *  AquaMind SmartDose  —  Hackatón Puebla 2026 · Reto "Monitoreo y control de
 *  calidad de agua IoT" (Microside / Agua de Puebla)
 * ============================================================================
 *  Hardware: XC01 R5-I (ESP32-S3) + XN03 (ADC/LED RGB) + XN13 (relé → bomba
 *            12 V) + XN44 (buzzer) + XN14 (fuente 12 V → 5 V / 3.3 V)
 *
 *  DOS MODOS (se cambia desde Blynk V6 o con el comando serial "m"):
 *   - MODO DEMO (por defecto): el pH sale de un simulador físico con escenarios
 *     (sarro, descarga ácida, sonda dañada...). La bomba es VIRTUAL: el relé NO
 *     se activa, para no echar ácido de verdad mientras se simula.
 *   - MODO REAL: lee la sonda por el XN03 (IN1) y activa el relé de verdad.
 *
 *  Arduino IDE: placa "ESP32S3 Dev Module", "USB CDC On Boot: Enabled".
 *  Librería: "Blynk" (Volodymyr Shymanskyy). Todo lo demás viene con el ESP32.
 *
 *  Contrato de datos completo para el frontend: CONTRATO_DATOS.md
 *  Los valores que se ajustan con experimentos están marcados  // >>> AJUSTAR
 * ============================================================================
 */

// ---------------- Credenciales (de SU template en blynk.cloud) --------------
#define BLYNK_TEMPLATE_ID   "TMPL2TOg4ruaC"
#define BLYNK_TEMPLATE_NAME "AquaPhy"
#define BLYNK_AUTH_TOKEN    "TU_AUTH_TOKEN"   // dispositivo Nodo1
#define BLYNK_PRINT Serial

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>
#include <math.h>
#include <BlynkSimpleEsp32.h>

char ssid[] = "TU_WIFI_2_4GHZ";      // >>> AJUSTAR
char pass[] = "TU_CONTRASENA";   // >>> AJUSTAR

// ============================================================================
//  1. HARDWARE (direcciones y registros de la documentación de Microside)
// ============================================================================
#define I2C_SDA      12
#define I2C_SCL      13
#define BOTON_BOOT   0       // botón BOOT del XC01 = paro de emergencia local
#define XN03_ADDR    3       // 0x03  ADC 10 bits + LED RGB
#define XN13_ADDR    13      // 0x0D  relevador (bomba)
#define XN44_ADDR    44      // 0x2C  buzzer
#define REG_RGB      0x01    // XN03: O1 R, O2 G, O3 B, escala
#define REG_ADC1     0x21    // XN03: IN1 crudo (pin Po de la tarjeta pH)
#define REG_ADC2     0x22    // XN03: IN2 crudo (pin To, opcional)
#define REG_RELE     0x01    // XN13: 0x01 enciende, 0x00 apaga
// Formato del relé: 1 = {registro 0x01, valor} (documentación oficial)
//                   0 = {valor} de 1 byte (ejemplo del hackathon). Usen el que funcionó en XN13_prueba.
#define RELE_FORMATO_REGISTRO 0   // confirmado en la prueba: este XN13 usa 1 byte
#define REG_TONO     0x01    // XN44: frecuencia (2 B) + duración (2 B), MSB primero

// ============================================================================
//  2. CALIBRACIÓN Y CONSTANTES DEL RETO
// ============================================================================
// Tabla del reto: lineal y decreciente. pH 0 -> ADC 892 ; pH 14 -> ADC 130
// pH = (adcPH0 - adc) / adcPorPH.  Se pueden recalibrar con comandos k / p.
const float ADC_PH0_FABRICA   = 892.0;
const float ADC_POR_PH_FABRICA = 54.43;   // (892 - 130) / 14

const float CAUDAL_ML_S   = 33.0;    // dato del reto
const uint16_t PULSO_MIN_MS = 50;    // mínimo del relé (≈ 1.65 mL)
const uint16_t PULSO_MAX_MS = 1500;  // tope de seguridad por pulso
const float VOL_AGUA_ML   = 200.0;
const float VOL_SOLUCION_ML = 100.0; // lo que entregan del pH 4
const float PH_SOLUCION   = 4.0;
const float FRACCION      = 0.4;     // dosificar 40 % de lo estimado  >>> AJUSTAR
const float CRECIMIENTO   = 2.0;     // un pulso ≤ 2× el anterior      >>> AJUSTAR
const float ML_MIN = CAUDAL_ML_S * PULSO_MIN_MS / 1000.0;   // 1.65 mL
const float ML_MAX = CAUDAL_ML_S * PULSO_MAX_MS / 1000.0;   // 49.5 mL
const float TOLERANCIA    = 0.05;    // "llegué" si pH − umbral ≤ 0.05 >>> AJUSTAR
const uint32_t ESPERA_MIN_MS = 6000; // mezcla mínima tras un pulso    >>> AJUSTAR
const uint32_t ESPERA_MAX_MS = 30000;// espera máxima de estabilidad   >>> AJUSTAR
const float PEND_ESTABLE  = 0.01;    // pH/s: abajo de esto = estable
const float NOM_MIN = 6.5, NOM_MAX = 8.5;  // NOM-127-SSA1-2021 (agua potable)

// Umbrales de diagnóstico
const int   RSSI_DEBIL_DBM  = -80;
const float CHIP_CALIENTE_C = 70.0;
const float RUIDO_ALTO_PH   = 0.15;  // desviación estándar del ruido
const float CAMBIO_SUBITO   = 0.05;  // pH/s sin estar dosificando
const float SOLUCION_BAJA_ML = 20.0;
const uint32_t CICLOS_MANTENIMIENTO = 5000;  // ejemplo, ajustar con el fabricante
const uint8_t LED_BRILLO = 200;

// Open-Meteo (temperatura del suelo a 54 cm ≈ agua en tubería enterrada)
const char* URL_CLIMA =
  "http://api.open-meteo.com/v1/forecast?latitude=19.04&longitude=-98.21"
  "&hourly=temperature_2m,soil_temperature_54cm&forecast_days=1"
  "&timezone=America%2FMexico_City";
const uint32_t CLIMA_CADA_MS = 30UL * 60UL * 1000UL;

// ============================================================================
//  3. ESCALA OFICIAL DE COLORES (muestreada de la barra de la gráfica del reto)
// ============================================================================
struct ColorPH { const char* nombre; uint8_t r, g, b; };
const ColorPH ESCALA[15] = {
  {"Rojo intenso",     216,  25,  29}, {"Rojo",             226,  35,  24},
  {"Rojo",             232,  77,  41}, {"Rojo-naranja",     242, 109,  34},
  {"Naranja",          246, 147,  28}, {"Amarillo-naranja", 250, 175,  63},
  {"Amarillo",         240, 215,  26}, {"Verde",             74, 176,  81},
  {"Verde azulado",     44, 159, 142}, {"Azul",              39, 126, 188},
  {"Azul oscuro",       47,  92, 178}, {"Indigo",            62,  76, 181},
  {"Violeta",           90,  63, 168}, {"Violeta",          110,  59, 155},
  {"Violeta oscuro",   120,  49, 137}
};
bool colorSuave = true;   // true: mezcla entre enteros ; false: salta por entero

// ============================================================================
//  4. ESCENARIOS DE SIMULACIÓN (modo demo). Valores ilustrativos, modelo simple.
// ============================================================================
// Química: el agua de la llave trae BICARBONATO (alcalinidad, lo mismo que forma
// el sarro). El ácido primero lo convierte en CO2 y el pH baja despacio
// (Henderson-Hasselbalch, pKa1 = 6.35); cuando se acaba, el pH se desploma.
// Agua dura = más bicarbonato = consume mucha más solución.
const float ACIDO_SOL_MOL_L = 0.0067;  // acidez titulable supuesta de la solución pH 4
struct Escenario {
  const char* nombre;
  float phInicio;   // NAN = conservar el agua actual
  float phDeriva;   // hacia dónde se mueve el agua sola (NAN = no se mueve)
  float kDeriva;    // qué tan rápido (1/s); se detiene al llegar
  float ruido;      // desviación estándar del ruido, en pH
  float flujo;      // 1 = la solución entra ; 0 = tanque vacío / manguera tapada
  float alc;        // alcalinidad (mmol/L de bicarbonato) si se reinicia el agua
  uint8_t falla;    // 0 ninguna, 1 desconectada, 2 congelada
};
const Escenario ESCENARIOS[10] = {
  {"Normal",                         7.30, NAN,  0.000, 0.010, 1, 2.0, 0},
  {"Agua dura / sarro (CaCO3)",      8.00, 8.30, 0.004, 0.015, 1, 5.0, 0},
  {"Descarga acida",                 NAN,  5.20, 0.050, 0.020, 1, 2.0, 0},
  {"Contaminante alcalino",          NAN,  9.60, 0.050, 0.020, 1, 2.0, 0},
  {"Exceso de hipoclorito",          8.80, NAN,  0.000, 0.015, 1, 2.5, 0},
  {"Sonda desconectada",             NAN,  NAN,  0.000, 0.000, 1, 2.0, 1},
  {"Electrodo danado / burbuja",     NAN,  NAN,  0.000, 0.250, 1, 2.0, 0},
  {"Senal congelada",                NAN,  NAN,  0.000, 0.000, 1, 2.0, 2},
  {"Tanque vacio / manguera tapada", NAN,  NAN,  0.000, 0.010, 0, 2.0, 0},
  {"Fuga / dilucion",                NAN,  7.30, 0.010, 0.010, 1, 2.0, 0}
};

// ============================================================================
//  5. MELODÍAS (ver justificación en CONTRATO_DATOS.md, sección "Sonidos")
// ============================================================================
struct Nota { uint16_t f; uint16_t ms; };   // f = 0 -> silencio
const Nota MEL_INICIO[]   = {{1047,120},{0,40},{1319,120},{0,40},{1568,250}};          // Do-Mi-Sol sube
const Nota MEL_FIN[]      = {{1568,120},{0,40},{1319,120},{0,40},{1047,350}};          // Sol-Mi-Do baja
const Nota MEL_BLOQUEO[]  = {{440,200},{0,120},{440,400}};                             // "no-no" grave
const Nota MEL_AVISO[]    = {{1319,150},{0,120},{1319,150},{0,120},{1319,150}};        // 3 pulsos (prioridad media)
const Nota MEL_CRITICA[]  = {{1760,100},{0,60},{1760,100},{0,60},{1760,100},{0,250},   // 10 pulsos rápidos
                             {1760,100},{0,60},{1760,100},{0,500},                      // en grupos 3+2, 3+2
                             {1760,100},{0,60},{1760,100},{0,60},{1760,100},{0,250},    // (prioridad alta)
                             {1760,100},{0,60},{1760,100}};
const Nota MEL_PARO[]     = {{1568,180},{1175,180},{880,180},{587,450}};               // escalera hacia abajo
const Nota MEL_NUBE[]     = {{2093,60},{0,40},{2637,80}};                              // chirrido corto
const Nota MEL_TICK[]     = {{2500,25}};                                               // cada pulso de bomba
#define LARGO(x) (sizeof(x) / sizeof(x[0]))

// ============================================================================
//  6. ALERTAS (bits del campo "a" en la telemetría)
// ============================================================================
enum Alerta : uint16_t {
  A_SONDA_DESC   = 1 << 0,  A_SONDA_CONG = 1 << 1,  A_RUIDO      = 1 << 2,
  A_CAMBIO_SUB   = 1 << 3,  A_FUERA_NOM  = 1 << 4,  A_SIN_EFECTO = 1 << 5,
  A_SOL_BAJA     = 1 << 6,  A_WIFI_DEBIL = 1 << 7,  A_SIN_NUBE   = 1 << 8,
  A_CHIP_CAL     = 1 << 9,  A_MANTENIM   = 1 << 10, A_PARO       = 1 << 11
};
const uint16_t ALERTAS_CRITICAS = A_SONDA_DESC | A_SONDA_CONG | A_SIN_EFECTO | A_PARO;
const uint16_t ALERTAS_AVISO    = A_RUIDO | A_CAMBIO_SUB | A_SOL_BAJA | A_WIFI_DEBIL |
                                  A_CHIP_CAL | A_MANTENIM;   // A_FUERA_NOM y A_SIN_NUBE: sin sonido

struct InfoAlerta { uint16_t bit; const char* codigo; const char* texto; };
const InfoAlerta INFO_ALERTAS[] = {
  {A_PARO,       "PARO",          "Paro de emergencia activo. Liberar desde la web (V9=0) o mantener BOOT 3 s"},
  {A_SONDA_DESC, "SONDA_DESC",    "Sin senal de pH: cable Po suelto, tarjeta sin 5 V, BNC flojo o XN03 sin respuesta"},
  {A_SONDA_CONG, "SONDA_CONG",    "Lectura congelada: electrodo seco o danado, o tarjeta pH sin alimentacion"},
  {A_SIN_EFECTO, "SIN_EFECTO",    "La bomba no cambia el pH: tanque de solucion vacio, manguera tapada o bomba sin 12 V"},
  {A_RUIDO,      "SENAL_RUIDOSA", "Senal inestable: burbuja en el bulbo, electrodo sucio o interferencia en el cable"},
  {A_CAMBIO_SUB, "CAMBIO_SUBITO", "El pH cambio rapido sin dosificar: posible contaminante o fuga"},
  {A_SOL_BAJA,   "SOLUCION_BAJA", "Quedan menos de 20 mL de solucion reguladora"},
  {A_CHIP_CAL,   "CHIP_CALIENTE", "Controlador sobre 70 C: revisar ventilacion del gabinete"},
  {A_WIFI_DEBIL, "WIFI_DEBIL",    "Senal WiFi debil (< -80 dBm): riesgo de desconexion"},
  {A_MANTENIM,   "MANTENIMIENTO", "La bomba supero los ciclos de servicio: revisar diafragma y mangueras"},
  {A_SIN_NUBE,   "SIN_NUBE",      "Sin conexion a Blynk: el control sigue local y seguro"},
  {A_FUERA_NOM,  "FUERA_NORMA",   "pH fuera del rango 6.5-8.5 de la NOM-127 para agua potable"}
};

// ============================================================================
//  7. ESTADO GLOBAL
// ============================================================================
enum Estado { REPOSO, PULSO, MEZCLANDO, PARO };
Estado estado = REPOSO;

BlynkTimer scheduler;
Preferences nvs;

bool  modoDemo   = true;   // por defecto: simulación (pedido del equipo)
bool  pausado    = false;  // comando q: congela todo (medición, envíos, mensajes)
int   escenario  = 0;
float umbral     = 6.0;

// Calibración
float adcPH0 = ADC_PH0_FABRICA, adcPorPH = ADC_POR_PH_FABRICA;
float uCal = 0.10;        // incertidumbre de calibración (pH). Baja al calibrar.
float calP1pH = NAN, calP1adc = NAN;   // primer punto de calibración en 2 puntos

// Medición
int   bufADC[30]; int idxADC = 0; int nADC = 0;   // 3 s de lecturas crudas
float ema = NAN;
const float ALFA = 0.2;                            // filtro exponencial >>> AJUSTAR
int   adcCrudo = 0;
float phFiltrado = NAN;    // pH ya filtrado y compensado por temperatura
float sigmaPH = 0;         // ruido (desviación estándar) en pH
float incertidumbre = 0.1; // ± del pH reportado
int   calidad = 0;         // 0-100
float histPH[6]; int idxHist = 0; int nHist = 0;  // 1 dato/s para la pendiente
float dpHdt = 0;           // pH/s
uint32_t congeladoDesde = 0;

// Temperaturas y diagnóstico
float tAgua = 25.0;   bool tAguaEstimada = false;   // suelo 54 cm (Open-Meteo)
float tAire = NAN;    float tChip = NAN;  float voltTo = NAN;
int   rssi = 0;       bool nubeOK = false;
uint32_t ultimoClima = 0;  bool climaPendiente = true;

// Dosificación
bool     bombaOn = false;
uint32_t tInicioBomba = 0, tInicioMezcla = 0, tFinDosis = 0;
float    volCorrida = 0, volUltimoPulso = 0, phAntesPulso = NAN;
float    pendiente = NAN;          // cuánto baja el pH por mL (se aprende pulso a pulso)
float    phInicioCorrida = NAN;
uint8_t  pulsosSinEfecto = 0;  float volSinEfecto = 0;
uint32_t tInicioCorrida = 0;

// Mantenimiento (se guarda en memoria no volátil)
uint32_t ciclosBomba = 0;  uint32_t msBombaTotal = 0;  float mlUsados = 0;

// Alertas
uint16_t alertas = 0, alertasPrevias = 0;
uint32_t ultimaCritica = 0;

// Simulador
float simHCO3 = 0.4, simCO2 = 0.045, simPHsonda = 7.30;   // mmol en el contenedor
int   simADCcongelado = 511;

// Sonido
const Nota* melodia = nullptr; uint8_t melLargo = 0, melIdx = 0, melPrioridad = 0;
uint32_t melSiguiente = 0;

// Valores enviados a Blynk (para no gastar mensajes en datos repetidos)
float enviadoPH = -99, enviadoU = -99; String enviadoEstado = ""; String enviadoColor = "";

// ============================================================================
//  8. FUNCIONES DE MÓDULOS I2C
// ============================================================================
bool escribirI2C(uint8_t dir, const uint8_t* datos, size_t n) {
  Wire.beginTransmission(dir);
  Wire.write(datos, n);
  return Wire.endTransmission() == 0;
}

int leerADC_XN03(uint8_t reg) {            // -1 si falla
  Wire.beginTransmission(XN03_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission() != 0) return -1;
  if (Wire.requestFrom(XN03_ADDR, 2) != 2) return -1;
  int alto = Wire.read(); int bajo = Wire.read();
  return (alto << 8) | bajo;               // MSB primero (como el ejemplo oficial)
}

void releFisico(bool on) {
#if RELE_FORMATO_REGISTRO
  uint8_t d[] = {REG_RELE, (uint8_t)(on ? 0x01 : 0x00)};
  escribirI2C(XN13_ADDR, d, 2);
#else
  uint8_t d[] = {(uint8_t)(on ? 0x01 : 0x00)};
  escribirI2C(XN13_ADDR, d, 1);
#endif
}

void rele(bool on) {
  bombaOn = on;
  if (modoDemo) { releFisico(false); return; }   // en demo la bomba es virtual: relé SIEMPRE apagado
  releFisico(on);
}

// Seguro: cada 2 s, si la bomba no debe estar prendida (o estamos en DEMO), reafirma APAGADO
void releSeguro() { if (modoDemo || !bombaOn) releFisico(false); }

void tono(uint16_t f, uint16_t ms) {
  uint8_t d[] = {REG_TONO, (uint8_t)(f >> 8), (uint8_t)(f & 0xFF),
                 (uint8_t)(ms >> 8), (uint8_t)(ms & 0xFF)};
  escribirI2C(XN44_ADDR, d, 5);
}

uint8_t ledR = 0, ledG = 0, ledB = 0, ledE = 0;   // último color escrito
void ledRGB(uint8_t r, uint8_t g, uint8_t b, uint8_t esc) {
  if (r == ledR && g == ledG && b == ledB && esc == ledE) return;   // no saturar el bus
  uint8_t d[] = {REG_RGB, r, g, b, esc};
  if (escribirI2C(XN03_ADDR, d, 5)) { ledR = r; ledG = g; ledB = b; ledE = esc; }
}

// ============================================================================
//  9. SONIDO (no bloqueante, con prioridad: una alarma crítica interrumpe)
// ============================================================================
void tocar(const Nota* m, uint8_t largo, uint8_t prioridad) {
  if (melodia && prioridad < melPrioridad) return;
  melodia = m; melLargo = largo; melIdx = 0; melPrioridad = prioridad; melSiguiente = 0;
}
#define TOCAR(m, p) tocar(m, LARGO(m), p)

void sonidoTick() {
  if (!melodia || millis() < melSiguiente) return;
  if (melIdx >= melLargo) { melodia = nullptr; melPrioridad = 0; return; }
  Nota n = melodia[melIdx++];
  if (n.f > 0) tono(n.f, n.ms);
  melSiguiente = millis() + n.ms + 10;
}

// ============================================================================
// 10. COLOR DEL INDICADOR UNIVERSAL + PATRONES DE LED PARA EL TÉCNICO
// ============================================================================
void colorDePH(float ph, uint8_t& r, uint8_t& g, uint8_t& b) {
  ph = constrain(ph, 0.0f, 14.0f);
  if (!colorSuave) ph = roundf(ph);
  int i = (int)ph; if (i >= 14) i = 13;
  float t = ph - i;
  r = ESCALA[i].r + t * (ESCALA[i + 1].r - ESCALA[i].r);
  g = ESCALA[i].g + t * (ESCALA[i + 1].g - ESCALA[i].g);
  b = ESCALA[i].b + t * (ESCALA[i + 1].b - ESCALA[i].b);
}

// Patrones (la caja está cerrada: el técnico los ve al abrirla; ver manual):
//  fijo = normal | "respira" = dosificando | parpadeo lento = aviso |
//  estrobo blanco = falla crítica | blanco lento = paro de emergencia
void ledTick() {
  uint32_t t = millis();
  if (alertas & A_PARO)           { bool on = (t / 500) % 2;  ledRGB(255, 255, 255, on ? LED_BRILLO : 0); return; }
  if (alertas & ALERTAS_CRITICAS) { bool on = (t / 120) % 2;  ledRGB(255, 255, 255, on ? LED_BRILLO : 0); return; }
  if (isnan(phFiltrado))          { ledRGB(255, 255, 255, 30); return; }
  uint8_t r, g, b; colorDePH(phFiltrado, r, g, b);
  uint8_t esc = LED_BRILLO;
  if (estado == PULSO || estado == MEZCLANDO) {               // respiración ~2 s
    float fase = (t % 2000) / 2000.0f;
    esc = 40 + (LED_BRILLO - 40) * (0.5f - 0.5f * cosf(2 * PI * fase));
  } else if (alertas & ALERTAS_AVISO) {                       // apagón breve cada 2 s
    if ((t % 2000) < 150) esc = 0;
  }
  ledRGB(r, g, b, esc);
}

// ============================================================================
// 11. SIMULADOR (modo demo): agua que se mezcla + sonda que tarda en responder
// ============================================================================
float H(float ph)   { return powf(10.0f, -ph); }
float pHde(float h) { return -log10f(h); }

float gauss() {   // ruido normal (Box-Muller)
  float u1 = (random(1, 10000)) / 10000.0f, u2 = (random(0, 10000)) / 10000.0f;
  return sqrtf(-2.0f * logf(u1)) * cosf(2 * PI * u2);
}

float simPHagua() {                      // Henderson-Hasselbalch; la solución no baja de pH 4
  return max(PH_SOLUCION, 6.35f + log10f(max(simHCO3, 1e-9f) / max(simCO2, 1e-12f)));
}
void simFijarPH(float ph) { simCO2 = simHCO3 / powf(10.0f, ph - 6.35f); }

void simAgregarAcido(float mL) {         // se llama al terminar cada pulso (volumen exacto)
  float mmol = mL * ACIDO_SOL_MOL_L * ESCENARIOS[escenario].flujo;
  float d = min(mmol, simHCO3);
  simHCO3 -= d; simCO2 += d;             // HCO3- + H+ -> CO2 + H2O
}

void elegirEscenario(int e) {
  escenario = constrain(e, 0, 9);
  const Escenario& s = ESCENARIOS[escenario];
  if (!isnan(s.phInicio)) {               // agua nueva de 200 mL
    simHCO3 = s.alc * VOL_AGUA_ML / 1000.0f;
    simFijarPH(s.phInicio); simPHsonda = s.phInicio;
  }
  simADCcongelado = adcCrudo > 0 ? adcCrudo : 511;
  congeladoDesde = 0;
  Serial.printf("Escenario %d: %s\n", escenario, s.nombre);
}

int simularADC(float dt) {
  const Escenario& s = ESCENARIOS[escenario];
  float p = simPHagua();
  if (!isnan(s.phDeriva) && simHCO3 > 1e-6f && fabsf(p - s.phDeriva) > 0.05f)
    simFijarPH(p + (s.phDeriva - p) * s.kDeriva * dt);   // el evento ocurre y se detiene al llegar
  simPHsonda += (simPHagua() - simPHsonda) * dt / 4.0f;  // retardo de mezcla τ = 4 s
  if (s.falla == 1) return 1023;                         // entrada flotando al tope
  if (s.falla == 2) return simADCcongelado;              // número idéntico siempre
  float ph = simPHsonda + s.ruido * gauss();
  if (escenario == 6 && random(100) < 5) ph += (random(2) ? 1.5 : -1.5);   // picos
  return constrain((int)lroundf(ADC_PH0_FABRICA - ph * ADC_POR_PH_FABRICA), 0, 1023);
}

// ============================================================================
// 12. MEDICIÓN: lectura -> mediana -> exponencial -> compensación T -> ± error
// ============================================================================
int medianaUltimos(int n) {
  n = min(n, nADC);
  int tmp[30];
  for (int i = 0; i < n; i++) tmp[i] = bufADC[(idxADC - 1 - i + 30) % 30];
  for (int i = 1; i < n; i++) { int x = tmp[i], j = i - 1; while (j >= 0 && tmp[j] > x) { tmp[j + 1] = tmp[j]; j--; } tmp[j + 1] = x; }
  return tmp[n / 2];
}

// Nernst: la pendiente del electrodo es proporcional a T (K). Tabla a 25 °C.
float compensarTemp(float ph) { return 7.0f + (ph - 7.0f) * (298.15f / (tAgua + 273.15f)); }

void muestrear() {                       // cada 100 ms
  if (pausado) return;
  int a = modoDemo ? simularADC(0.1f) : leerADC_XN03(REG_ADC1);
  bool desconectada = (a < 5 || a > 1018);
  if (desconectada) alertas |= A_SONDA_DESC; else alertas &= ~A_SONDA_DESC;
  if (desconectada) { phFiltrado = NAN; ema = NAN; nADC = 0; return; }
  adcCrudo = a;
  bufADC[idxADC] = a; idxADC = (idxADC + 1) % 30; if (nADC < 30) nADC++;
  float m = medianaUltimos(9);                                // quita picos
  ema = isnan(ema) ? m : ALFA * m + (1 - ALFA) * ema;          // suaviza
  phFiltrado = compensarTemp((adcPH0 - ema) / adcPorPH);
}

void calcularIncertidumbre() {           // cada 1 s
  if (nADC < 10) return;
  float media = 0; for (int i = 0; i < nADC; i++) media += bufADC[i]; media /= nADC;
  float var = 0;   for (int i = 0; i < nADC; i++) var += sq(bufADC[i] - media);
  float sigmaADC = sqrtf(var / (nADC - 1));
  sigmaPH = sigmaADC / adcPorPH;
  // Componentes (en pH):
  float uRuido = 2.0f * sigmaPH / 3.0f;                       // ruido tras el filtro (N efectivo ≈ 9)
  float uCuant = (1.0f / adcPorPH) / sqrtf(12.0f);            // resolución del ADC de 10 bits
  float uTemp  = fabsf(phFiltrado - 7.0f) * (tAguaEstimada ? 3.0f : 10.0f) / 298.15f;  // ±3 °C o ±10 °C
  incertidumbre = sqrtf(sq(uRuido) + sq(uCuant) + sq(uCal) + sq(uTemp));
  calidad = constrain((int)lroundf(100.0f * (0.30f - incertidumbre) / 0.25f), 0, 100);
  // Señal congelada: un ADC real SIEMPRE tiene ±1 cuenta de ruido
  if (sigmaADC < 0.01f) { if (!congeladoDesde) congeladoDesde = millis(); }
  else congeladoDesde = 0;
  if (congeladoDesde && millis() - congeladoDesde > 15000) alertas |= A_SONDA_CONG; else alertas &= ~A_SONDA_CONG;
  if (sigmaPH > RUIDO_ALTO_PH) alertas |= A_RUIDO; else alertas &= ~A_RUIDO;
}

float pendientePH() {                    // pH/s con los últimos 3 s
  if (nHist < 4) return 1.0f;
  return (histPH[(idxHist + 5) % 6] - histPH[(idxHist + 2) % 6]) / 3.0f;
}

float porcentajeHOCl(float ph, float tC) {   // fracción de cloro activo (Morris 1966)
  float T = tC + 273.15f;
  float pKa = 3000.0f / T - 10.0686f + 0.0253f * T;
  return 100.0f / (1.0f + powf(10.0f, ph - pKa));
}

// ============================================================================
// 13. TEMPERATURA DEL SUELO (Open-Meteo) Y DIAGNÓSTICO DEL EQUIPO
// ============================================================================
float valorHora(const String& s, const char* clave, int idx) {
  String k = String("\"") + clave + "\":[";
  int p = s.indexOf(k); if (p < 0) return NAN;
  p += k.length();
  for (int i = 0; i < idx; i++) { p = s.indexOf(',', p); if (p < 0) return NAN; p++; }
  if (s.startsWith("null", p)) return NAN;
  return s.substring(p, p + 8).toFloat();
}

void actualizarClima() {
  // Sólo en reposo: la petición puede tardar ~segundos y no debe retrasar la bomba
  if (estado != REPOSO || WiFi.status() != WL_CONNECTED) return;
  if (!climaPendiente && millis() - ultimoClima < CLIMA_CADA_MS) return;
  struct tm ti;
  if (!getLocalTime(&ti, 200)) return;              // falta la hora (NTP)
  HTTPClient http; http.setTimeout(4000);
  http.begin(URL_CLIMA);
  int code = http.GET();
  if (code == 200) {
    String r = http.getString();
    float ts = valorHora(r, "soil_temperature_54cm", ti.tm_hour);
    float ta = valorHora(r, "temperature_2m", ti.tm_hour);
    if (!isnan(ts)) { tAgua = ts; tAguaEstimada = true; }
    if (!isnan(ta)) tAire = ta;
    Serial.printf("Clima Puebla: suelo 54 cm = %.1f C, aire = %.1f C\n", ts, ta);
  } else Serial.printf("Open-Meteo no respondio (%d). Se usa T = %.1f C\n", code, tAgua);
  http.end();
  ultimoClima = millis(); climaPendiente = false;
}

void diagnosticoEquipo() {               // cada 5 s
  tChip = temperatureRead();
  rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  if (!modoDemo) { int a2 = leerADC_XN03(REG_ADC2); voltTo = a2 > 0 ? a2 * 3.3f / 1023.0f : NAN; }
  if (tChip > CHIP_CALIENTE_C) alertas |= A_CHIP_CAL; else alertas &= ~A_CHIP_CAL;
  if (WiFi.status() == WL_CONNECTED && rssi < RSSI_DEBIL_DBM) alertas |= A_WIFI_DEBIL; else alertas &= ~A_WIFI_DEBIL;
  if (!nubeOK) alertas |= A_SIN_NUBE; else alertas &= ~A_SIN_NUBE;
  if (VOL_SOLUCION_ML - mlUsados < SOLUCION_BAJA_ML) alertas |= A_SOL_BAJA; else alertas &= ~A_SOL_BAJA;
  if (ciclosBomba > CICLOS_MANTENIMIENTO) alertas |= A_MANTENIM; else alertas &= ~A_MANTENIM;
  static uint8_t vueltas = 0;                                // reintento cada 30 s, no bloquea
  if (WiFi.status() != WL_CONNECTED && ++vueltas % 6 == 0) WiFi.reconnect();
}

// ============================================================================
// 14. DOSIFICACIÓN
// ============================================================================
void guardarMantenimiento() {
  nvs.putUInt("ciclos", ciclosBomba); nvs.putUInt("msBomba", msBombaTotal); nvs.putFloat("mlUsados", mlUsados);
}

const char* mensajeAlertaPrincipal() {
  for (auto& a : INFO_ALERTAS) if (alertas & a.bit) return a.texto;
  return nullptr;
}

String textoEstado = "REPOSO|Listo";
void ponerEstado(const String& codigo, const String& msg) {
  textoEstado = codigo + "|" + msg;
  Serial.println(textoEstado);
}

void terminarDosificacion(const char* codigo, const char* motivo, bool exito) {
  rele(false);
  if (estado != PARO) estado = REPOSO;
  tFinDosis = millis();
  guardarMantenimiento();
  char msg[160];
  snprintf(msg, sizeof(msg), "%s. pH %.2f +/- %.2f (objetivo %.2f), %.1f mL, %lu s",
           motivo, phFiltrado, incertidumbre, umbral, volCorrida,
           (unsigned long)((millis() - tInicioCorrida) / 1000));
  ponerEstado(codigo, msg);
  if (exito) TOCAR(MEL_FIN, 2);
  if (nubeOK) { Blynk.virtualWrite(V2, 0); Blynk.virtualWrite(V4, 0); }
}

void finPulso() {                        // lo llama el temporizador
  uint32_t dur = millis() - tInicioBomba;
  rele(false);
  if (nubeOK) Blynk.virtualWrite(V4, 0);
  if (estado != PULSO) return;           // se canceló durante el pulso
  msBombaTotal += dur; ciclosBomba++;
  if (modoDemo) simAgregarAcido(volUltimoPulso);
  bool entro = !(modoDemo && ESCENARIOS[escenario].flujo == 0);
  volCorrida += volUltimoPulso; if (entro) mlUsados += volUltimoPulso;
  tInicioMezcla = millis();
  estado = MEZCLANDO;
  ponerEstado("MEZCLANDO", "Esperando a que la solucion se mezcle");
}

void iniciarPulso(float mL) {
  uint16_t ms = (uint16_t)constrain(lroundf(mL / CAUDAL_ML_S * 1000.0f), (long)PULSO_MIN_MS, (long)PULSO_MAX_MS);
  volUltimoPulso = CAUDAL_ML_S * ms / 1000.0f;
  phAntesPulso = phFiltrado;
  tInicioBomba = millis();
  estado = PULSO;
  rele(true);
  TOCAR(MEL_TICK, 1);
  if (nubeOK) Blynk.virtualWrite(V4, 1);
  scheduler.setTimeout(ms, finPulso);
  Serial.printf("Pulso de %u ms (%.2f mL)\n", ms, volUltimoPulso);
}

bool solicitarDosificacion(const char* origen) {
  if (estado != REPOSO) return false;
  if (isnan(phFiltrado) || (alertas & (ALERTAS_CRITICAS))) {
    TOCAR(MEL_BLOQUEO, 2);
    ponerEstado("BLOQUEADO", mensajeAlertaPrincipal() ? mensajeAlertaPrincipal() : "Sin lectura valida de pH");
    if (nubeOK) Blynk.virtualWrite(V2, 0);
    return false;
  }
  if (phFiltrado <= umbral + TOLERANCIA) {               // requisito 3.1
    TOCAR(MEL_BLOQUEO, 2);
    ponerEstado("BLOQUEADO", String("El pH (") + String(phFiltrado, 2) +
                ") ya esta en o bajo el umbral (" + String(umbral, 2) + ")");
    if (nubeOK) Blynk.virtualWrite(V2, 0);
    return false;
  }
  volCorrida = 0; pendiente = NAN; pulsosSinEfecto = 0; volSinEfecto = 0;
  phInicioCorrida = phFiltrado; tInicioCorrida = millis();
  TOCAR(MEL_INICIO, 2);
  ponerEstado("DOSIFICANDO", String("Iniciado desde ") + origen + ". Objetivo pH " + String(umbral, 2));
  iniciarPulso(ML_MIN);                 // 1er pulso mínimo: sirve para "aprender" la respuesta
  return true;
}

// Control por pulsos que aprende: tras cada pulso mide cuánto bajó el pH por mL
// (pendiente) y calcula el siguiente pulso = FRACCIÓN × error / pendiente, sin
// crecer más de CRECIMIENTO× el anterior. Así se acerca sin pasarse aunque el agua
// tenga amortiguador (el pH baja lento y luego se desploma).
void revisarMezcla() {                   // cada 1 s mientras está MEZCLANDO
  uint32_t t = millis() - tInicioMezcla;
  bool estable = fabsf(pendientePH()) < PEND_ESTABLE;
  if (t < ESPERA_MIN_MS || (!estable && t < ESPERA_MAX_MS)) return;

  // 1) Aprender: pH que bajó por cada mL
  float dPH = phAntesPulso - phFiltrado;
  float sMedida = max(dPH, 0.0f) / volUltimoPulso;
  if (isnan(pendiente)) pendiente = sMedida;
  else if (sMedida > 0) pendiente = max(sMedida, 0.5f * pendiente + 0.5f * sMedida);  // conservador
  else pendiente *= 0.7f;

  // 2) ¿Tanque vacío / manguera tapada? (3 pulsos y ≥ 10 mL sin cambio)
  if (dPH < 0.02f) { pulsosSinEfecto++; volSinEfecto += volUltimoPulso; }
  else             { pulsosSinEfecto = 0; volSinEfecto = 0; }
  if (pulsosSinEfecto >= 3 && volSinEfecto >= 10.0f) {
    alertas |= A_SIN_EFECTO;
    terminarDosificacion("FALLA", "Detenido: la bomba no cambia el pH", false);
    return;
  }
  // 3) ¿Llegamos?
  float error = phFiltrado - umbral;
  if (error <= TOLERANCIA) { terminarDosificacion("LISTO", "Umbral alcanzado", true); return; }
  // 4) ¿El pulso mínimo nos dejaría más lejos (del otro lado) que ahora? -> parar aquí
  if (pendiente > 0 && pendiente * ML_MIN - error > error) {
    terminarDosificacion("LISTO", "Lo mas cerca posible del umbral (limite: pulso minimo de 1.65 mL)", true);
    return;
  }
  // 5) Solución disponible
  float disponible = VOL_SOLUCION_ML - 5.0f - mlUsados;
  if (disponible < ML_MIN) { terminarDosificacion("FALLA", "Detenido: sin solucion suficiente", false); return; }

  float mL = (pendiente > 1e-6f) ? FRACCION * error / pendiente : CRECIMIENTO * volUltimoPulso;
  mL = min(mL, CRECIMIENTO * volUltimoPulso);
  mL = min(mL, min(ML_MAX, disponible));
  mL = max(mL, ML_MIN);
  ponerEstado("DOSIFICANDO", String("Siguiente pulso de ") + String(mL, 1) + " mL. Faltan " + String(error, 2) + " pH");
  iniciarPulso(mL);
}

void activarParo(const char* origen) {
  rele(false);
  estado = PARO;
  alertas |= A_PARO;
  TOCAR(MEL_PARO, 3);
  ponerEstado("PARO", String("Paro de emergencia (") + origen + ")");
  if (nubeOK) { Blynk.virtualWrite(V2, 0); Blynk.virtualWrite(V4, 0); Blynk.virtualWrite(V9, 1); }
}

// También sirve como "reconocer falla": borra SIN_EFECTO (el técnico ya revisó)
void liberarParo(const char* origen) {
  bool habia = (estado == PARO) || (alertas & A_SIN_EFECTO);
  alertas &= ~(A_PARO | A_SIN_EFECTO);
  pulsosSinEfecto = 0;
  if (estado == PARO) estado = REPOSO;
  if (habia) ponerEstado("REPOSO", String("Paro/falla liberado (") + origen + ")");
  if (nubeOK) Blynk.virtualWrite(V9, 0);
}

void seguridadBomba() {                  // cada 50 ms: la bomba nunca se queda prendida
  if (bombaOn && millis() - tInicioBomba > PULSO_MAX_MS + 300) {
    rele(false);
    terminarDosificacion("FALLA", "Detenido por seguridad de bomba", false);
  }
}

void botonTick() {                       // BOOT: toque = paro ; 3 s = liberar
  static uint32_t presionado = 0; static bool largoHecho = false;
  bool abajo = digitalRead(BOTON_BOOT) == LOW;
  if (abajo && !presionado) { presionado = millis(); largoHecho = false; }
  if (abajo && !largoHecho && millis() - presionado > 3000) { liberarParo("boton BOOT"); largoHecho = true; }
  if (!abajo && presionado) {
    if (!largoHecho && millis() - presionado > 50) activarParo("boton BOOT");
    presionado = 0;
  }
}

// ============================================================================
// 15. ALERTAS: sonido al aparecer, crítica se repite cada 20 s
// ============================================================================
void revisarAlertas() {
  // Fuera de norma (informativo) y cambio súbito sin dosificar
  if (!isnan(phFiltrado) && (phFiltrado < NOM_MIN || phFiltrado > NOM_MAX)) alertas |= A_FUERA_NOM;
  else alertas &= ~A_FUERA_NOM;
  bool tranquilo = estado == REPOSO && millis() - tFinDosis > 30000;
  if (tranquilo && nHist >= 4 && fabsf(dpHdt) > CAMBIO_SUBITO) alertas |= A_CAMBIO_SUB;
  else if (fabsf(dpHdt) < CAMBIO_SUBITO / 3) alertas &= ~A_CAMBIO_SUB;

  // Una falla crítica detiene la bomba
  if ((alertas & (A_SONDA_DESC | A_SONDA_CONG)) && (estado == PULSO || estado == MEZCLANDO))
    terminarDosificacion("FALLA", "Detenido: falla de sonda", false);

  uint16_t nuevas = alertas & ~alertasPrevias;
  if (nuevas & ALERTAS_CRITICAS) { TOCAR(MEL_CRITICA, 3); ultimaCritica = millis(); }
  else if (nuevas & ALERTAS_AVISO) TOCAR(MEL_AVISO, 2);
  if ((alertas & ALERTAS_CRITICAS) && millis() - ultimaCritica > 20000) { TOCAR(MEL_CRITICA, 3); ultimaCritica = millis(); }
  if (nuevas) {
    for (auto& a : INFO_ALERTAS) if (nuevas & a.bit) Serial.printf("ALERTA %s: %s\n", a.codigo, a.texto);
  }
  alertasPrevias = alertas;
}

// ============================================================================
// 16. BLYNK (ver CONTRATO_DATOS.md). Se cuidan los mensajes: plan gratis
//     nuevo = 30 000 mensajes/mes -> sólo se envía lo que cambió.
// ============================================================================
void enviarRapido() {                    // cada 2 s
  if (pausado) return;
  if (!nubeOK || isnan(phFiltrado)) return;
  if (fabsf(phFiltrado - enviadoPH) >= 0.01f) { Blynk.virtualWrite(V0, phFiltrado); enviadoPH = phFiltrado; }
  uint8_t r, g, b; colorDePH(phFiltrado, r, g, b);
  char hex[8]; snprintf(hex, sizeof(hex), "#%02X%02X%02X", r, g, b);
  if (enviadoColor != hex) { Blynk.setProperty(V0, "color", hex); enviadoColor = hex; }
  String est = textoEstado;               // en reposo, una alerta con sonido tapa el último resultado
  if (estado == REPOSO || estado == PARO) {
    for (auto& a : INFO_ALERTAS)
      if (alertas & a.bit & (ALERTAS_CRITICAS | ALERTAS_AVISO)) { est = String(a.codigo) + "|" + a.texto; break; }
  }
  if (est != enviadoEstado) { Blynk.virtualWrite(V3, est); enviadoEstado = est; }
}

void enviarTelemetria() {                // cada 10 s
  if (pausado) return;
  if (!nubeOK) return;
  if (fabsf(incertidumbre - enviadoU) >= 0.005f) { Blynk.virtualWrite(V5, incertidumbre); enviadoU = incertidumbre; }
  char j[250];
  snprintf(j, sizeof(j),
    "{\"t\":%.1f,\"te\":%d,\"ta\":%.1f,\"tc\":%.1f,\"vo\":%.2f,\"w\":%d,\"h\":%.0f,"
    "\"d\":%.3f,\"q\":%d,\"v\":%.1f,\"r\":%.1f,\"c\":%lu,\"s\":%lu,\"a\":%u,\"e\":%d,\"m\":%d}",
    tAgua, tAguaEstimada ? 1 : 0, isnan(tAire) ? -99.0f : tAire, tChip,
    isnan(voltTo) ? -1.0f : voltTo, rssi,
    isnan(phFiltrado) ? -1.0f : porcentajeHOCl(phFiltrado, tAgua),
    dpHdt * 60.0f, calidad, volCorrida, max(0.0f, VOL_SOLUCION_ML - mlUsados),
    (unsigned long)ciclosBomba, (unsigned long)(msBombaTotal / 1000),
    alertas, escenario, modoDemo ? 1 : 0);
  Blynk.virtualWrite(V8, j);
}

BLYNK_CONNECTED() {
  nubeOK = true;
  Blynk.syncVirtual(V1, V6, V7);         // umbral, modo y escenario guardados
  Blynk.virtualWrite(V2, 0);
  Blynk.virtualWrite(V9, estado == PARO ? 1 : 0);
  enviadoPH = -99; enviadoU = -99; enviadoEstado = ""; enviadoColor = "";
  TOCAR(MEL_NUBE, 1);
}
BLYNK_DISCONNECTED() { nubeOK = false; }

BLYNK_WRITE(V1) { umbral = constrain(param.asFloat(), 4.5f, 7.0f); }
BLYNK_WRITE(V2) {
  if (param.asInt() == 1) solicitarDosificacion("la web");
  else if (estado == PULSO || estado == MEZCLANDO) terminarDosificacion("CANCELADO", "Cancelado por el usuario", false);
}
BLYNK_WRITE(V6) {
  bool demo = param.asInt() == 1;
  if (demo == modoDemo) return;
  if (estado == PULSO || estado == MEZCLANDO) terminarDosificacion("CANCELADO", "Cambio de modo", false);
  rele(false); modoDemo = demo; ema = NAN; nADC = 0;
  ponerEstado("REPOSO", demo ? "Modo DEMO (simulacion)" : "Modo REAL (sonda y bomba)");
}
BLYNK_WRITE(V7) { if (modoDemo) elegirEscenario(param.asInt()); }
BLYNK_WRITE(V9) { if (param.asInt() == 1) activarParo("la web"); else liberarParo("la web"); }

// ============================================================================
// 17. COMANDOS DEL TÉCNICO (Monitor Serie a 115200, "New Line")
// ============================================================================
void imprimirDiagnostico() {
  Serial.println("\n========== DIAGNOSTICO AquaMind ==========");
  Serial.printf("Modo: %s | Escenario: %s\n", modoDemo ? "DEMO" : "REAL", ESCENARIOS[escenario].nombre);
  Serial.printf("ADC crudo: %d | pH: %.3f +/- %.3f | calidad %d/100 | ruido %.3f pH\n",
                adcCrudo, phFiltrado, incertidumbre, calidad, sigmaPH);
  Serial.printf("Calibracion: pH = (%.2f - ADC) / %.3f | u_cal %.2f\n", adcPH0, adcPorPH, uCal);
  Serial.printf("dpH/dt: %.3f pH/min | HOCl activo: %.0f %%\n", dpHdt * 60, porcentajeHOCl(phFiltrado, tAgua));
  Serial.printf("T agua (suelo 54 cm): %.1f C %s | T aire: %.1f C | T chip: %.1f C | To: %.2f V\n",
                tAgua, tAguaEstimada ? "(Open-Meteo)" : "(por defecto)", tAire, tChip, voltTo);
  Serial.printf("WiFi: %s %d dBm | Blynk: %s\n", WiFi.status() == WL_CONNECTED ? "OK" : "NO", rssi, nubeOK ? "OK" : "NO");
  Serial.printf("Bomba: %lu ciclos, %lu s, %.1f mL usados, quedan %.1f mL\n",
                (unsigned long)ciclosBomba, (unsigned long)(msBombaTotal / 1000), mlUsados, VOL_SOLUCION_ML - mlUsados);
  Serial.printf("I2C: XN03 %s | XN13 %s | XN44 %s\n",
                [](){ Wire.beginTransmission(XN03_ADDR); return Wire.endTransmission() == 0; }() ? "OK" : "NO RESPONDE",
                [](){ Wire.beginTransmission(XN13_ADDR); return Wire.endTransmission() == 0; }() ? "OK" : "NO RESPONDE",
                [](){ Wire.beginTransmission(XN44_ADDR); return Wire.endTransmission() == 0; }() ? "OK" : "NO RESPONDE");
  Serial.println("Alertas activas:");
  bool alguna = false;
  for (auto& a : INFO_ALERTAS) if (alertas & a.bit) { Serial.printf("  - %s: %s\n", a.codigo, a.texto); alguna = true; }
  if (!alguna) Serial.println("  (ninguna)");
  Serial.println("==========================================\n");
}

void ayuda() {
  Serial.println(
    "\nComandos:  d diagnostico | m cambia DEMO/REAL | s0..s9 escenario | i5.5 dosificar a 5.5\n"
    "           q PAUSA / reanudar todo | x detener dosificacion | e paro | r liberar paro | l prueba LED | b prueba sonidos\n"
    "           k7.12 calibrar 1 punto (pH del lector de referencia)\n"
    "           p4.00 / p7.12 calibrar 2 puntos (manda los dos) | f calibracion de fabrica\n"
    "           z reiniciar contadores de bomba y solucion | c colores suaves on/off\n");
}

void guardarCalibracion() { nvs.putFloat("ph0", adcPH0); nvs.putFloat("pend", adcPorPH); nvs.putFloat("ucal", uCal); }

void ejecutarComando(String c) {
  c.trim(); if (!c.length()) return;
  char o = tolower(c[0]); float v = c.substring(1).toFloat(); bool hayNum = c.length() > 1;
  switch (o) {
    case 'd': imprimirDiagnostico(); break;
    case 'm': modoDemo = !modoDemo; rele(false); ema = NAN; nADC = 0;
              if (nubeOK) Blynk.virtualWrite(V6, modoDemo ? 1 : 0);
              Serial.println(modoDemo ? "Modo DEMO" : "Modo REAL"); break;
    case 's': if (modoDemo && hayNum) { elegirEscenario((int)v); if (nubeOK) Blynk.virtualWrite(V7, escenario); }
              else { Serial.println("Escenarios solo en modo DEMO (s0..s9)"); }
              break;
    case 'i': if (hayNum) umbral = constrain(v, 4.5f, 7.0f); solicitarDosificacion("consola"); break;
    case 'q': pausado = !pausado;
              if (pausado) {
                if (estado == PULSO || estado == MEZCLANDO) terminarDosificacion("CANCELADO", "Pausado desde consola", false);
                rele(false); melodia = nullptr;
                Serial.println(">>> PAUSADO. Todo congelado y bomba apagada. Escribe q para reanudar.");
                if (nubeOK) Blynk.virtualWrite(V3, "PAUSADO|Sistema en pausa (consola)");
              } else {
                enviadoEstado = "";
                Serial.println(">>> REANUDADO.");
              }
              break;
    case 'x': if (estado == PULSO || estado == MEZCLANDO) terminarDosificacion("CANCELADO", "Detenido por consola", false); break;
    case 'e': activarParo("consola"); break;
    case 'r': liberarParo("consola"); break;
    case 'k': if (hayNum && !isnan(ema)) {                     // 1 punto: mueve la recta
                adcPH0 = ema + v * adcPorPH; uCal = 0.05f; guardarCalibracion();
                Serial.printf("Calibrado 1 punto: pH %.2f en ADC %.1f -> ph0 %.2f\n", v, ema, adcPH0); } break;
    case 'p': if (hayNum && !isnan(ema)) {
                if (isnan(calP1pH)) { calP1pH = v; calP1adc = ema; Serial.printf("Punto 1 guardado (pH %.2f, ADC %.1f). Ahora el segundo.\n", v, ema); }
                else if (fabsf(v - calP1pH) > 1.0f) {
                  adcPorPH = (calP1adc - ema) / (v - calP1pH);
                  adcPH0 = ema + v * adcPorPH; uCal = 0.03f; guardarCalibracion();
                  Serial.printf("Calibrado 2 puntos: pendiente %.3f ADC/pH, ph0 %.2f\n", adcPorPH, adcPH0);
                  calP1pH = NAN;
                } else Serial.println("Los dos puntos deben diferir en mas de 1 pH"); } break;
    case 'f': adcPH0 = ADC_PH0_FABRICA; adcPorPH = ADC_POR_PH_FABRICA; uCal = 0.10f; guardarCalibracion();
              Serial.println("Calibracion de fabrica restaurada"); break;
    case 'z': ciclosBomba = 0; msBombaTotal = 0; mlUsados = 0; guardarMantenimiento();
              Serial.println("Contadores reiniciados (tanque lleno)"); break;
    case 'c': colorSuave = !colorSuave; Serial.println(colorSuave ? "Colores suaves" : "Colores por entero"); break;
    case 'l': for (int i = 0; i <= 14; i++) { ledRGB(ESCALA[i].r, ESCALA[i].g, ESCALA[i].b, LED_BRILLO);
                Serial.printf("pH %d: %s\n", i, ESCALA[i].nombre); delay(600); } break;
    case 'b': { const Nota* m[] = {MEL_INICIO, MEL_FIN, MEL_BLOQUEO, MEL_AVISO, MEL_CRITICA, MEL_PARO};
                const uint8_t n[] = {LARGO(MEL_INICIO), LARGO(MEL_FIN), LARGO(MEL_BLOQUEO), LARGO(MEL_AVISO), LARGO(MEL_CRITICA), LARGO(MEL_PARO)};
                const char* nom[] = {"Inicio", "Fin", "Bloqueo", "Aviso", "Critica", "Paro"};
                for (int k = 0; k < 6; k++) { Serial.println(nom[k]);
                  for (int q = 0; q < n[k]; q++) { if (m[k][q].f) tono(m[k][q].f, m[k][q].ms); delay(m[k][q].ms + 10); }
                  delay(700); } } break;
    default: ayuda();
  }
}

void leerSerial() {
  static String linea;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') { if (linea.length()) ejecutarComando(linea); linea = ""; }
    else if (linea.length() < 30) linea += ch;
  }
}

// ============================================================================
// 18. TAREAS PERIÓDICAS, SETUP Y LOOP
// ============================================================================
void cadaSegundo() {
  if (pausado) return;
  if (!isnan(phFiltrado)) {
    histPH[idxHist] = phFiltrado; idxHist = (idxHist + 1) % 6; if (nHist < 6) nHist++;
    dpHdt = pendientePH();
  }
  calcularIncertidumbre();
  revisarAlertas();
  if (estado == MEZCLANDO) revisarMezcla();
  static uint8_t n = 0;
  if (++n % 5 == 0)
    Serial.printf("%s | ADC %d | pH %.2f +/- %.2f | umbral %.2f | %s | T %.1f C | a=0x%03X\n",
                  modoDemo ? "DEMO" : "REAL", adcCrudo, phFiltrado, incertidumbre, umbral,
                  textoEstado.c_str(), tAgua, alertas);
}

void setup() {
  Serial.begin(115200);
  Wire.setPins(I2C_SDA, I2C_SCL);
  Wire.begin();
  pinMode(BOTON_BOOT, INPUT_PULLUP);
  randomSeed(esp_random());
  releFisico(false);                     // relé apagado SIEMPRE al arrancar
  bombaOn = false;

  nvs.begin("aquamind", false);
  adcPH0   = nvs.getFloat("ph0", ADC_PH0_FABRICA);
  adcPorPH = nvs.getFloat("pend", ADC_POR_PH_FABRICA);
  uCal     = nvs.getFloat("ucal", 0.10f);
  ciclosBomba  = nvs.getUInt("ciclos", 0);
  msBombaTotal = nvs.getUInt("msBomba", 0);
  mlUsados     = nvs.getFloat("mlUsados", 0);

  elegirEscenario(0);
  ayuda();

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  Serial.print("Conectando a WiFi");
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " OK" : " sin WiFi (funciona local)");
  configTime(-6 * 3600, 0, "pool.ntp.org", "time.nist.gov");   // Puebla, UTC-6 sin horario de verano
  Blynk.config(BLYNK_AUTH_TOKEN);
  if (WiFi.status() == WL_CONNECTED) Blynk.connect(3000);

  scheduler.setInterval(100L,   muestrear);
  scheduler.setInterval(50L,    seguridadBomba);
  scheduler.setInterval(2000L,  releSeguro);
  scheduler.setInterval(1000L,  cadaSegundo);
  scheduler.setInterval(2000L,  enviarRapido);
  scheduler.setInterval(5000L,  diagnosticoEquipo);
  scheduler.setInterval(10000L, enviarTelemetria);
  scheduler.setInterval(15000L, actualizarClima);
}

void loop() {
  // Mientras la bomba está prendida NO se llama a Blynk.run(): si el internet se
  // cayó, el intento de reconexión podría tardar y retrasar el apagado de la bomba.
  if (estado != PULSO && WiFi.status() == WL_CONNECTED) Blynk.run();
  if (WiFi.status() != WL_CONNECTED) nubeOK = false;
  scheduler.run();
  sonidoTick();
  ledTick();
  botonTick();
  leerSerial();
}
