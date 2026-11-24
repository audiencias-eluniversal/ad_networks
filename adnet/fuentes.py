"""Una función por red publicitaria. Cada una replica una ruta del router del escenario de Make."""
from __future__ import annotations

import base64
import os
import time
from datetime import date, datetime

from .comun import Fechas, env, guardar, http, log, pedir


# --- Ruta 1: TRM (datos.gov.co) + EUR/USD (floatrates) -----------------------------------------
def trm(f: Fechas) -> None:
    s = http()
    # Make usaba $offset=8182 fijo (se desfasa con el tiempo). Aquí se filtra por año en curso,
    # que es lo que ese offset devolvía.
    anio = date.fromisoformat(f.ayer).year
    r = pedir(s, "GET", "https://www.datos.gov.co/resource/ceyp-9c7c.json", params={
        "$where": f"vigenciadesde >= '{anio}-01-01T00:00:00'",
        "$order": "vigenciadesde",
        "$limit": "1000",
    })
    guardar("TRM", "TRM_diario.json", r.content)

    eur_usd(f)


def eur_usd(f: Fechas) -> None:
    import re

    import openpyxl

    s = http()
    r = pedir(s, "GET", "https://www.floatrates.com/historical-exchange-rates.html", params={
        "operation": "rates", "page": "historical", "base_currency_code": "EUR",
        "format_type": "xml", "currency_date": f.ayer,
    })
    m = re.search(r"<targetCurrency>USD</targetCurrency>.*?<exchangeRate>([\d.]+)</exchangeRate>",
                  r.text, re.S)
    if not m:
        raise RuntimeError("No se encontró la tasa EUR->USD en la respuesta de floatrates")
    tasa = float(m.group(1))

    from .comun import carpeta_destino
    ruta = carpeta_destino(r"TRM\EUR") / "data.xlsx"
    wb = openpyxl.load_workbook(ruta)
    ws = wb["Hoja1"]
    dia = datetime.fromisoformat(f.ayer)
    existentes = {c.value for c in ws["A"][1:]}
    if dia in existentes:
        log.info("EUR/USD %s ya existe en data.xlsx; no se duplica", f.ayer)
        return
    ws.append([dia, tasa])
    ws.cell(row=ws.max_row, column=1).number_format = "mm-dd-yy"
    try:
        wb.save(ruta)
    except PermissionError:
        raise RuntimeError(f"No se pudo escribir {ruta}: ¿está abierto en Excel?")
    log.info("EUR/USD %s = %s agregado a %s", f.ayer, tasa, ruta)


# --- Ruta 2: Seedtag ------------------------------------------------------------------------------
SEEDTAG_PUBLISHERS = ["636abaa3971cb40007f3e068", "697283ae0f10007595e4ce89", "697284970f10007595e4cf4a"]


def seedtag(f: Fechas) -> None:
    s = http()
    tok = pedir(s, "GET", "https://login.seedtag.com/api/token",
                params={"api_key": env("SEEDTAG_API_KEY")})
    access = tok.json()["accessToken"]
    params = [("startDate", f.inicio), ("endDate", f.ayer), ("pageSize", "100"),
              ("temporalAggregation", "day")] + [("publishers", p) for p in SEEDTAG_PUBLISHERS]
    data = pedir(s, "GET", "https://pos.api.seedtag.com/api/publisher-panel/v1/analytics/data",
                 headers={"Authorization": f"Bearer {access}"}, params=params)
    guardar("Seedtag", "DataSeedtag.json",
            f'{{\n  "token_response": {tok.text.strip()},\n  "data_response": {data.text.strip()}\n}}')


# --- Ruta 3: Membrana -----------------------------------------------------------------------------
def membrana(f: Fechas) -> None:
    s = http()
    h = {"AccessKey": env("MEMBRANA_ACCESS_KEY")}
    p = {"date_from": f.inicio, "date_to": f.ayer}
    base = "https://api.membrana.media/publisher/v1"
    video = pedir(s, "GET", f"{base}/monetization/daily", headers=h, params=p)
    adwall = pedir(s, "GET", f"{base}/adwall/daily", headers=h, params=p)
    guardar("Membrana", "DataMembrana.json",
            f'{{\n  "video": {video.text.strip()},\n  "adwall": {adwall.text.strip()}\n}}')


# --- Ruta 4: Teads --------------------------------------------------------------------------------
def teads(f: Fechas) -> None:
    s = http()
    cuerpo = {
        "dimensions": ["day"],
        "metrics": ["income"],
        "filters": {"date": {"start": f"{f.inicio}T00:00:00+00:00", "end": f"{f.ayer}T23:59:59+00:00"}},
        "format": "jsonv1",
    }
    rep = pedir(s, "POST", "https://api.teads.tv/v1/analytics/custom",
                headers={"Authorization": f"Bearer {env('TEADS_TOKEN_REPORTE')}"}, json=cuerpo).json()

    # Make esperaba 60 s fijos; aquí se consulta el estado hasta que termine (máx. 5 min).
    url_estado = f"https://api.teads.tv/v1/analytics/custom/{rep['id']}"
    h = {"Authorization": f"Bearer {env('TEADS_TOKEN_ESTADO')}"}
    limite = time.monotonic() + 300
    while True:
        estado = pedir(s, "GET", url_estado, headers=h)
        info = estado.json()
        if info.get("status") == "finished" and info.get("uri"):
            break
        if info.get("status") in ("failed", "error") or time.monotonic() > limite:
            raise RuntimeError(f"Reporte Teads no terminó: {estado.text[:300]}")
        time.sleep(10)

    archivo = pedir(s, "GET", info["uri"])
    guardar("Teads", "DataTeads.json", archivo.content)
    guardar("Teads", "QueryTeads.json", estado.content)


# --- Ruta 5: AdX (adjunto del correo de Google Ad Manager) ----------------------------------------
def adx(f: Fechas) -> None:
    from .graph import token_graph

    s = http()
    s.headers["Authorization"] = f"Bearer {token_graph()}"
    carpeta = env("ADX_CARPETA_CORREO_ID")
    remitente = env("ADX_REMITENTE", "admanager-noreply@google.com")
    desde = f"{f.inicio}T00:00:00Z"
    msgs = pedir(s, "GET", f"https://graph.microsoft.com/v1.0/me/mailFolders/{carpeta}/messages", params={
        "$filter": f"receivedDateTime ge {desde} and from/emailAddress/address eq '{remitente}'",
        "$orderby": "receivedDateTime desc",
        "$top": "1",
        "$select": "id,subject,receivedDateTime",
    }).json()["value"]
    if not msgs:
        raise RuntimeError(f"No hay correos de {remitente} en la carpeta configurada")
    msg = msgs[0]
    log.info("AdX: correo '%s' recibido %s", msg["subject"], msg["receivedDateTime"])

    adjuntos = pedir(s, "GET", f"https://graph.microsoft.com/v1.0/me/messages/{msg['id']}/attachments").json()["value"]
    adj = next((a for a in adjuntos if a.get("@odata.type") == "#microsoft.graph.fileAttachment"), None)
    if not adj:
        raise RuntimeError("El correo de AdX no tiene adjuntos")
    # Nombre fijo: cada día se reemplaza el mismo archivo en vez de acumular un CSV por día.
    nombre = env("ADX_NOMBRE_ARCHIVO", "AdX_OpenBidding.csv")
    log.info("AdX: adjunto '%s' -> %s", adj["name"], nombre)
    guardar("AdX_OpenBidding", nombre, base64.b64decode(adj["contentBytes"]))


# --- AdKaora (adjunto del último correo; se guarda con el nombre que trae el adjunto) --------------
def adkaora(f: Fechas) -> None:
    from datetime import timedelta

    from .graph import token_graph

    s = http()
    s.headers["Authorization"] = f"Bearer {token_graph()}"
    remitente = env("ADKAORA_REMITENTE", "fernando.davila@adkaora.com")
    carpeta = env("ADKAORA_CARPETA_CORREO_ID", "inbox")
    dias = int(os.environ.get("ADKAORA_DIAS", "2"))
    desde = (datetime.utcnow() - timedelta(days=dias)).strftime("%Y-%m-%dT%H:%M:%SZ")
    msgs = pedir(s, "GET", f"https://graph.microsoft.com/v1.0/me/mailFolders/{carpeta}/messages", params={
        "$filter": f"receivedDateTime ge {desde} and from/emailAddress/address eq '{remitente}'",
        "$orderby": "receivedDateTime desc",
        "$top": "10",
        "$select": "id,subject,receivedDateTime,hasAttachments",
    }).json()["value"]
    for msg in msgs:
        if not msg.get("hasAttachments"):
            continue
        adjuntos = pedir(s, "GET", f"https://graph.microsoft.com/v1.0/me/messages/{msg['id']}/attachments").json()["value"]
        adj = next((a for a in adjuntos
                    if a.get("@odata.type") == "#microsoft.graph.fileAttachment" and not a.get("isInline")), None)
        if not adj:
            continue
        log.info("AdKaora: correo '%s' recibido %s, adjunto '%s'", msg["subject"], msg["receivedDateTime"], adj["name"])
        guardar("AdKaora", adj["name"], base64.b64decode(adj["contentBytes"]))
        return
    raise RuntimeError(f"No hay correo de {remitente} con adjunto en los últimos {dias} días")


# --- Ruta 6: Refinery89 ---------------------------------------------------------------------------
def refinery89(f: Fechas) -> None:
    r = pedir(http(), "GET", "https://publisher.refinery89.com/api/report",
              headers={"x-api-key": env("REFINERY89_API_KEY")}, params={"start": f.inicio, "end": f.ayer})
    guardar("Refinery89", "Refinery89_Data.csv", r.content)


# --- Ruta 7: Taboola (DESACTIVADA: Taboola ya no está con nosotros por ahora) ----------------------
# Para reactivarla: descomentar esta función y su línea en FUENTES.
# def taboola(f: Fechas) -> None:
#     s = http()
#     tok = pedir(s, "POST", "https://backstage.taboola.com/backstage/oauth/token", data={
#         "client_id": env("TABOOLA_CLIENT_ID"),
#         "client_secret": env("TABOOLA_CLIENT_SECRET"),
#         "grant_type": "client_credentials",
#     })
#     cuenta = env("TABOOLA_CUENTA", "gnm-eluniversal")
#     data = pedir(s, "GET",
#                  f"https://backstage.taboola.com/backstage/api/1.0/{cuenta}/reports/revenue-summary/dimensions/day",
#                  headers={"Authorization": f"Bearer {tok.json()['access_token']}"},
#                  params={"start_date": f.inicio, "end_date": f.ayer})
#     guardar("Taboola", "DataTaboola.json",
#             f'{{\n  "token_response": {tok.text.strip()},\n  "data_response": {data.text.strip()}\n}}')


# --- Ruta 8: MGID ---------------------------------------------------------------------------------
def mgid(f: Fechas) -> None:
    cliente = env("MGID_CLIENT_ID")
    r = pedir(http(), "GET", f"https://api.mgid.com/v2/pub/account/{cliente}/website-custom-report",
              headers={"Authorization": f"Bearer {env('MGID_TOKEN')}"},
              params={
                  "dimensions": "date,website",
                  "metrics": "pageViews,revenue",
                  # 1 sitio x 40 días = 40 filas; 500 deja margen si se agregan sitios.
                  "limit": "500",
                  "startDate": f.inicio,
                  "endDate": f.ayer,
                  "dateInterval": "interval",
                  "orders[date]": "desc",
              })
    guardar("MGID", "DataMgid.json", r.content)


FUENTES = {
    "trm": trm,
    "seedtag": seedtag,
    "membrana": membrana,
    "teads": teads,
    "adx": adx,
    "adkaora": adkaora,
    "refinery89": refinery89,
    # "taboola": taboola,  # desactivada
    "mgid": mgid,
}
