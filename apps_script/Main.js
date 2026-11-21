/**
 * Punto de entrada. ejecutarTodo() es la que correrá el trigger diario.
 * Las funciones probar_* sirven para correr una sola fuente desde el editor.
 * Credenciales: Configuración del proyecto → Propiedades del script (nunca en el código).
 */

function ejecutarTodo() {
  ejecutar_(Object.keys(FUENTES));
}

function ejecutar_(nombres) {
  const f = calcularFechas();
  console.log('Rango %s -> %s | fuentes: %s', f.inicio, f.ayer, nombres.join(', '));
  const fallidas = [];
  // Apps Script corta a los 6 min: no empezar una fuente nueva después de 4,5 min, para alcanzar a
  // guardar el resumen y avisar.
  const inicio = Date.now();
  for (const n of nombres) {
    if (Date.now() - inicio > 270 * 1000) {
      console.error('SIN TIEMPO: %s no se ejecutó', n);
      fallidas.push(n + ': no se ejecutó por falta de tiempo');
      continue;
    }
    try {
      (FUENTES[n] || FUENTES_INACTIVAS[n])(f);
      console.log('OK %s', n);
    } catch (e) {
      console.error('FALLÓ %s: %s', n, e && e.stack || e);
      fallidas.push(n + ': ' + (e && e.message || e));
    }
  }
  const resumen = (nombres.length - fallidas.length) + ' OK, ' + fallidas.length + ' fallidas';
  PropertiesService.getScriptProperties().setProperty('ULTIMA_EJECUCION',
    JSON.stringify({ fecha: new Date().toISOString(), resumen: resumen, fallidas: fallidas }));
  console.log('Resumen: ' + resumen);
  // Lanzar error hace que Google envíe su correo de "falla de ejecución" cuando corre por trigger.
  if (fallidas.length) throw new Error('Fuentes fallidas:\n' + fallidas.join('\n'));
}

/**
 * Paso a producción (se puede correr más de una vez sin duplicar nada):
 * apunta ONEDRIVE_BASE a la carpeta real y deja UN solo activador diario de ejecutarTodo a las ~7:30.
 */
function pasarAProduccion() {
  PropertiesService.getScriptProperties().setProperty('ONEDRIVE_BASE', 'Fuentes_Datos/Publicidad/Ad_Networks');
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'ejecutarTodo')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('ejecutarTodo').timeBased().everyDays(1).atHour(7).nearMinute(30)
    .inTimezone(TZ).create();
  console.log('ONEDRIVE_BASE = %s | activador diario de ejecutarTodo creado (~7:30 %s)',
    prop('ONEDRIVE_BASE'), TZ);
}

function probar_trm() { ejecutar_(['trm']); }
function probar_seedtag() { ejecutar_(['seedtag']); }
function probar_membrana() { ejecutar_(['membrana']); }
function probar_teads() { ejecutar_(['teads']); }
function probar_adx() { ejecutar_(['adx']); }
function probar_refinery89() { ejecutar_(['refinery89']); }
function probar_mgid() { ejecutar_(['mgid']); }
function probar_meta() { ejecutar_(['meta']); }
function probar_taboola() { ejecutar_(['taboola']); } // Taboola desactivada: solo prueba manual
