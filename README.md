# Ad Networks – descarga diaria a OneDrive

Reemplazo del escenario de Make **Ad_Networks**. Descarga los reportes de cada red publicitaria y los guarda
en OneDrive (`Fuentes_Datos/Publicidad/Ad_Networks`), con los mismos nombres y formatos que generaba Make
(Power BI no necesita cambios).

**Producción: Google Apps Script** (`apps_script/`), con un activador diario hacia las 7:30 (hora de Bogotá).
La versión en **Python** (`adnet/`, `run.py`) es la referencia y sirve para probar fuentes en local.

| Fuente | Archivo(s) en `Ad_Networks\` |
|---|---|
| `trm` | `TRM\TRM_diario.json` y filas nuevas en `TRM\EUR\data.xlsx` (EUR→USD) |
| `seedtag` | `Seedtag\DataSeedtag.json` |
| `membrana` | `Membrana\DataMembrana.json` |
| `teads` | `Teads\DataTeads.json`, `Teads\QueryTeads.json` |
| `adx` | `AdX_OpenBidding\AdX_OpenBidding.csv` |
| `adkaora` | `AdKaora\<nombre del adjunto>` (el del último correo de fernando.davila@adkaora.com) |
| `refinery89` | `Refinery89\Refinery89_Data.csv` |
| `mgid` | `MGID\DataMgid.json` |
| `meta` | `Meta\DataMeta.json` |
| `momagic` | `Momagic\DataMomagic.json` |
| ~~`taboola`~~ | desactivada |

Rango de fechas: de hoy − 40 días hasta ayer. Si una fuente falla, no se escribe nada y la ejecución
termina con error (en Apps Script, Google envía el aviso por correo).

## Uso

**Apps Script** (producción): el activador corre `ejecutarTodo` solo. Para probar una fuente, ejecuta
`probar_<fuente>` desde el editor (escribe en la carpeta de pruebas `_pruebas_apps_script`, nunca en la real). Para subir cambios:

```powershell
cd apps_script
clasp push --force
```

**Python** (pruebas):

```powershell
pip install -r requirements.txt
python run.py                    # todas las fuentes
python run.py meta momagic       # solo algunas
python run.py --hoy 2026-11-01   # simular otra fecha
```

Logs en `logs\AAAA-MM.log`. Para probar, apunta `ONEDRIVE_AD_NETWORKS` a una carpeta de pruebas.

## Credenciales

- Python: `.env` (ver `.env.example`).
- Apps Script: *Configuración del proyecto → Propiedades del script*.

`make_blueprint.json` contiene secretos en texto plano: no lo compartas.

## Agregar una red nueva

Escribe una función `nueva_red(f: Fechas)` en `adnet/fuentes.py` y regístrala en `FUENTES`; haz lo mismo
en `apps_script/Fuentes.js` (más un `probar_nueva_red()` en `Main.js`). Crea las credenciales en las
Propiedades del script antes de subir el código.
