# Ad Networks – contexto para Claude

Reemplazo en Python del escenario de Make **Ad_Networks** (blueprint original: `make_blueprint.json`,
contiene secretos, no compartir). Descarga reportes de redes publicitarias y los guarda en la carpeta
sincronizada de OneDrive, que consume Power BI. Ver `README.md` para uso.

## Estructura
- `run.py` – CLI. `python run.py` corre TODAS las fuentes; `python run.py teads taboola` solo esas;
  `python run.py login` solo inicia sesión de Microsoft; `--hoy YYYY-MM-DD` simula otra fecha.
- `adnet/fuentes.py` – una función por red, registrada en `FUENTES`.
- `adnet/comun.py` – `.env`, fechas (`Fechas.inicio` = hoy−40, `Fechas.ayer`), `pedir()` y `guardar()` (escritura atómica).
- `adnet/graph.py` – Microsoft Graph para leer el correo de AdX.
- `.env` – credenciales y la ruta `ONEDRIVE_AD_NETWORKS`. `logs/AAAA-MM.log` – logs.
- `programar_tarea.ps1` – registra la tarea diaria en el Programador de tareas (aún no registrada).

## Fuentes y salidas (subcarpetas de `ONEDRIVE_AD_NETWORKS`)
| Fuente | Salida | Notas |
|---|---|---|
| trm | `TRM\TRM_diario.json` + fila en `TRM\EUR\data.xlsx` (Hoja1: Fecha, EUR) | TRM filtrada por año en curso; EUR→USD de floatrates; no duplica fechas |
| seedtag | `Seedtag\DataSeedtag.json` | `api_key` va como query param, no header |
| membrana | `Membrana\DataMembrana.json` | código listo; en nov-2026 la API no respondía por una falla temporal del proveedor (no requiere cambios) |
| teads | `Teads\DataTeads.json`, `Teads\QueryTeads.json` | dos tokens: uno para crear el reporte, otro para consultarlo |
| adx | `AdX_OpenBidding\AdX_OpenBidding.csv` | nombre fijo (se reemplaza a diario). Correo de admanager-noreply@google.com en Outlook.com personal; `GRAPH_TENANT=consumers`; sesión en `.graph_token_cache.json`. El reporte de GAM cubre 30 días y llega ~7:00 |
| refinery89 | `Refinery89\Refinery89_Data.csv` | |
| taboola | `Taboola\DataTaboola.json` | **desactivada desde 2026-11-17** (Taboola ya no está con ellos): código y credenciales comentados en Python; en Apps Script está fuera de `FUENTES` (en `FUENTES_INACTIVAS`, solo corre con `probar_taboola`) |
| mgid | `MGID\DataMgid.json` | agregada el 2026-11-17 en Python y Apps Script (`probar_mgid`; requiere propiedades MGID_CLIENT_ID y MGID_TOKEN). GET `/v2/pub/account/{MGID_CLIENT_ID}/website-custom-report` con Bearer `MGID_TOKEN`; dimensiones date,website; métricas pageViews,revenue; limit=100 |
| meta | `Meta\DataMeta.json` | agregada el 2026-11-21 en Python y Apps Script (`probar_meta`; requiere propiedad META_PAGE_TOKEN, opcional META_PAGE_ID=127926969701). Graph API v23.0 `/{page}/insights`, métrica `monetization_approximate_earnings` (total y desglose `monetization_tool`), USD, 40 días. Si una consulta falla no se escribe nada (queda el archivo anterior). Basada en `E:\Carpetas\Descargas\mbs\video_earnings.py` |

| momagic | `Momagic\DataMomagic.json` | agregada el 2026-11-21 en Python y Apps Script (`probar_momagic`; requiere propiedades MOMAGIC_USER, MOMAGIC_PASS, MOMAGIC_BASIC_AUTH). Login POST `dsp-ssps.momagic.com/authenticate/userpass` (303 + cookie `id`), luego POST `/reporting/gamreportData/report/stats` con `Authorization: Basic` fija; 40 días, una fila por día (lista JSON = `stats.data`). Sin filas → error y no escribe. Basada en `E:\Carpetas\Descargas\momagic-request\request.py` (allí el rango era inicio de mes → ayer) |

Los formatos replican exactamente los de Make (Power BI depende de ellos): no cambiarlos sin confirmar.

## Forma de trabajo con el usuario
- Ir **paso a paso** y explicar antes de ejecutar.
- **Nunca correr contra el OneDrive real sin confirmar.** Para probar, apuntar a la carpeta de pruebas:
  `$env:ONEDRIVE_AD_NETWORKS = "D:\vbetancurt\Downloads\ad_networks\pruebas_claude"` (necesita una copia de
  `TRM\EUR\data.xlsx` ahí para la fuente trm).
- Responder en español.

## Dirección actual: migración a Google Apps Script (decidida 2026-11-10)
La versión Python queda como referencia funcional. El destino es Apps Script en `apps_script/`, administrado
con `clasp` (v3, instalado global). Requisitos del usuario:
- Los archivos **deben seguir en OneDrive** (Power BI) → subir vía Microsoft Graph con una app registrada en
  Entra ID de Editora del Mar (Files.ReadWrite + offline_access); puede requerir aprobación de TI.
- AdX **por correo, leído con GmailApp**: el proyecto Apps Script vive en una cuenta Gmail distinta a la de GAM
  (decisión del usuario: no usar la API de GAM). El informe programado de GAM debe llegar a ese Gmail
  (agregarlo como destinatario en GAM o reenviar desde Outlook.com). No hace falta Google Cloud ni Graph para correo.
- Se probará contra una carpeta de pruebas en OneDrive antes de tocar las reales.
- VPS: posible a futuro, no por ahora.

## Apps Script / Microsoft
- Proyecto Apps Script en `audienciaseluniversal@gmail.com`, scriptId en `apps_script/.clasp.json`, zona America/Bogota.
  `clasp push` puede decir "Skipping push" al cambiar el manifiesto → usar `clasp push --force`.
  Ojo: borrar un archivo local y hacer push puede decir "already up to date" y dejarlo en Google; hace falta
  algún cambio de contenido para que el push se ejecute. Verificar con `clasp clone-script` en carpeta temporal
  (y borrarla después: puede traer secretos).
- Credenciales en Propiedades del script (cargadas el 2026-11-10). `ONEDRIVE_BASE` apunta hoy a
  `Fuentes_Datos/Publicidad/Ad_Networks/_pruebas_apps_script`; cambiar a `Fuentes_Datos/Publicidad/Ad_Networks`
  cuando se pase a producción.
- App de Entra ID "Ad Networks Apps Script" (inquilino único Editora del Mar), permisos delegados
  User.Read, Files.ReadWrite, offline_access. Redirect: `https://script.google.com/macros/d/<scriptId>/usercallback`.
  IDs y secreto en `.env` (MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET).
- **El secreto de cliente vence en noviembre de 2028** → renovarlo en Entra (Certificados y secretos) antes.

## Estado Apps Script (2026-11-10)
- Código en `apps_script/` (Config, OneDrive, Fuentes, Main). Microsoft autorizado como powerbi@eluniversal.com.co
  (es la misma cuenta del OneDrive sincronizado en el PC).
- Probado en `_pruebas_apps_script`: trm (incl. fila Excel), seedtag, teads, refinery89, taboola → idénticos a Make.
- GAM ya envía el informe directo a audienciaseluniversal@gmail.com (configurado por el usuario).

## Paso a producción (2026-11-17)
`pasarAProduccion()` en Main.js (idempotente) cambia ONEDRIVE_BASE a la carpeta real y crea un único activador
diario de `ejecutarTodo` (~7:30 Bogotá; Google lo corre dentro de ±15 min). El usuario debe correrlo, poner la
notificación de fallas en "Inmediatamente" en la UI de Activadores y desactivar Make antes del día siguiente.

## Pendientes
1. Probar `probar_adx` cuando llegue el primer correo de GAM al Gmail (~7:00).
2. Cambiar `ONEDRIVE_BASE` a `Fuentes_Datos/Publicidad/Ad_Networks` (producción) y borrar `_pruebas_apps_script`.
3. Trigger diario (≥ 7:30, notificación de fallas inmediata) — **el usuario pidió no crearlo todavía**.
4. Desactivar el escenario en Make el mismo día que arranque el trigger.
5. Opcional: revisión de "datos de ayer" y resumen por correo.
6. Recomendado: rotar las credenciales que estuvieron en el blueprint exportado.
7. Propuesto (sin decidir): reemplazar `TRM\EUR\data.xlsx` por `TRM\EUR\eur_usd.csv` (`fecha,eur_usd`, ISO,
   reescrito completo y ordenado cada día). Requiere cambiar el origen en Power BI con configuración regional
   Inglés (EE. UU.). Probar primero en `_pruebas_apps_script`. El 2026-11-11 se quitaron 12 filas duplicadas de
   data.xlsx (260 → 248); el respaldo quedó en `D:\vbetancurt\Downloads\ad_networks\pruebas_claude\respaldo_data_20261111_0847.xlsx`.
