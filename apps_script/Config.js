/**
 * Configuración y fechas.
 * Las credenciales viven en Propiedades del script (Configuración del proyecto → Propiedades del script).
 */

const TZ = 'America/Bogota';

/** Lee una propiedad del script; si falta y no hay valor por defecto, lanza error. */
function prop(clave, defecto) {
  const v = PropertiesService.getScriptProperties().getProperty(clave);
  if (v !== null && v !== '') return v;
  if (defecto !== undefined) return defecto;
  throw new Error('Falta la propiedad del script ' + clave);
}

/** Equivalente a FechaInicial (Inicio) y FechaAyer (Ayer) del escenario de Make. */
function calcularFechas(hoy) {
  hoy = hoy || new Date();
  const dias = Number(prop('DIAS_ATRAS', '40'));
  const fmt = (d) => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  const menos = (n) => new Date(hoy.getTime() - n * 86400000);
  return { inicio: fmt(menos(dias)), ayer: fmt(menos(1)) };
}

/** Arma una query string a partir de pares [clave, valor] (permite claves repetidas). */
function qs(pares) {
  return pares.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

/** UrlFetch con manejo de errores HTTP uniforme. */
function pedir(url, opciones) {
  const r = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opciones || {}));
  const code = r.getResponseCode();
  if (code < 200 || code >= 300) {
    const metodo = ((opciones && opciones.method) || 'get').toUpperCase();
    throw new Error(metodo + ' ' + url.split('?')[0] + ' -> HTTP ' + code + ': ' + r.getContentText().slice(0, 500));
  }
  return r;
}
