# Ad Networks – contexto para Claude

Descarga reportes de redes publicitarias y los guarda en OneDrive, que consume Power BI. Reemplaza el
escenario de Make **Ad_Networks** (`make_blueprint.json`: tiene secretos, no compartir). Uso en `README.md`.

**Producción = Apps Script** (`apps_script/`, desde 2026-11-17). Python (`adnet/`, `run.py`) es la referencia
funcional y sirve para probar rápido en local; toda fuente nueva se implementa en AMBOS.

## Estructura
- `run.py` – CLI: `python run.py [fuente ...]`, `--listar`, `--hoy YYYY-MM-DD`, `login` (sesión Microsoft, solo AdX en Python).
- `adnet/fuentes.py` – una función por red, registrada en `FUENTES`. `adnet/comun.py` – `.env`, fechas
  (`inicio` = hoy−40, `ayer`), `pedir()`, `guardar()` (escritura atómica). `adnet/graph.py` – correo de AdX.
- `apps_script/` – `Config.js` (props, fechas, `pedir`), `OneDrive.js` (Graph), `Fuentes.js` (`FUENTES`),
  `Main.js` (`ejecutarTodo`, `probar_<fuente>`, `pasarAProduccion`).
- `.env` (ignorado) – credenciales locales y `ONEDRIVE_AD_NETWORKS`; `.env.example` lista las variables sin valores.

## Fuentes (salida en `Fuentes_Datos/Publicidad/Ad_Networks/<carpeta>`)
Los formatos replican los de Make y Power BI depende de ellos: **no cambiarlos sin confirmar**.

| Fuente | Salida | Notas |
|---|---|---|
| trm | `TRM\TRM_diario.json` + filas en `TRM\EUR\data.xlsx` (Hoja1: Fecha, EUR) | TRM del año en curso; EUR→USD de floatrates; no duplica fechas |
| seedtag | `Seedtag\DataSeedtag.json` | `api_key` va como query param |
| membrana | `Membrana\DataMembrana.json` | en nov-2026 la API falló por el proveedor; el código no necesita cambios |
| teads | `Teads\DataTeads.json`, `QueryTeads.json` | dos tokens: crear reporte / consultarlo |
| adx | `AdX_OpenBidding\AdX_OpenBidding.csv` | adjunto del correo de GAM (~7:00, cubre 30 días); en Apps Script se lee con GmailApp, en Python con Graph |
| adkaora | `AdKaora\<nombre del adjunto>` | adjunto del último correo de fernando.davila@adkaora.com (ventana `ADKAORA_DIAS`=2, no exige que sea de hoy), guardado con el nombre original (no fijo). Props opcionales `ADKAORA_REMITENTE`, `ADKAORA_ASUNTO`. En Python lee la bandeja `inbox` (o `ADKAORA_CARPETA_CORREO_ID`) por Graph |
| refinery89 | `Refinery89\Refinery89_Data.csv` | |
| mgid | `MGID\DataMgid.json` | props `MGID_CLIENT_ID`, `MGID_TOKEN` |
| meta | `Meta\DataMeta.json` | prop `META_PAGE_TOKEN` (token de la PÁGINA); `META_PAGE_ID` opcional. Insights `monetization_approximate_earnings`, total y por herramienta. No existe una métrica `video_earnings`. El acceso a datos del token vence ~2027-02-19 (renovarlo) |
| momagic | `Momagic\DataMomagic.json` | props `MOMAGIC_USER`, `MOMAGIC_PASS`, `MOMAGIC_BASIC_AUTH`. Login con cookie `id`; lista JSON = `stats.data` |
| taboola | `Taboola\DataTaboola.json` | **desactivada** (ya no están con ellos): en Apps Script está en `FUENTES_INACTIVAS`, solo corre con `probar_taboola` |

Convenciones de toda fuente: rango hoy−40 → ayer; si una consulta falla o no trae filas, **lanzar error y no
escribir** (queda el archivo anterior y Google envía el correo de falla). Los IDs públicos (p. ej. página de
Meta, publishers de Seedtag) pueden ir en el código; tokens, claves y contraseñas **solo** en `.env` y en
Propiedades del script, nunca en el código ni en `.env.example`.

## Cómo agregar una fuente
1. Función en `adnet/fuentes.py` + `FUENTES`; variables en `.env.example` (sin valores).
2. `fuenteX` en `Fuentes.js` + `FUENTES`, y `probar_x()` en `Main.js`.
3. Probar en Python contra una carpeta de pruebas (`ONEDRIVE_AD_NETWORKS` en `.env`), nunca la real.
4. El usuario crea las propiedades en Apps Script **antes** del push (si no, la fuente falla en la corrida de las 7:30).
5. `clasp push --force` desde `apps_script/` y el usuario corre `probar_x` desde el editor (escribe en `_pruebas_apps_script`, no en la carpeta real).
6. Actualizar la tabla de arriba, commit y push.

## Forma de trabajo con el usuario
- Responder en español. Ir **paso a paso** y explicar antes de ejecutar.
- **Nunca escribir en el OneDrive real sin confirmar.**
- Los pasos interactivos (login de clasp, de GitHub, correr funciones en el editor) los hace el usuario; los
  comandos con `!` corren en bash: usar `/` en las rutas.

## Apps Script / Microsoft / Git
- Proyecto en `audienciaseluniversal@gmail.com` (scriptId en `apps_script/.clasp.json`), zona America/Bogota.
  Editor: `https://script.google.com/d/<scriptId>/edit`. Subir con `clasp push --force` (sin `--force` puede
  decir "Skipping push"; borrar un archivo local puede no reflejarse sin otro cambio de contenido).
- `ONEDRIVE_BASE` = `Fuentes_Datos/Publicidad/Ad_Networks` (producción). `ejecutarTodo` corre con un activador
  diario ~7:30 (±15 min), creado por `pasarAProduccion()` (idempotente). Primero van las fuentes rápidas;
  corta a los 4,5 min para no pasar el límite de 6.
- OneDrive vía Graph con la app de Entra ID "Ad Networks Apps Script" (inquilino único Editora del Mar; Files.ReadWrite,
  offline_access), autorizada como powerbi@eluniversal.com.co. IDs y secreto en `.env` y Propiedades del
  script (`MS_*`). **El secreto vence en noviembre de 2028**: renovarlo en Entra antes.
- AdX: GAM envía el informe a audienciaseluniversal@gmail.com; no se usa la API de GAM.
- Git: bajo `D:\workspaces\` el commit sale como Audiencias El Universal (`audienciaseluniversal@gmail.com`) y el
  push como el usuario de GitHub `audiencias-eluniversal` (config en `~/.gitconfig-trabajo`, credencial aparte
  de `nododigital`). Remoto `audiencias-eluniversal/ad_networks`, rama `main`.
- **Modo de prueba (2026-11-24):** toda `probar_*` de `Main.js` escribe siempre en `Fuentes_Datos/Publicidad/Ad_Networks/_pruebas_apps_script` (`BASE_PRUEBAS` en `OneDrive.js`), sin importar `ONEDRIVE_BASE`; solo `ejecutarTodo` escribe en producción. `probar_trm` necesita ahí una copia de `TRM\EUR\data.xlsx`.

## Pendientes
1. Confirmar con el usuario: Make desactivado, notificación de fallas del activador en "Inmediatamente", y
   `adx` funcionando en producción.
2. Power BI debe leer `Meta\DataMeta.json` y `Momagic\DataMomagic.json` (archivos nuevos).
3. Recomendado: rotar las credenciales que estuvieron en el blueprint exportado.
4. Opcional: revisión de "datos de ayer" y resumen por correo.
5. Propuesto (sin decidir): cambiar `TRM\EUR\data.xlsx` por `TRM\EUR\eur_usd.csv` (`fecha,eur_usd`, ISO, reescrito
   completo cada día); exige cambiar el origen en Power BI (configuración regional Inglés EE. UU.). Probar antes
   en una carpeta de pruebas.
