"""Autenticación con Microsoft Graph (solo para leer el correo de AdX).

Usa flujo de código de dispositivo con caché de token: se inicia sesión una vez con
`python run.py login` y luego las ejecuciones programadas renuevan el token solas.
"""
from __future__ import annotations

import msal

from .comun import RAIZ_PROYECTO, env, log

# Cliente público "Microsoft Graph Command Line Tools". Si el tenant lo bloquea,
# registra una app propia en Entra ID y pon su ID en GRAPH_CLIENT_ID.
CLIENTE_POR_DEFECTO = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
SCOPES = ["Mail.Read"]
CACHE = RAIZ_PROYECTO / ".graph_token_cache.json"


def _app() -> tuple[msal.PublicClientApplication, msal.SerializableTokenCache]:
    cache = msal.SerializableTokenCache()
    if CACHE.exists():
        cache.deserialize(CACHE.read_text(encoding="utf-8"))
    app = msal.PublicClientApplication(
        env("GRAPH_CLIENT_ID", CLIENTE_POR_DEFECTO),
        authority=f"https://login.microsoftonline.com/{env('GRAPH_TENANT', 'organizations')}",
        token_cache=cache,
    )
    return app, cache


def _guardar_cache(cache: msal.SerializableTokenCache) -> None:
    if cache.has_state_changed:
        CACHE.write_text(cache.serialize(), encoding="utf-8")


def token_graph() -> str:
    app, cache = _app()
    cuentas = app.get_accounts()
    res = app.acquire_token_silent(SCOPES, account=cuentas[0]) if cuentas else None
    _guardar_cache(cache)
    if not res or "access_token" not in res:
        raise RuntimeError("Sin sesión de Microsoft válida. Ejecuta: python run.py login")
    return res["access_token"]


def login() -> None:
    app, cache = _app()
    flujo = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flujo:
        raise RuntimeError(f"No se pudo iniciar el login: {flujo}")
    print(flujo["message"], flush=True)
    res = app.acquire_token_by_device_flow(flujo)
    _guardar_cache(cache)
    if "access_token" not in res:
        raise RuntimeError(f"Login fallido: {res.get('error_description', res)}")
    log.info("Sesión de Microsoft guardada para %s", res.get("id_token_claims", {}).get("preferred_username"))
