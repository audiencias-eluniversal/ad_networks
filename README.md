# Ad Networks – descarga diaria a OneDrive

Reemplazo en Python del escenario de Make **Ad_Networks**. Descarga los reportes de cada red publicitaria
y los guarda en la carpeta sincronizada de OneDrive (`ONEDRIVE_AD_NETWORKS`), con los mismos nombres
y formatos que generaba Make (Power BI no necesita cambios).

| Fuente | Archivo(s) en `Ad_Networks\` |
|---|---|
| `trm` | `TRM\TRM_diario.json` y una fila nueva en `TRM\EUR\data.xlsx` (EUR→USD) |
| `seedtag` | `Seedtag\DataSeedtag.json` |
| `membrana` | `Membrana\DataMembrana.json` |
| `teads` | `Teads\DataTeads.json`, `Teads\QueryTeads.json` |
| `adx` | `AdX_OpenBidding\<adjunto> (inicio - ayer).csv` |
| `adkaora` | `AdKaora\<nombre del adjunto>` (el del último correo de fernando.davila@adkaora.com) |
| `refinery89` | `Refinery89\Refinery89_Data.csv` |
| `mgid` | `MGID\DataMgid.json` |
| ~~`taboola`~~ | ~~`Taboola\DataTaboola.json`~~ (desactivada, código comentado) |

Rango de fechas: de hoy − `DIAS_ATRAS` (40) hasta ayer.

## Uso

```powershell
pip install -r requirements.txt
python run.py login              # una vez: sesión de Microsoft para leer el correo de AdX
python run.py                    # todas las fuentes
python run.py teads mgid         # solo algunas
python run.py --hoy 2026-11-01   # simular otra fecha
```

Logs: `logs\AAAA-MM.log`. El proceso termina con código 1 si alguna fuente falla (las demás siguen).

## Programación diaria

```powershell
powershell -ExecutionPolicy Bypass -File programar_tarea.ps1 -Hora 07:30
```

Antes, desactiva el escenario en Make para que no escriban los dos a la vez.

## Credenciales

Todo está en `.env` (ver `.env.example`). `make_blueprint.json` también contiene secretos en texto plano:
no lo compartas.

## Versión Apps Script

En `apps_script/` (se sube con `clasp push --force`). Las funciones `probar_<fuente>` corren una sola fuente
y escriben siempre en `_pruebas_apps_script`; `ejecutarTodo` escribe en `ONEDRIVE_BASE`.

## Agregar una red nueva

Escribe una función `nueva_red(f: Fechas)` en `adnet/fuentes.py` que use `pedir()` y `guardar()`,
y regístrala en el diccionario `FUENTES`.
