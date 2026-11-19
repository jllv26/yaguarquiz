/**
 * YaguarQuiz UAP — Conexión con Google Sheets
 * ------------------------------------------------------------------
 * Este script vive DENTRO de su hoja de Google (Extensiones > Apps Script).
 * Recibe los resultados de cada sesión y crea o actualiza 4 hojas:
 *   - Resumen_Sesiones     (una fila por sesión)
 *   - Notas_SIGLA_PARALELO (libreta: una fila por estudiante, una columna por evaluación)
 *   - Detalle_Respuestas   (una fila por respuesta)
 *   - Analisis_Preguntas   (% de acierto por pregunta)
 * Reenviar la misma sesión NO duplica filas: se usa el identificador de la sesión como clave.
 *
 * Además envía CORREOS a los estudiantes desde su Gmail (aviso de cada tarea y la nota de cada
 * actividad): cada 5 minutos pregunta a YaguarQuiz qué hay pendiente y manda un correo por estudiante.
 * Gmail gratuito permite unos 100 correos al día; lo que no alcanza sale al día siguiente.
 *
 * INSTALACIÓN (una sola vez):
 *   1. En YaguarQuiz > Configuración > Google Sheets, presione "Generar token" y cópielo.
 *   2. Pegue el token abajo, entre las comillas de TOKEN.
 *   3. Implementar > Nueva implementación > Tipo: Aplicación web
 *        Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
 *   4. Autorice los permisos y copie la "URL de la aplicación web" en YaguarQuiz.
 *      (Google mostrará "Google no verificó esta app" porque es su propio script:
 *       Configuración avanzada > Ir a … (no seguro) > Permitir.)
 *
 * @OnlyCurrentDoc  ← el script solo puede tocar ESTA hoja, no el resto de su Drive.
 */
const TOKEN = 'PEGUE_AQUI_SU_TOKEN';

/** Token en uso: el pegado arriba o, si no hay, el que «activarCorreos» obtuvo solo de YaguarQuiz. */
function token_() {
  if (TOKEN && TOKEN !== 'PEGUE_AQUI_SU_TOKEN') return TOKEN;
  return PropertiesService.getScriptProperties().getProperty('YQ_TOKEN') || '';
}

// YaguarQuiz (datos públicos del sistema; la clave publicable no es secreta)
const YQ_URL = 'https://ywoamnwsacphjfjokmkg.supabase.co';
const YQ_KEY = 'sb_publishable_WJyzJzbWEvLTRztsEbvP5g_pKXe6OsZ';

const SHEET_SUMMARY = 'Resumen_Sesiones';
const SHEET_ANSWERS = 'Detalle_Respuestas';
const SHEET_QUESTIONS = 'Analisis_Preguntas';
const HEADER_BG = '#1F3864';

function doGet() {
  return json_({ ok: true, app: 'YaguarQuiz', message: 'Conexión lista. Use el botón "Probar conexión" en YaguarQuiz.' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!token_() || data.token !== token_()) {
      return json_({ ok: false, error: 'token', message: 'El token no coincide. Revise que sea el mismo en YaguarQuiz y en el script.' });
    }
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (data.action === 'ping') return json_({ ok: true, name: book.getName(), url: book.getUrl(), mail: mailInfo_() });
    if (data.action === 'mail_now') return json_(enviarCorreos());
    if (data.action !== 'sync' || !data.session || !data.session.id) return json_({ ok: false, error: 'payload' });

    lock.waitLock(20000);
    const s = data.session;
    upsertSummary_(book, s);
    if (data.notas && data.notas.sheet) upsertGrades_(book, data.notas);
    replaceBySession_(book, SHEET_ANSWERS,
      ['session_id', 'Evaluación', 'RU', 'Estudiante', 'N°', 'Pregunta', 'Respuesta', '¿Correcta?', 'Crédito (%)', 'Tiempo (s)', 'Puntos'],
      s.id, (data.respuestas || []).map(function (r) {
        return [s.id, s.evaluacion, r.ru, r.nombre, r.n, r.pregunta, r.respuesta, r.correcta ? 'Sí' : 'No', r.credito, r.tiempo_s, r.puntos];
      }));
    replaceBySession_(book, SHEET_QUESTIONS,
      ['session_id', 'Evaluación', 'N°', 'Pregunta', 'Tipo', 'Respondieron', 'Aciertos', '% Acierto', 'Respuesta incorrecta más elegida', 'Tiempo prom. (s)', '¿Difícil? (<35 %)'],
      s.id, (data.preguntas || []).map(function (q) {
        return [s.id, s.evaluacion, q.n, q.pregunta, q.tipo, q.respondieron, q.aciertos, q.pct, q.distractor, q.tiempo_s, q.dificil ? 'Sí' : 'No'];
      }));
    return json_({ ok: true, url: book.getUrl() });
  } catch (err) {
    return json_({ ok: false, error: 'script', message: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* sin bloqueo */ }
  }
}

// ------------------------------------------------------------------ hojas
function sheet_(book, name, headers) {
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      styleHeader_(sh.getRange(1, 1, 1, headers.length));
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function styleHeader_(range) {
  range.setFontWeight('bold').setBackground(HEADER_BG).setFontColor('#FFFFFF');
}

/** Resumen_Sesiones: una fila por sesión (se actualiza si ya existe). */
function upsertSummary_(book, s) {
  const headers = ['session_id', 'Fecha', 'Gestión', 'Periodo', 'Asignatura', 'Sigla', 'Paralelo', 'Tema', 'Evaluación', 'Modo',
    'Participantes', 'Inscritos', 'Promedio', '% Aprobación', 'Categoría del plan', 'Actualizado'];
  const sh = sheet_(book, SHEET_SUMMARY, headers);
  const row = [s.id, s.fecha, s.gestion, s.periodo, s.asignatura, s.sigla, s.paralelo, s.tema || '', s.evaluacion, s.modo,
    s.participantes, s.inscritos === null || s.inscritos === undefined ? '' : s.inscritos, s.promedio, s.aprobacion_pct, s.categoria || '', new Date()];
  const last = sh.getLastRow();
  const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  const at = ids.indexOf(String(s.id));
  sh.getRange(at >= 0 ? at + 2 : last + 1, 1, 1, row.length).setValues([row]);
}

/**
 * Libreta Notas_SIGLA_PARALELO:
 *   fila 1 (oculta) = identificadores de sesión · fila 2 = encabezados · desde la fila 3 = estudiantes.
 *   Columnas A-B = RU y nombre; una columna por evaluación.
 */
function upsertGrades_(book, notas) {
  const name = String(notas.sheet).slice(0, 90);
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.getRange(1, 1, 2, 2).setValues([['id', 'id'], ['RU', 'Apellidos y nombres']]);
    styleHeader_(sh.getRange(2, 1, 1, 2));
    sh.setFrozenRows(2);
    sh.hideRows(1);
  }
  // columna de la evaluación
  const lastCol = Math.max(2, sh.getLastColumn());
  const ids = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  let col = ids.indexOf(String(notas.column.id)) + 1;
  if (col <= 0) col = lastCol + 1;
  sh.getRange(1, col).setValue(notas.column.id);
  sh.getRange(2, col).setValue(notas.column.header);
  styleHeader_(sh.getRange(2, col, 1, 1));
  // filas de estudiantes (por RU)
  let lastRow = Math.max(2, sh.getLastRow());
  const rus = lastRow > 2 ? sh.getRange(3, 1, lastRow - 2, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  (notas.rows || []).forEach(function (r) {
    let i = rus.indexOf(String(r.ru));
    if (i < 0) {
      lastRow += 1;
      sh.getRange(lastRow, 1, 1, 2).setValues([[r.ru, r.nombre]]);
      rus.push(String(r.ru));
      i = rus.length - 1;
    }
    sh.getRange(i + 3, col).setValue(r.nota === null || r.nota === undefined ? '' : r.nota);
  });
}

/** Borra las filas de la sesión y escribe las nuevas (así reenviar no duplica). */
function replaceBySession_(book, name, headers, sessionId, rows) {
  const sh = sheet_(book, name, headers);
  const last = sh.getLastRow();
  if (last > 1) {
    const all = sh.getRange(2, 1, last - 1, headers.length).getValues();
    const keep = all.filter(function (r) { return String(r[0]) !== String(sessionId); });
    if (keep.length !== all.length) {
      sh.getRange(2, 1, last - 1, headers.length).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, headers.length).setValues(keep);
    }
  }
  if (rows.length) {
    const start = Math.max(1, lastDataRow_(sh, headers.length)) + 1;
    sh.getRange(start, 1, rows.length, headers.length).setValues(rows);
  }
}

function lastDataRow_(sh, width) {
  const last = sh.getLastRow();
  if (last <= 1) return 1;
  const vals = sh.getRange(1, 1, last, width).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i].some(function (v) { return v !== '' && v !== null; })) return i + 1;
  }
  return 1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------ correos a estudiantes
/**
 * EJECUTE ESTA FUNCIÓN UNA VEZ (menú de arriba: elegir «activarCorreos» y presionar ▶ Ejecutar).
 * Pide permiso para enviar correos desde su Gmail y deja programado el envío cada 5 minutos.
 */
function activarCorreos() {
  // Sin token: se conecta solo con YaguarQuiz (el docente abrió la ventana de conexión para este correo)
  if (!token_()) {
    const email = Session.getEffectiveUser().getEmail();
    const c = rpc_('mail_claim', { p_email: email });
    if (!c || !c.ok || !c.token) {
      throw new Error('YaguarQuiz no tiene abierta la conexión para ' + email + '. En YaguarQuiz > Configuración > Correos pulse «Conectar» y vuelva a ejecutar.');
    }
    PropertiesService.getScriptProperties().setProperty('YQ_TOKEN', c.token);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarCorreos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarCorreos').timeBased().everyMinutes(5).create();
  return enviarCorreos();
}

/** Envía lo pendiente (la llama el reloj cada 5 minutos y YaguarQuiz al lanzar una tarea). */
function enviarCorreos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: true, busy: true, sent: 0 };
  try {
    const quota = MailApp.getRemainingDailyQuota();
    if (quota <= 0) return { ok: true, sent: 0, quota: 0 };
    const r = rpc_('mail_pull', { p_token: token_(), p_max: Math.min(quota, 50) });
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'pull' };
    if (!r.enabled) return { ok: true, enabled: false, sent: 0 };
    let sent = 0;
    (r.messages || []).forEach(function (m) {
      try {
        MailApp.sendEmail({ to: m.to, subject: m.subject, htmlBody: m.html, name: 'YaguarQuiz UAP' });
        rpc_('mail_ack', { p_token: token_(), p_ids: m.ids, p_ok: true });
        sent++;
      } catch (err) {
        rpc_('mail_ack', { p_token: token_(), p_ids: m.ids, p_ok: false, p_error: String(err && err.message ? err.message : err) });
      }
    });
    return { ok: true, enabled: true, sent: sent, quota: MailApp.getRemainingDailyQuota() };
  } finally {
    lock.releaseLock();
  }
}

function mailInfo_() {
  try {
    const on = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'enviarCorreos'; });
    return { scheduled: on, quota: MailApp.getRemainingDailyQuota() };
  } catch (e) {
    return { scheduled: false, error: 'permiso' };
  }
}

function rpc_(fn, body) {
  const res = UrlFetchApp.fetch(YQ_URL + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: YQ_KEY, Authorization: 'Bearer ' + YQ_KEY },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, error: 'http ' + res.getResponseCode() };
  }
}

