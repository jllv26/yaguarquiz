# YaguarQuiz UAP — Informe de QA final (Fase 8)

Fecha: 2026-11-18 14:16 · Resultado: **23/23 verificaciones de punta a punta OK**,
sin errores de JavaScript en ningún navegador.

## Cómo se probó

- **Motor real:** PostgreSQL 16 con todas las migraciones de `supabase/migrations` (las mismas funciones y reglas RLS que en Supabase),
  expuesto con `tests/e2e/fake_supabase.py`, que imita la API de Supabase y **registra todo lo que recibe cada estudiante**.
- **La app publicada** (compilada igual que en GitHub Pages) en **dos navegadores distintos**:
  - **Chromium** (motor de Chrome y Edge): proyector del docente a 1920×1080 y celular del estudiante a 390×844, con el
    **reloj del celular adelantado 3 horas** a propósito.
  - **WebKit** (motor de Safari / iPhone): PC del laboratorio a 1366×768, **respondiendo con el teclado** (teclas 1‑4).
    Agente: `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15`.
  - Firefox no se pudo descargar en el entorno de pruebas; WebKit cubre un segundo motor distinto (y es el de los iPhone).
- Además de los dos navegadores reales, 7 estudiantes más respondieron directo al servidor en cada pregunta.
- Script: `tests/e2e/qa_flow.py` · capturas de cada pantalla en cada navegador · resultados en JSON.

## Flujo completo de la clase en vivo (sección 7)

| # | Verificación | Resultado | Detalle |
|---|---|---|---|
| 7.1 | Proyector: PIN gigante, QR, contador y avatares | ✅ | PIN y QR visibles |
| 7.2 | Estudiante entra con PIN + RU + CI y elige avatar (Chromium y WebKit) | ✅ | WebKit: Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15… |
| 7.3 | Docente ve conectados y ausentes | ✅ | la lista muestra a los inscritos que no entraron |
| 7.4 | Cuenta regresiva 3-2-1 en ambas pantallas | ✅ | question |
| 7.6 | La pregunta termina sola cuando todos responden | ✅ | reveal |
| 7.7 | Revelación: correcta + barras por opción + resultado en cada celular | ✅ | celular muestra su resultado |
| 7.8 | Ranking animado entre preguntas | ✅ | leaderboard |
| 7.9 | Final: podio en el proyector y resumen con puesto, aciertos, nota e insignias | ✅ | celular: sí · WebKit: sí |
| 7.10 | Cierre: resultados guardados y envío automático a Sheets al terminar | ✅ | el envío se intenta solo al terminar |
| 7.T | Temas visuales (Amazonía, Espacio, Neón, Clásico UAP, Minimalista) en proyector y celular | ✅ | capturas tema-*.png |
| QA | Sin errores de JavaScript en ningún navegador durante la prueba | ✅ | ninguno |

## Casos límite (sección 8)

| # | Situación | Resultado | Cómo se comprobó |
|---|---|---|---|
| 8.1 | Recarga o corte a mitad de pregunta: vuelve solo, con su puntaje | ✅ | puntaje antes/después: 891 / 891; no pide el RU otra vez |
| 8.2 | Estudiante que llega tarde entra a la pregunta en curso | ✅ | fase question, pregunta 1; las anteriores quedan sin responder |
| 8.2b | Llegada tarde desactivada: mensaje claro | ✅ | session_info → «started» |
| 8.3 | Responde en el segundo 0: acepta hasta +500 ms y después rechaza | ✅ | +300 ms → aceptada, +900 ms → «late» |
| 8.4 | Doble clic: solo cuenta la primera respuesta | ✅ | 1ª ok, 2ª «already», filas=1 |
| 8.5 | Dos estudiantes con el mismo nombre se distinguen | ✅ | «Ana P. (DBE7)» y «Ana P. (AACC)» |
| 8.6 | Docente recarga el proyector: la sesión sigue y retoma el control | ✅ | fase antes/después: question/question |
| 8.7 | Hora mal en la PC del estudiante no influye (el tiempo lo calcula el servidor) | ✅ | submit_answer(p_token uuid, p_question uuid, p_response jsonb) no recibe tiempo del navegador; tiempo medido en servidor = 5 ms |
| 8.7b | Celular con la hora adelantada 3 h: su cronómetro coincide con el del servidor | ✅ | servidor: 51 s restantes; celular muestra [4, 6, 51] |
| 8.8 | Inspeccionar la red no revela la correcta antes de tiempo | ✅ | 165 respuestas del servidor a estudiantes revisadas durante preguntas; filtraciones: ninguna |
| 8.9 | Google Sheets no responde: resultados guardados, error registrado y botón Re-sincronizar | ✅ | registro: ('error', 'No se pudo conectar con Google. Revise el internet o la URL de la aplicación web.'); respuestas guardadas: 53 |
| 8.10 | Se pierde internet en examen: aviso, respuestas guardadas en el equipo y enviadas al volver | ✅ | sin internet: 0 en servidor; al volver: 3 de 3 guardadas; aviso: sí |
| 8.11 | Supabase pausado por inactividad | ✅ | `keep-alive.yml` llama a `keep_alive()` lunes y jueves; el README explica **Restore project**. |
| 8.12 | Excel con errores | ✅ | Pruebas unitarias de importación (`tests/unit/`): no importa nada hasta corregir y reporta fila por fila (lista de 40 con 2 errores). |

## Otras pruebas automáticas

| Prueba | Resultado |
|---|---|
| `tests/run-all.sh` — unitarias (26), juego en vivo con **45 estudiantes** simultáneos, examen con 45 estudiantes (apertura/cierre automáticos, entrega por tiempo), reportes y libreta | ✅ 4/4 bloques |
| RLS activo en todas las tablas | ✅ 20/20 tablas |
| Búsqueda de claves secretas en el repositorio (`sb_secret_`, `service_role`, contraseñas, JWT) | ✅ ninguna |
| Accesibilidad automática (axe-core, WCAG 2.1 A/AA) en 10 pantallas: inicio claro/oscuro, unirse, PIN inexistente, login, panel, sesiones, proyector, vitrina y manual | ✅ 0 fallas |
| Velocidad (wifi lento simulado: 1,5 Mbps, 150 ms) | Primera visita: título en ~2 s (362 KB). Segunda visita: **0,26 s y 0 KB** (service worker). Sin internet, la portada igual abre. |
| Google Apps Script simulado (4 hojas, token, reenvíos) | ✅ sin duplicar filas tras 2 reenvíos |

## Lista de verificación final (sección 15)

| Punto | Estado |
|---|---|
| Flujo de la sección 7 de principio a fin en dos navegadores distintos | ✅ Chromium + WebKit |
| Todos los casos límite de la sección 8 probados y documentados | ✅ 12/12 (tabla de arriba) |
| Simulador de carga con 45 estudiantes sin perder respuestas | ✅ `tests/load/live-load-test.mjs` |
| Ninguna respuesta correcta visible antes de tiempo (red) | ✅ 8.8 |
| RLS en todas las tablas; sin claves secretas en el repositorio | ✅ |
| Plantillas Excel se descargan, se rellenan y se importan | ✅ (Fases 2 y 3; pruebas unitarias de importación) |
| Google Sheets recibe y no duplica al re-sincronizar | ✅ con Apps Script simulado · ⏳ conexión real pendiente de **“Autorizar acceso”** del docente |
| Sonido tras el primer clic y se puede silenciar | ✅ botón 🔊 visible en proyector y celular + tecla **M**; música y efectos con volumen propio |
| Se ve bien en celular, PC del laboratorio y proyector; modo oscuro | ✅ capturas 390×844, 1366×768 y 1920×1080; 5 temas, claro/oscuro |
| README para instalar desde cero | ✅ 8 pasos numerados (Supabase, migraciones, variables de GitHub, publicar, primer ingreso, Apps Script, keep-alive) |

## Errores encontrados y corregidos durante la QA

- El panel de participantes del proyector no se cerraba con **Escape** → corregido (accesibilidad de teclado).
- El audio intentaba iniciarse antes del primer clic (avisos del navegador) → ahora espera el primer gesto y luego arranca la música pedida.
- El proyector no mostraba el **tema visual** elegido (solo el celular) → ahora ambos lo leen por el PIN.
- **Clásico UAP**: el título quedaba sobre la franja azul (poco legible) → franjas movidas a las esquinas.
- Contraste insuficiente (dorado “Quiz” del logo, verde de la respuesta ■, textos sobre fondo oscuro, enlace del manual) y
  nombres accesibles que no coincidían con el texto visible → corregidos (axe-core en 0).


## Fase 9 — Actividades estilo Educaplay (19/11/2026)

| Prueba | Resultado |
|---|---|
| Servidor (`tests/load/activities-test.mjs`): los 10 tipos, nota, intentos 100/60/30 %, revelación, revisión, reporte, copia de actividad, evaluación normal intacta, funciones internas protegidas | ✅ todo correcto |
| Punta a punta (`tests/e2e/activities_flow.py`): el docente crea un crucigrama, pega desde Excel, genera el tablero, prueba y lanza; el estudiante (celular) juega contra el servidor, recarga a mitad sin perder avance y termina con 93,33 (un acierto al 2.º intento); memoria y clasificar contra el servidor; el tablero nunca trae las palabras | ✅ 15/15 |
| Interfaz de los 10 juegos jugados de principio a fin (PC 1366 y celular 390 táctil), WebKit (motor de Safari) | ✅ |
| Accesibilidad axe-core (WCAG 2.1 AA): actividades del docente, editor y los 10 juegos | ✅ 0 fallas en 22 pantallas |
| Regresión: las 23 verificaciones de la Fase 8 | ✅ 23/23 |

Errores encontrados y corregidos: `activity_state` alteraba las evaluaciones normales (detectado por la regresión);
copiar una actividad desordenaba el tablero; en el crucigrama, al tocar una pista vertical el cursor saltaba a la
horizontal y el avance automático podía mover el cursor si el estudiante ya había elegido otra palabra; las claves de
memoria/relacionar se podían calcular desde el navegador (ahora llevan un secreto por intento); contraste de 5 colores
de juego; al lanzar una tarea “ahora”, la hora de apertura se redondeaba hacia adelante (quedaba cerrada unos minutos).


## Fase 10 — Exposiciones con evaluación entre pares (19/11/2026)

Integración de la «Copa Salvando el Semestre» (repositorio `copases`) con las mismas reglas: 5 criterios × 3 niveles,
explicar la nota, nadie se califica a sí mismo ni a su grupo, ausente = 0, cronómetro sin límite.

| Prueba | Resultado |
|---|---|
| Servidor (`tests/load/presentations-test.mjs`): ingreso con RU + CI y un solo equipo, reglas de calificación, 13/15 = 86,67, corregir no duplica, promedio de pares, peso del docente, ausente, deshacer, comentarios, libreta (solo categorías manuales), PIN distinto del de las sesiones, cierre y «borrar pruebas» | ✅ todo correcto |
| Punta a punta (`tests/e2e/presentations_flow.py`): docente crea y pega grupos desde Excel; 3 celulares entran por la pantalla de inicio; expositor ve «¡Es tu turno!», su grupo no lo califica, los demás califican y explican; el docente califica; proyector; resultados, Excel y libreta | ✅ 15/15 |
| Accesibilidad (axe): lista, editor, control (claro y oscuro) e ingreso del estudiante | ✅ 0 fallas |
| Regresión: 23/23 (clase en vivo y examen) y 15/15 (actividades); servidor 6/6 bloques | ✅ |
