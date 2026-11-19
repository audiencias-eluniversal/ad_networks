/**
 * Acceso a OneDrive (Microsoft Graph) con la app "Ad Networks Apps Script" de Entra ID.
 *
 * Autorización (una sola vez): ejecutar autorizarMicrosoft() en el editor, abrir el enlace del registro
 * de ejecución e iniciar sesión con la cuenta de Editora del Mar. El refresh token queda en las
 * propiedades del script y se renueva en cada ejecución.
 */

const MS_SCOPES = 'offline_access Files.ReadWrite User.Read';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function msRedirectUri_() {
  return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}

function msTokenUrl_() {
  return 'https://login.microsoftonline.com/' + prop('MS_TENANT_ID') + '/oauth2/v2.0/token';
}

/** Paso único: genera el enlace de inicio de sesión de Microsoft. */
function autorizarMicrosoft() {
  const state = ScriptApp.newStateToken().withMethod('msCallback').withTimeout(900).createToken();
  const url = 'https://login.microsoftonline.com/' + prop('MS_TENANT_ID') + '/oauth2/v2.0/authorize?' + qs([
    ['client_id', prop('MS_CLIENT_ID')],
    ['response_type', 'code'],
    ['redirect_uri', msRedirectUri_()],
    ['response_mode', 'query'],
    ['scope', MS_SCOPES],
    ['prompt', 'select_account'],
    ['state', state],
  ]);
  console.log('Abre este enlace e inicia sesión con tu cuenta de Editora del Mar:\n' + url);
}

/** Microsoft redirige aquí después del login. */
function msCallback(e) {
  if (e.parameter.error) {
    return HtmlService.createHtmlOutput('<h3>Error</h3><p>' + e.parameter.error_description + '</p>');
  }
  const tok = msPedirToken_({
    grant_type: 'authorization_code',
    code: e.parameter.code,
    redirect_uri: msRedirectUri_(),
  });
  const yo = JSON.parse(pedir(GRAPH + '/me', { headers: { Authorization: 'Bearer ' + tok } }).getContentText());
  return HtmlService.createHtmlOutput(
    '<h3>Listo</h3><p>OneDrive autorizado para <b>' + yo.userPrincipalName + '</b>. Ya puedes cerrar esta pestaña.</p>');
}

function msPedirToken_(extra) {
  const r = UrlFetchApp.fetch(msTokenUrl_(), {
    method: 'post',
    muteHttpExceptions: true,
    payload: Object.assign({
      client_id: prop('MS_CLIENT_ID'),
      client_secret: prop('MS_CLIENT_SECRET'),
      scope: MS_SCOPES,
    }, extra),
  });
  const j = JSON.parse(r.getContentText());
  if (!j.access_token) {
    throw new Error('Microsoft no entregó token (' + (j.error || r.getResponseCode()) + '): ' +
      String(j.error_description || '').split('\n')[0] + ' — si persiste, ejecuta autorizarMicrosoft()');
  }
  // Microsoft rota el refresh token: guardar siempre el último.
  if (j.refresh_token) PropertiesService.getScriptProperties().setProperty('MS_REFRESH_TOKEN', j.refresh_token);
  CacheService.getScriptCache().put('MS_ACCESS_TOKEN', j.access_token, Math.max(60, Number(j.expires_in) - 300));
  return j.access_token;
}

function msToken_() {
  const cache = CacheService.getScriptCache().get('MS_ACCESS_TOKEN');
  if (cache) return cache;
  const refresh = PropertiesService.getScriptProperties().getProperty('MS_REFRESH_TOKEN');
  if (!refresh) throw new Error('OneDrive no autorizado: ejecuta autorizarMicrosoft()');
  return msPedirToken_({ grant_type: 'refresh_token', refresh_token: refresh });
}

function graph_(metodo, ruta, opciones) {
  opciones = opciones || {};
  return pedir(GRAPH + ruta, Object.assign({}, opciones, {
    method: metodo,
    headers: Object.assign({ Authorization: 'Bearer ' + msToken_() }, opciones.headers || {}),
  }));
}

/** Ruta de Graph para un archivo dentro de ONEDRIVE_BASE (p. ej. "Fuentes_Datos/Publicidad/Ad_Networks"). */
function rutaItem_(subruta) {
  const partes = (prop('ONEDRIVE_BASE') + '/' + subruta).split('/').filter(String).map(encodeURIComponent);
  return '/me/drive/root:/' + partes.join('/') + ':';
}

/**
 * Sube (reemplaza) un archivo en OneDrive. `contenido`: string, bytes o Blob.
 * Las carpetas intermedias se crean solas.
 */
function guardar(subcarpeta, nombre, contenido) {
  const bytes = typeof contenido === 'string'
    ? Utilities.newBlob(contenido).getBytes()
    : (contenido.getBytes ? contenido.getBytes() : contenido);
  if (bytes.length > 4 * 1024 * 1024) throw new Error(nombre + ' supera 4 MB: requiere sesión de carga');
  graph_('put', rutaItem_(subcarpeta + '/' + nombre) + '/content', {
    contentType: 'application/octet-stream',
    payload: bytes,
  });
  console.log('Guardado %s/%s (%s bytes)', subcarpeta, nombre, bytes.length);
}

/** Número de serie de Excel para una fecha 'YYYY-MM-DD'. */
function serialExcel_(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

function rutaHoja_(subruta, hoja) {
  return rutaItem_(subruta) + '/workbook/worksheets/' + encodeURIComponent(hoja);
}

/** Lee la columna A de una hoja: devuelve { fechas: Set de seriales Excel, ultimaFila }. */
function excelLeerFechas(subruta, hoja) {
  const usado = JSON.parse(graph_('get', rutaHoja_(subruta, hoja) + '/usedRange(valuesOnly=true)').getContentText());
  return {
    fechas: new Set(usado.values.map((fila) => fila[0])),
    ultimaFila: Number(String(usado.address).match(/(\d+)$/)[1]),
  };
}

/** Escribe filas [[fechaIso, valor], ...] a partir de `desdeFila` (fecha con formato mm-dd-yy). */
function excelEscribirFilas(subruta, hoja, desdeFila, filas) {
  if (!filas.length) return;
  const dir = 'A' + desdeFila + ':B' + (desdeFila + filas.length - 1);
  graph_('patch', rutaHoja_(subruta, hoja) + "/range(address='" + dir + "')", {
    contentType: 'application/json',
    payload: JSON.stringify({
      values: filas.map(([iso, v]) => [serialExcel_(iso), v]),
      numberFormat: filas.map(() => ['mm-dd-yy', 'General']),
    }),
  });
}
