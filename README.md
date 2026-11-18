# YaguarQuiz UAP 🐆

Plataforma **gratuita** de evaluaciones gamificadas (estilo Kahoot, Wayground y Educaplay) de la
**Universidad Amazónica de Pando** – Cobija, Pando, Bolivia. Lema: **¡Demuestra tu garra!**

Docente responsable: **Ing. Jimmy Luis Laruta Villarreal**

🌐 Sitio publicado: **https://jllv26.github.io/yaguarquiz/** · 📘 Manual del estudiante: **[/#/ayuda](https://jllv26.github.io/yaguarquiz/#/ayuda)** ([docs/MANUAL_ESTUDIANTE.md](docs/MANUAL_ESTUDIANTE.md))

---

## Contenido

1. [Estado del proyecto](#estado-del-proyecto)
2. [Instalación desde cero (paso a paso)](#instalación-desde-cero-paso-a-paso)
3. [Uso en clase](#uso-en-clase)
4. [Reportes, libreta y Google Sheets](#reportes-libreta-de-notas-y-google-sheets)
5. [Sonido, temas y accesibilidad](#sonido-temas-y-accesibilidad)
6. [Pruebas y control de calidad](#pruebas-y-control-de-calidad)
7. [Seguridad](#seguridad)
8. [Mantenimiento y problemas frecuentes](#mantenimiento-y-problemas-frecuentes)
9. [Detalles técnicos](#detalles-técnicos)

---

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 0. Base | Proyecto, sistema de diseño, página de inicio, publicación automática | ✅ |
| 1. BD y login | Supabase, seguridad (RLS), login del docente, datos de ejemplo | ✅ |
| 2. Gestión académica | Gestiones, periodos, asignaturas, listas de estudiantes por Excel, temas, plan de calificación | ✅ |
| 3. Editor y banco | Editor visual con autoguardado, 6 tipos de pregunta, imágenes, banco, carga masiva Excel + ZIP | ✅ |
| 4. Juego en vivo | Sala, PIN/QR, partida en tiempo real, puntaje en el servidor | ✅ |
| 5. Examen y tarea | Autoritmo, tiempo total, apertura/cierre automático, anti-copia | ✅ |
| 6. Resultados y Sheets | Reportes, exportaciones, Google Sheets, libreta de notas (conversor) | ✅ |
| 7. Pulido | Música y efectos, mascota jaguar, entrada animada, 5 temas visuales, podio, insignias, accesibilidad AA, carga rápida | ✅ |
| 8. QA final | 23 verificaciones de punta a punta en 2 navegadores, casos límite, manuales | ✅ ([docs/QA.md](docs/QA.md)) |

---

## Instalación desde cero (paso a paso)

> Esta guía sirve para instalar **su propia copia** de YaguarQuiz. Todo es gratuito. Tiempo aproximado: 30 minutos.
> Necesita: una cuenta de **GitHub**, una de **Supabase** y una de **Google** (Gmail).

### Paso 1 — Copiar el proyecto a su GitHub

1. Inicie sesión en <https://github.com>.
2. Abra <https://github.com/jllv26/yaguarquiz> y presione **Fork** (arriba a la derecha) → **Create fork**.
   El nombre del repositorio será la dirección del sitio: `https://SU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.
3. En su copia: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Paso 2 — Crear el proyecto de Supabase (base de datos)

1. Entre a <https://supabase.com> → **Start your project** → inicie sesión con GitHub.
2. **New project**: ponga un nombre (ej. `yaguarquiz`), una **contraseña de base de datos** (guárdela en un lugar
   seguro; **no** la escriba en el proyecto) y la región más cercana. Plan **Free**.
3. Espere 1–2 minutos a que el proyecto quede listo.
4. Vaya a **Project Settings → API Keys** y copie:
   - **Project URL** (ej. `https://abcdefgh.supabase.co`)
   - **Publishable key** (empieza con `sb_publishable_…`). Es pública por diseño.
   - ⚠️ La **secret key** (`sb_secret_…`) **nunca** se copia en el proyecto ni en GitHub.
5. **Authentication → URL Configuration**:
   - **Site URL**: `https://SU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`
   - **Redirect URLs**: agregue la misma dirección.

### Paso 3 — Crear las tablas (migraciones)

1. En Supabase abra **SQL Editor → New query**.
2. Abra en GitHub la carpeta [`supabase/migrations`](supabase/migrations). Para **cada archivo, en orden**
   (`0001`, `0002`, … `0008`): ábralo → botón **Raw** → copie todo → péguelo en el SQL Editor → **Run**.
   Debe decir *Success*. Si Supabase muestra “Potential issue detected”, presione **Run query** (es normal: las
   migraciones crean funciones y permisos).
3. Se pueden volver a ejecutar sin dañar nada.

| Archivo | Qué crea |
|---|---|
| `0001_schema` | Tablas, seguridad RLS, roles, función `keep_alive` |
| `0002_demo_data` | Botón de “datos de ejemplo” para probar |
| `0003_academic` | Importar estudiantes, plan de calificación |
| `0004_quizzes` | Editor de evaluaciones, banco, imágenes (bucket `media`) |
| `0005_live` | Motor del juego en vivo (PIN, puntaje en el servidor, ranking) |
| `0006_exam` | Examen y tarea (intentos, horarios, anti-copia, monitor) |
| `0007_reports` | Reportes, libreta de notas, registro de envíos a Google Sheets |
| `0008_theme` | Tema visual de la evaluación en el celular del estudiante |

### Paso 4 — Conectar su copia con su Supabase

En su repositorio de GitHub: **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**:

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | La **Project URL** del paso 2 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | La **Publishable key** del paso 2 |

Son variables (no secretos) porque ambos valores son públicos por diseño; la protección real la dan las reglas RLS.
Si no las crea, la app usa el Supabase de la UAP.

### Paso 5 — Publicar

1. Vaya a la pestaña **Actions** → **Publicar en GitHub Pages** → **Run workflow** (o haga cualquier cambio en `main`).
2. En 2–3 minutos aparece el ✅ verde. El sitio queda en `https://SU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.
3. Cada cambio que se suba a `main` se publica solo (el proceso revisa el código y corre las pruebas antes).

### Paso 6 — Primer inicio de sesión del docente

1. Abra `…/#/admin/login` → **Crear cuenta** con su correo y una contraseña.
2. Llega un **correo de confirmación**: ábralo **en el mismo navegador**.
3. La **primera cuenta** queda como **administrador aprobado**. Las siguientes cuentas de otros docentes se aprueban en
   **Configuración → Docentes**. Cada docente solo ve sus propios datos.
4. Para probar todo de inmediato: **Panel → Cargar datos de ejemplo** (asignatura DEMO, 12 estudiantes y evaluaciones).

### Paso 7 — Google Sheets (opcional, copia automática de resultados)

1. Con su Gmail cree una hoja nueva en <https://sheets.google.com> (ej. “YaguarQuiz — Resultados”).
2. En la hoja: **Extensiones → Apps Script**. Borre lo que haya y pegue el contenido de
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
3. En YaguarQuiz: **Configuración → Google Sheets → Generar token** y copie el token.
4. En Apps Script, reemplace `PEGUE_AQUI_SU_TOKEN` por ese token → **Guardar** (💾).
5. **Implementar → Nueva implementación → ⚙ Aplicación web**: *Ejecutar como*: **Yo** · *Quién tiene acceso*:
   **Cualquier usuario** → **Implementar** → **Autorizar acceso** → elija su cuenta → **Configuración avanzada** →
   **Ir a … (no seguro)** → **Permitir**. (Es su propio script en su propia cuenta; Google lo marca “no verificado”
   porque no pasó por su tienda.)
6. Copie la **URL de la aplicación web** (termina en `/exec`), péguela en **Configuración → Google Sheets** junto con el
   token → **Guardar** → **Probar conexión**.

### Paso 8 — Mantener Supabase activo

El plan gratuito de Supabase **se pausa tras 7 días sin uso**. El archivo
[`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) hace una consulta liviana **lunes y jueves**
automáticamente. Verifique en **Actions → Mantener Supabase activo** que aparezca en verde (si GitHub lo desactiva por
inactividad del repositorio, presione **Enable workflow**). Si aun así se pausa, vea
[Problemas frecuentes](#mantenimiento-y-problemas-frecuentes).

### (Opcional) Trabajar en su computadora

1. Instale **Node.js 22** (LTS) desde <https://nodejs.org>.
2. `git clone https://github.com/SU-USUARIO/NOMBRE-DEL-REPOSITORIO.git` → `cd` a la carpeta → `npm install`.
3. Copie `.env.example` como `.env` y ponga su URL y publishable key.
4. `npm run dev` y abra la dirección que aparece (ej. `http://localhost:5173/yaguarquiz/`).

---

## Uso en clase

### Rutas

| Ruta | Para quién |
|---|---|
| `/#/` | Estudiantes: ingresar el PIN (con entrada animada del jaguar) |
| `/#/play/123456` | Estudiantes: partida, examen o tarea |
| `/#/ayuda` | Estudiantes: manual |
| `/#/admin/login` · `/#/admin` | Docente: ingreso y panel |
| `/#/host/<sesión>` | Docente: proyector (en vivo) o monitor (examen/tarea) |
| `/#/diseno` | Vitrina: mascota, sonidos, temas, componentes |

> Se usa `#` en las direcciones para que recargar la página nunca dé error 404 en GitHub Pages.

### Clase en vivo (estilo Kahoot)

1. **Evaluaciones** → abra una evaluación → **Publicar** → **Lanzar en vivo**.
2. Elija si entran **con su RU** (lista oficial, cuenta para la nota; opcional pedir los últimos 3 dígitos del CI) o **con apodo** (repasos).
3. El **proyector** muestra dirección, **PIN** y **código QR**, música de sala, quién entró y quién falta (**ausentes**).
4. **Empezar** → cuenta 3‑2‑1 → pregunta (música de tensión, tic-tac acelerado al final). Se cierra sola al acabar el tiempo o cuando todos respondieron.
5. Correcta + gráfico de respuestas + explicación → **ranking** → siguiente (tecla **Espacio**).
6. Final: **redoble, podio, fanfarria, aplausos y rugido**; tabla con la **nota 0‑100** (solo aciertos) y **Excel**. Los resultados se envían solos a Google Sheets.

Controles: **Espacio** siguiente · **P** pausa · **F** pantalla completa · **M** silenciar · **+10 s** · **Cerrar pregunta** ·
retirar a un participante · autorizar cambio de equipo. En sesiones con apodo, **Simular 10 estudiantes** permite ensayar.

**Puntos de juego** (no afectan la nota): `round(base × (1 − (tiempo/límite)/2))` + racha (+100 por acierto seguido desde el 2º, máx. +500).
**Nota**: 0–100 según aciertos y peso de cada pregunta.

### Examen de laboratorio y tarea

1. **Lanzar** → **Examen** o **Tarea / práctica**. Ponga **apertura** y **cierre**: se abre y se cierra sola.
2. **Tiempo total por estudiante** (desde “Comenzar”); al vencer, se entrega solo lo respondido.
3. **Anti-copia:** N preguntas al azar por estudiante, orden de preguntas y opciones mezclado, CI, sin copiar/pegar,
   **modo enfoque** (pantalla completa; salidas registradas y bloqueo opcional), correctas visibles **al cerrar**.
4. **Intentos:** 1 en examen, varios en práctica (cuenta el mejor).
5. **Monitor**: progreso, tiempo, alertas, notas; +5 min a un estudiante, +10 min a todos, desbloquear, otro intento,
   entregar ahora, abrir/cerrar/reabrir, Excel. Compartir PIN por WhatsApp.
6. Si se corta el internet, cada respuesta queda guardada en el equipo y se envía sola al volver.

---

## Reportes, libreta de notas y Google Sheets

- **Reportes** (`/#/admin/reportes`): participación, promedio, mediana, máx./mín., % de aprobación, tiempo promedio y
  distribución; por estudiante (respuestas una a una, alertas, **ajuste de nota con motivo registrado**); por pregunta
  (% de acierto, distractor más elegido, **preguntas difíciles < 35 %**). Exporta **Excel**, **CSV** y **PDF** A4 con encabezado UAP.
- **Libreta de notas** (Asignatura → *Libreta de notas*): conversor del plan (por defecto 30 + 30 + 40). Aporte = (nota/100) × peso;
  actividades de una categoría se promedian; ausente en actividad cerrada = 0; categorías manuales editables; final
  redondeado; aprueba con 51. Exporta a Excel.
- **Google Sheets**: 4 hojas — `Resumen_Sesiones`, `Notas_SIGLA_PARALELO`, `Detalle_Respuestas`, `Analisis_Preguntas`.
  Envío automático al terminar (con lista oficial) y botón **Re-sincronizar**. **Reenviar no duplica filas**
  (clave = identificador de la sesión). Si Google no responde, los resultados siguen seguros en Supabase y el error queda registrado.

---

## Sonido, temas y accesibilidad

- **Sonido 100 % generado en el navegador** (Web Audio): música de sala (marimba amazónica) y de pregunta, 3‑2‑1, tic-tac
  acelerado, enviado, acierto, error, ranking, redoble, fanfarria, aplausos y rugido. Sin archivos ni derechos de autor
  ([public/sounds/CREDITOS.md](public/sounds/CREDITOS.md)). Volumen de **música** y **efectos** por separado; tecla **M**.
  Por defecto la música suena **solo en el proyector**; los estudiantes pueden activarla en su equipo.
- **Mascota Yaguar** (emblema geométrico propio) con 5 expresiones, mirada que sigue al cursor, zarpazo, ojo vigilante
  y **entrada animada**: un jaguar cruza la pantalla corriendo, salta rugiendo y deja huellas (una vez por sesión del navegador).
- **Temas visuales por evaluación** (en *Datos de la evaluación*): **Amazonía**, **Espacio**, **Neón**, **Clásico UAP**
  y **Minimalista**; se ven en el proyector y en los celulares. Modo claro y oscuro.
- **Accesibilidad**: auditoría automática **axe-core WCAG 2.1 AA sin fallas** en las pantallas principales; formas además de
  colores; teclas 1‑4; avisos para lectores de pantalla; foco visible; respeta “reducir movimiento”.
- **Velocidad**: código dividido por pantalla y librerías en caché; la segunda visita carga en ~0,3 s sin descargar nada
  (service worker) y la portada abre incluso sin internet. Instalable en el celular (PWA, ícono del jaguar).

---

## Pruebas y control de calidad

```bash
npm test                 # pruebas unitarias (Excel, conversor de notas, Apps Script simulado)
bash tests/run-all.sh    # todo lo anterior + pruebas del servidor (45 estudiantes, examen, reportes) + RLS
```

Prueba de punta a punta en **dos navegadores** (Chromium y WebKit/Safari) contra el motor real — ver
[docs/QA.md](docs/QA.md) para resultados, casos límite y la lista de verificación final:

```bash
python3 tests/e2e/fake_supabase.py &                      # imita la API de Supabase sobre PostgreSQL local
VITE_SUPABASE_URL=http://localhost:5555 npx vite build --outDir /tmp/dist-qa
npx vite preview --outDir /tmp/dist-qa --port 4174 &
python3 tests/e2e/qa_flow.py                              # 23 verificaciones
python3 tests/e2e/a11y_audit.py                           # accesibilidad (axe-core)
```

Requisitos para las pruebas de servidor: PostgreSQL 16 local en `/tmp:5544` (ver `tests/sql/00_supabase_stub.sql`).
`scripts/make-test-list.mjs` y `scripts/make-test-questions.mjs` generan Excel de prueba para las importaciones.

---

## Seguridad

- **RLS activo en todas las tablas (20/20).** Los estudiantes no leen ninguna tabla: solo llaman funciones que validan su ficha de juego.
- Las **respuestas correctas nunca llegan al navegador del estudiante antes de cerrar la pregunta** (verificado revisando
  165 respuestas del servidor durante preguntas en la prueba QA). Corrección, tiempo (reloj del servidor) y puntos se calculan en el servidor;
  respuestas repetidas o tardías (+500 ms de tolerancia) se rechazan.
- Claves secretas (`sb_secret_…`, contraseña de la base) **nunca** en el repositorio. El token de Google Sheets vive solo en
  la configuración del docente y en su propio script.

---

## Mantenimiento y problemas frecuentes

| Situación | Solución |
|---|---|
| **Supabase pausado** (el sitio dice “Sin conexión” y nada carga) | Entre a <https://supabase.com/dashboard> → su proyecto → **Restore project**. En 1–2 minutos vuelve con todos los datos. Revise que el workflow *Mantener Supabase activo* esté habilitado. |
| Publicación con ❌ en **Actions** | Abra el paso en rojo: suele ser una prueba que falló. Corrija y suba de nuevo. |
| “Falta actualizar la base de datos” al lanzar | Ejecute en el SQL Editor la última migración de `supabase/migrations`. |
| Google Sheets no recibe | **Configuración → Google Sheets → Probar conexión**. Si cambió el script, haga **Implementar → Administrar implementaciones → Editar → Nueva versión**. En el reporte use **Re-sincronizar**. |
| Un estudiante no puede entrar | Ver [docs/MANUAL_ESTUDIANTE.md](docs/MANUAL_ESTUDIANTE.md) (RU no inscrito, otro dispositivo, entrada tardía). |
| No se escucha el sonido | Haga un clic en la página (los navegadores lo exigen) y revise el botón 🔊 (tecla M). |

---

## Detalles técnicos

**Tecnologías (gratuitas):** React + Vite + TypeScript · Tailwind CSS · Framer Motion + canvas-confetti · Web Audio ·
Supabase (PostgreSQL, Realtime, Auth, Storage) · Google Apps Script · GitHub Pages + GitHub Actions.

**Decisiones clave:** HashRouter (sin 404 al recargar) · puntaje y tiempo en el servidor (RPC `SECURITY DEFINER`) ·
el proyector avisa por Realtime y los celulares además consultan cada pocos segundos (funciona aunque falle Realtime) ·
Google Sheets recibe resultados al **terminar** (no es la base principal) · imágenes comprimidas en el navegador (WebP).

**Identidad visual:** Azul UAP `#1F3864` · Rojo UAP `#8B1A1A` · Verde `#1B7339` · Oro `#C9A23A` · Plomo `#4D4D4D` ·
juego: Coral `#FF3355`, Eléctrico `#2D7DFF`, Mango `#FFB800`, Selva `#1DBF73`. Tipografías **Outfit** e **Inter** (incluidas).

## Licencia

MIT — ver `LICENSE`.
