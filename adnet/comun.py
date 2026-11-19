"""Utilidades compartidas: configuración, fechas, HTTP y escritura en OneDrive."""
from __future__ import annotations

import logging
import os
import tempfile
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import requests

RAIZ_PROYECTO = Path(__file__).resolve().parent.parent
log = logging.getLogger("adnet")


def cargar_env(ruta: Path = RAIZ_PROYECTO / ".env") -> None:
    """Carga un .env simple (CLAVE=valor) sin dependencias externas."""
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        valor = valor.strip().strip('"').strip("'")
        os.environ.setdefault(clave.strip(), valor)


def env(clave: str, defecto: str | None = None) -> str:
    valor = os.environ.get(clave, defecto)
    if not valor:
        raise RuntimeError(f"Falta la variable {clave} en .env")
    return valor


@dataclass(frozen=True)
class Fechas:
    """Equivalente a las variables FechaInicial (Inicio) y FechaAyer (Ayer) de Make."""

    inicio: str  # hoy - DIAS_ATRAS (40 por defecto)
    ayer: str    # hoy - 1

    @classmethod
    def desde_hoy(cls, hoy: date | None = None) -> "Fechas":
        hoy = hoy or date.today()
        dias = int(os.environ.get("DIAS_ATRAS", "40"))
        return cls(
            inicio=(hoy - timedelta(days=dias)).isoformat(),
            ayer=(hoy - timedelta(days=1)).isoformat(),
        )


def carpeta_destino(subcarpeta: str) -> Path:
    base = Path(env("ONEDRIVE_AD_NETWORKS"))
    destino = base / subcarpeta
    destino.mkdir(parents=True, exist_ok=True)
    return destino


def guardar(subcarpeta: str, nombre: str, contenido: str | bytes) -> Path:
    """Escribe de forma atómica (temporal + replace) para que OneDrive nunca suba un archivo a medias."""
    destino = carpeta_destino(subcarpeta) / nombre
    datos = contenido.encode("utf-8") if isinstance(contenido, str) else contenido
    fd, tmp = tempfile.mkstemp(dir=destino.parent, prefix=".tmp_", suffix=destino.suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(datos)
        os.replace(tmp, destino)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    log.info("Guardado %s (%d bytes)", destino, len(datos))
    return destino


def http() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = "ad-networks-sync/1.0"
    return s


def pedir(sesion: requests.Session, metodo: str, url: str, **kw) -> requests.Response:
    kw.setdefault("timeout", 120)
    r = sesion.request(metodo, url, **kw)
    if not r.ok:
        raise RuntimeError(f"{metodo} {url} -> HTTP {r.status_code}: {r.text[:500]}")
    return r
