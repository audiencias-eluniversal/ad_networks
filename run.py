"""Descarga los reportes de las redes publicitarias y los guarda en OneDrive.

Uso:
    python run.py                  # todas las fuentes
    python run.py teads mgid       # solo algunas
    python run.py --listar
    python run.py login            # iniciar sesión de Microsoft (para AdX), una sola vez
"""
from __future__ import annotations

import argparse
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from adnet.comun import RAIZ_PROYECTO, Fechas, cargar_env, log
from adnet.fuentes import FUENTES


def configurar_logs() -> None:
    carpeta = RAIZ_PROYECTO / "logs"
    carpeta.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s [%(threadName)s] %(message)s")
    archivo = logging.FileHandler(carpeta / f"{date.today():%Y-%m}.log", encoding="utf-8")
    consola = logging.StreamHandler(sys.stdout)
    for h in (archivo, consola):
        h.setFormatter(fmt)
    log.setLevel(logging.INFO)
    log.addHandler(archivo)
    log.addHandler(consola)


def ejecutar(nombre: str, fechas: Fechas) -> bool:
    try:
        log.info("Inicio %s", nombre)
        FUENTES[nombre](fechas)
        log.info("OK %s", nombre)
        return True
    except Exception:
        log.exception("FALLÓ %s", nombre)
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fuentes", nargs="*", help=f"login o cualquiera de: {', '.join(FUENTES)}")
    ap.add_argument("--listar", action="store_true", help="muestra las fuentes disponibles")
    ap.add_argument("--hoy", help="simula otra fecha de ejecución (YYYY-MM-DD)")
    args = ap.parse_args()

    cargar_env()
    configurar_logs()

    if args.listar:
        print("\n".join(FUENTES))
        return 0
    if args.fuentes == ["login"]:
        from adnet.graph import login
        login()
        return 0

    desconocidas = [f for f in args.fuentes if f not in FUENTES]
    if desconocidas:
        ap.error(f"fuentes desconocidas: {desconocidas}")
    seleccion = args.fuentes or list(FUENTES)

    fechas = Fechas.desde_hoy(date.fromisoformat(args.hoy) if args.hoy else None)
    log.info("Rango %s -> %s | fuentes: %s", fechas.inicio, fechas.ayer, ", ".join(seleccion))

    # En paralelo, como las rutas del router de Make; una falla no detiene a las demás.
    with ThreadPoolExecutor(max_workers=len(seleccion)) as pool:
        resultados = dict(zip(seleccion, pool.map(lambda n: ejecutar(n, fechas), seleccion)))

    fallidas = [n for n, ok in resultados.items() if not ok]
    log.info("Resumen: %d OK, %d fallidas %s", len(seleccion) - len(fallidas), len(fallidas), fallidas or "")
    return 1 if fallidas else 0


if __name__ == "__main__":
    sys.exit(main())
