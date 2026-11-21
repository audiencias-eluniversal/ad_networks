/**
 * Una función por red publicitaria. Replican las rutas del escenario de Make y la versión Python
 * (adnet/fuentes.py). Cada una recibe f = { inicio, ayer } en formato YYYY-MM-DD.
 */

// --- TRM (datos.gov.co) + EUR/USD (floatrates) ----------------------------------------------------
function fuenteTrm(f) {
  const anio = f.ayer.slice(0, 4);
  const r = pedir('https://www.datos.gov.co/resource/ceyp-9c7c.json?' + qs([
    ['$where', "vigenciadesde >= '" + anio + "-01-01T00:00:00'"],
    ['$order', 'vigenciadesde'],
    ['$limit', '1000'],
  ]));
  guardar('TRM', 'TRM_diario.json', r.getContent());

  eurUsd_(f);
}

function tasaEurUsd_(fechaIso) {
  const html = pedir('https://www.floatrates.com/historical-exchange-rates.html?' + qs([
    ['operation', 'rates'], ['page', 'historical'], ['base_currency_code', 'EUR'],
    ['format_type', 'xml'], ['currency_date', fechaIso],
  ])).getContentText();
  const m = html.match(/<targetCurrency>USD<\/targetCurrency>[\s\S]*?<exchangeRate>([\d.]+)<\/exchangeRate>/);
  if (!m) throw new Error('No se encontró la tasa EUR->USD de ' + fechaIso + ' en floatrates');
  return Number(m[1]);
}

/**
 * Completa en data.xlsx los días que falten dentro de los últimos EUR_DIAS_REVISION días (10 por defecto),
 * para que una falla de un día no deje un hueco permanente.
 */
function eurUsd_(f) {
  const archivo = 'TRM/EUR/data.xlsx', hoja = 'Hoja1';
  const dias = Number(prop('EUR_DIAS_REVISION', '10'));
  const ayer = new Date(f.ayer + 'T12:00:00Z');
  const candidatas = [];
  for (let i = dias - 1; i >= 0; i--) {
    candidatas.push(Utilities.formatDate(new Date(ayer.getTime() - i * 86400000), 'UTC', 'yyyy-MM-dd'));
  }
  const { fechas, ultimaFila } = excelLeerFechas(archivo, hoja);
  const faltantes = candidatas.filter((iso) => !fechas.has(serialExcel_(iso)));
  if (!faltantes.length) {
    console.log('EUR/USD: sin días faltantes (revisados %s días hasta %s)', dias, f.ayer);
    return;
  }
  const filas = faltantes.map((iso) => [iso, tasaEurUsd_(iso)]);
  excelEscribirFilas(archivo, hoja, ultimaFila + 1, filas);
  console.log('EUR/USD agregado: %s', filas.map(([d, v]) => d + '=' + v).join(', '));
}

// --- Seedtag --------------------------------------------------------------------------------------
const SEEDTAG_PUBLISHERS = ['636abaa3971cb40007f3e068', '697283ae0f10007595e4ce89', '697284970f10007595e4cf4a'];

function fuenteSeedtag(f) {
  const tok = pedir('https://login.seedtag.com/api/token?' + qs([['api_key', prop('SEEDTAG_API_KEY')]]));
  const access = JSON.parse(tok.getContentText()).accessToken;
  const data = pedir('https://pos.api.seedtag.com/api/publisher-panel/v1/analytics/data?' + qs(
    [['startDate', f.inicio], ['endDate', f.ayer], ['pageSize', '100'], ['temporalAggregation', 'day']]
      .concat(SEEDTAG_PUBLISHERS.map((p) => ['publishers', p]))),
    { headers: { Authorization: 'Bearer ' + access } });
  guardar('Seedtag', 'DataSeedtag.json',
    '{\n  "token_response": ' + tok.getContentText().trim() + ',\n  "data_response": ' + data.getContentText().trim() + '\n}');
}

// --- Membrana -------------------------------------------------------------------------------------
function fuenteMembrana(f) {
  const opc = { headers: { AccessKey: prop('MEMBRANA_ACCESS_KEY') } };
  const p = qs([['date_from', f.inicio], ['date_to', f.ayer]]);
  const base = 'https://api.membrana.media/publisher/v1';
  const video = pedir(base + '/monetization/daily?' + p, opc);
  const adwall = pedir(base + '/adwall/daily?' + p, opc);
  guardar('Membrana', 'DataMembrana.json',
    '{\n  "video": ' + video.getContentText().trim() + ',\n  "adwall": ' + adwall.getContentText().trim() + '\n}');
}

// --- Teads ----------------------------------------------------------------------------------------
function fuenteTeads(f) {
  const rep = JSON.parse(pedir('https://api.teads.tv/v1/analytics/custom', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop('TEADS_TOKEN_REPORTE') },
    payload: JSON.stringify({
      dimensions: ['day'],
      metrics: ['income'],
      filters: { date: { start: f.inicio + 'T00:00:00+00:00', end: f.ayer + 'T23:59:59+00:00' } },
      format: 'jsonv1',
    }),
  }).getContentText());

  // Consulta el estado hasta que termine (máx. 2,5 min; normalmente tarda ~10 s) en vez de la espera fija de Make.
  const opc = { headers: { Authorization: 'Bearer ' + prop('TEADS_TOKEN_ESTADO') } };
  const limite = Date.now() + 150 * 1000;
  let estado, info;
  while (true) {
    estado = pedir('https://api.teads.tv/v1/analytics/custom/' + rep.id, opc);
    info = JSON.parse(estado.getContentText());
    if (info.status === 'finished' && info.uri) break;
    if (['failed', 'error'].indexOf(info.status) >= 0 || Date.now() > limite) {
      throw new Error('Reporte Teads no terminó: ' + estado.getContentText().slice(0, 300));
    }
    Utilities.sleep(10000);
  }
  guardar('Teads', 'DataTeads.json', pedir(info.uri).getContent());
  guardar('Teads', 'QueryTeads.json', estado.getContent());
}

// --- AdX: adjunto CSV del informe programado de GAM, recibido en el Gmail de este proyecto --------
function fuenteAdx(f) {
  const remitente = prop('ADX_REMITENTE', 'admanager-noreply@google.com');
  const asunto = prop('ADX_ASUNTO', '');
  const q = 'from:' + remitente + ' has:attachment newer_than:2d' + (asunto ? ' subject:"' + asunto + '"' : '');
  // Solo vale el correo de HOY: si aún no llega, se falla (y se avisa) en vez de reusar datos de ayer.
  const hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const mensajes = GmailApp.search(q, 0, 5)
    .reduce((acc, hilo) => acc.concat(hilo.getMessages()), [])
    .filter((m) => m.getFrom().indexOf(remitente) >= 0)
    .filter((m) => Utilities.formatDate(m.getDate(), TZ, 'yyyy-MM-dd') === hoy)
    .sort((a, b) => b.getDate() - a.getDate());
  for (const msg of mensajes) {
    const csv = msg.getAttachments().find((a) => /\.csv$/i.test(a.getName()));
    if (!csv) continue;
    console.log("AdX: correo '%s' del %s, adjunto '%s'", msg.getSubject(), msg.getDate(), csv.getName());
    guardar('AdX_OpenBidding', prop('ADX_NOMBRE_ARCHIVO', 'AdX_OpenBidding.csv'), csv.copyBlob());
    return;
  }
  throw new Error('No llegó hoy (' + hoy + ') el correo de ' + remitente + ' con adjunto CSV; ' +
    'AdX_OpenBidding.csv queda con los datos anteriores');
}

// --- Refinery89 -----------------------------------------------------------------------------------
function fuenteRefinery89(f) {
  const r = pedir('https://publisher.refinery89.com/api/report?' + qs([['start', f.inicio], ['end', f.ayer]]),
    { headers: { 'x-api-key': prop('REFINERY89_API_KEY') } });
  guardar('Refinery89', 'Refinery89_Data.csv', r.getContent());
}

// --- MGID -----------------------------------------------------------------------------------------
function fuenteMgid(f) {
  const r = pedir('https://api.mgid.com/v2/pub/account/' + prop('MGID_CLIENT_ID') + '/website-custom-report?' + qs([
    ['dimensions', 'date,website'],
    ['metrics', 'pageViews,revenue'],
    ['limit', '500'], // 1 sitio x 40 días = 40 filas; 500 deja margen
    ['startDate', f.inicio],
    ['endDate', f.ayer],
    ['dateInterval', 'interval'],
    ['orders[date]', 'desc'],
  ]), { headers: { Authorization: 'Bearer ' + prop('MGID_TOKEN') } });
  guardar('MGID', 'DataMgid.json', r.getContent());
}

// --- Meta: ingresos de monetización de una Página de Facebook (Graph API oficial) -----------------
const META_API = 'https://graph.facebook.com/v23.0';

function metaInsights_(pagina, token, f, extra) {
  // 'until' es exclusivo en la API: se suma un día para incluir el último (ayer).
  const hasta = Utilities.formatDate(new Date(new Date(f.ayer + 'T12:00:00Z').getTime() + 86400000), 'UTC', 'yyyy-MM-dd');
  const pares = [['metric', 'monetization_approximate_earnings'], ['period', 'day'],
    ['since', f.inicio], ['until', hasta], ['access_token', token]].concat(extra || []);
  const r = UrlFetchApp.fetch(META_API + '/' + pagina + '/insights?' + qs(pares), { muteHttpExceptions: true });
  const j = JSON.parse(r.getContentText());
  if (j.error) {
    throw new Error('Meta insights ' + (extra && extra.length ? extra.map((e) => e.join('=')).join(',') : 'total') +
      ': ' + j.error.message + ' (code ' + j.error.code + ')');
  }
  return j.data;
}

function metaDiario_(valores, clave) {
  return valores.map((v) => {
    // start_time (si viene) es el inicio del día; si no, end_time es el día siguiente.
    const d = v.start_time ? v.start_time.slice(0, 10)
      : Utilities.formatDate(new Date(new Date(v.end_time.slice(0, 10) + 'T12:00:00Z').getTime() - 86400000), 'UTC', 'yyyy-MM-dd');
    const o = { date: d, value: v.value };
    if (clave) o[clave] = v[clave];
    return o;
  });
}

function fuenteMeta(f) {
  const pagina = prop('META_PAGE_ID', '127926969701');
  const token = prop('META_PAGE_TOKEN');
  const suma = (pts) => Math.round(pts.reduce((a, p) => a + p.value, 0) * 100) / 100;

  const total = metaDiario_(metaInsights_(pagina, token, f)[0].values);
  const porHerramienta = {};
  const datos = metaInsights_(pagina, token, f, [['breakdown', 'monetization_tool']]);
  metaDiario_(datos[0].values, 'monetization_tool').forEach((p) => {
    (porHerramienta[p.monetization_tool] = porHerramienta[p.monetization_tool] || []).push({ date: p.date, value: p.value });
  });

  // Si algo falló ya se lanzó el error arriba: no se escribe nada y el archivo anterior queda intacto.
  const earningsByTool = {};
  Object.keys(porHerramienta).forEach((t) => { earningsByTool[t] = { total: suma(porHerramienta[t]), daily: porHerramienta[t] }; });
  const resultado = {
    page_id: pagina, start: f.inicio, end: f.ayer, currency: 'USD',
    fetched_at: new Date().toISOString(),
    metrics: { total_earnings: { total: suma(total), daily: total }, earnings_by_tool: earningsByTool },
    errors: {},
  };
  guardar('Meta', 'DataMeta.json', JSON.stringify(resultado, null, 2));
}

// --- Momagic (dsp-ssps.momagic.com): login por formulario + cookie 'id' ----------------------------
const MOMAGIC_URL = 'https://dsp-ssps.momagic.com';
const MOMAGIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

function fuenteMomagic(f) {
  // 1. Login: responde 303 con la cookie 'id'. UrlFetchApp no tiene cookie jar: no se sigue la
  //    redirección y se leen los Set-Cookie de la respuesta.
  const login = UrlFetchApp.fetch(MOMAGIC_URL + '/authenticate/userpass', {
    method: 'post',
    payload: { username: prop('MOMAGIC_USER'), password: prop('MOMAGIC_PASS') },
    followRedirects: false,
    muteHttpExceptions: true,
    headers: { origin: MOMAGIC_URL, referer: MOMAGIC_URL + '/login', 'user-agent': MOMAGIC_UA },
  });
  const code = login.getResponseCode();
  if (code >= 400) throw new Error('Momagic login -> HTTP ' + code + ': ' + login.getContentText().slice(0, 300));
  const sc = login.getAllHeaders()['Set-Cookie'];
  const cookies = (Array.isArray(sc) ? sc : (sc ? [sc] : [])).map((c) => c.split(';')[0].trim());
  if (!cookies.some((c) => c.indexOf('id=') === 0)) {
    throw new Error("Momagic: el login (HTTP " + code + ") no devolvió la cookie 'id' (¿credenciales?)");
  }

  // 2. Estadísticas por día (date_as_dimension): 40 días = 40 filas; pagesize 100 deja margen.
  const r = pedir(MOMAGIC_URL + '/reporting/gamreportData/report/stats', {
    method: 'post',
    headers: {
      authorization: 'Basic ' + prop('MOMAGIC_BASIC_AUTH'),
      cookie: cookies.join('; '),
      origin: MOMAGIC_URL, referer: MOMAGIC_URL + '/', 'user-agent': MOMAGIC_UA,
      accept: 'application/json, text/plain, */*',
    },
    payload: {
      pagesize: '100', startindex: '1', language: '0', currency: '2',
      sdate: f.inicio, edate: f.ayer,
      domain: '["all"]', adunit: '["none"]',
      impression: 'true', click: 'true', ctr: 'true', revenue: 'true',
      ecpm: 'true', date_as_dimension: 'true', roundoffmetric: 'true',
    },
  });
  const j = JSON.parse(r.getContentText());
  const filas = (j.stats && j.stats.data) || [];
  if (!filas.length) throw new Error('Momagic: la respuesta no trae filas en stats.data: ' + r.getContentText().slice(0, 300));
  guardar('Momagic', 'DataMomagic.json', JSON.stringify(filas, null, 2));
}

// --- Taboola (DESACTIVADA: ya no está con nosotros por ahora) -------------------------------------
// No corre en ejecutarTodo(). Se conserva para probar_taboola() y para reactivarla: moverla de
// FUENTES_INACTIVAS a FUENTES.
function fuenteTaboola(f) {
  const tok = pedir('https://backstage.taboola.com/backstage/oauth/token', {
    method: 'post',
    payload: {
      client_id: prop('TABOOLA_CLIENT_ID'),
      client_secret: prop('TABOOLA_CLIENT_SECRET'),
      grant_type: 'client_credentials',
    },
  });
  const cuenta = prop('TABOOLA_CUENTA', 'gnm-eluniversal');
  const data = pedir('https://backstage.taboola.com/backstage/api/1.0/' + cuenta +
    '/reports/revenue-summary/dimensions/day?' + qs([['start_date', f.inicio], ['end_date', f.ayer]]),
    { headers: { Authorization: 'Bearer ' + JSON.parse(tok.getContentText()).access_token } });
  guardar('Taboola', 'DataTaboola.json',
    '{\n  "token_response": ' + tok.getContentText().trim() + ',\n  "data_response": ' + data.getContentText().trim() + '\n}');
}

// Orden de ejecución: primero las rápidas; al final las que pueden tardar (Teads espera su reporte,
// Membrana puede quedarse esperando si su API no responde).
const FUENTES = {
  trm: fuenteTrm,
  seedtag: fuenteSeedtag,
  adx: fuenteAdx,
  refinery89: fuenteRefinery89,
  mgid: fuenteMgid,
  meta: fuenteMeta,
  momagic: fuenteMomagic,
  // taboola: fuenteTaboola,  // desactivada
  teads: fuenteTeads,
  membrana: fuenteMembrana,
};

// Fuentes que no corren a diario pero se pueden probar a mano con su función probar_*.
const FUENTES_INACTIVAS = {
  taboola: fuenteTaboola,
};
