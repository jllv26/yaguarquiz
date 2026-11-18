# YaguarQuiz UAP

Plataforma **gratuita** de evaluaciones gamificadas (estilo Kahoot, Wayground y Educaplay) de la
**Universidad Amazónica de Pando** – Cobija, Pando, Bolivia.

Docente responsable: **Ing. Jimmy Luis Laruta Villarreal**

🌐 Sitio publicado: **https://jllv26.github.io/yaguarquiz/**

---

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 0. Base | Proyecto, sistema de diseño, página de inicio, publicación automática | ✅ Lista |
| 1. BD y login | Supabase, seguridad (RLS), login del docente, datos de ejemplo | ✅ Lista |
| 2. Gestión académica | Gestiones, periodos, asignaturas, listas de estudiantes por Excel, temas, plan de calificación | ✅ Lista |
| 3. Editor y banco | Editor visual con autoguardado, 6 tipos de pregunta, imágenes, banco, carga masiva Excel + ZIP | ✅ Lista |
| 4. Juego en vivo | Sala, PIN/QR, partida en tiempo real, puntaje en el servidor | ✅ Lista |
| 5. Examen y tarea | Autoritmo, tiempo total, apertura/cierre automático, anti-copia | ✅ Lista |
| 6. Resultados y Sheets | Reportes, exportaciones, Google Sheets, conversor de notas | — |
| 7. Pulido | Sonido, animaciones, temas, podio, insignias | — |
| 8. QA final | Pruebas completas, manuales | — |

## Tecnologías (todas gratuitas)

- **React + Vite + TypeScript** — la aplicación web
- **Tailwind CSS** — estilos
- **Framer Motion + canvas-confetti** — animaciones y celebraciones
- **Supabase** (plan gratuito) — base de datos, tiempo real, login e imágenes *(desde la Fase 1)*
- **Google Sheets + Apps Script** — copia de resultados *(Fase 6)*
- **GitHub Pages + GitHub Actions** — publicación automática

## Rutas

| Ruta | Para quién |
|---|---|
| `/#/` | Estudiantes: ingresar el PIN |
| `/#/play/123456` | Estudiantes: partida |
| `/#/admin/login` | Docente: ingresar o crear cuenta |
| `/#/admin` | Docente: panel |
| `/#/diseno` | Revisión del sistema de diseño |

> Se usa `#` en las direcciones para que recargar la página nunca dé error 404 en GitHub Pages.

---

## Base de datos (Supabase)

- Proyecto: `ywoamnwsacphjfjokmkg` (plan gratuito).
- Las migraciones están en `supabase/migrations/`. Para aplicarlas: Supabase → **SQL Editor** → pegar el
  contenido de cada archivo en orden → **Run**. Se pueden ejecutar varias veces sin dañar nada.
- Seguridad: todas las tablas tienen RLS. Los visitantes (estudiantes) no pueden leer ninguna tabla; cada
  docente solo ve sus propios datos.
- **Primer docente = administrador.** La primera cuenta creada en `/#/admin/login` queda como administrador
  aprobado; las siguientes deben ser aprobadas en *Configuración → Docentes*.
- Al crear la cuenta llega un correo de confirmación; hay que abrir el enlace en el mismo navegador.
- Migraciones: `0001` esquema + RLS, `0002` datos de ejemplo, `0003` gestión académica (importar estudiantes, plan de calificación), `0004` editor de evaluaciones (guardar/importar/copiar/mover/duplicar preguntas) y almacenamiento de imágenes (bucket `media`), `0005` motor del juego en vivo (sesiones, unirse con RU/CI o apodo, corrección y puntaje en el servidor, ranking, nota 0‑100), `0006` examen y tarea (intentos, apertura/cierre automático, preguntas al azar, mezcla por estudiante, modo enfoque, monitor).
- Pruebas de seguridad: `tests/sql/10_rls_test.sql` y `tests/sql/20_academic_test.sql` (se ejecutan en un PostgreSQL local con
  `tests/sql/00_supabase_stub.sql`).
- Prueba de carga del juego en vivo: `node tests/load/live-load-test.mjs 45` simula al docente y a 45 estudiantes que se unen y
  responden a la vez (respuestas simultáneas, doble clic, respuestas tardías, pausa, +10 s, otro dispositivo, expulsión, permisos).

## Examen de laboratorio y tarea

1. **Lanzar** → elija **Examen** o **Tarea / práctica**.
2. Ponga la hora de **apertura** y de **cierre**: la actividad se abre y se cierra sola. Lo que esté a medias al cerrar se entrega solo.
3. **Tiempo total por estudiante** (ej. 40 min): cuenta desde que el estudiante presiona “Comenzar”; al terminar se entrega solo.
4. **Anti-copia:** preguntas al azar (ej. 7 de 12) distintas para cada estudiante, orden de preguntas y opciones mezclado,
   últimos 3 dígitos del CI, sin copiar ni pegar, **modo enfoque** (pantalla completa; cada salida de la pestaña queda
   registrada y opcionalmente bloquea el examen hasta que el docente lo habilite) y respuestas correctas visibles **solo
   cuando cierra la actividad** (para que no se las pasen).
5. **Intentos:** 1 para examen, varios para práctica (cuenta el mejor). La práctica puede mostrar la correcta después de
   cada pregunta.
6. El **monitor** (`/#/host/...`) muestra PIN, QR, botón para **copiar o compartir por WhatsApp**, quién entró, progreso,
   tiempo restante, alertas y nota. Acciones: +5 min a un estudiante (necesidades especiales), +10 min a todos, desbloquear,
   permitir otro intento, entregar ahora, retirar, abrir/cerrar/reabrir y **Excel**.
7. Cada respuesta se guarda al instante en el servidor y también en el equipo del estudiante: si se corta el internet,
   se envía sola al volver.

Prueba: `node tests/load/exam-load-test.mjs 45` (apertura y cierre automáticos, entrega por tiempo, intentos, bloqueo,
tiempo extra, revisión solo después del cierre, permisos).

## Cómo funciona una clase en vivo

1. **Evaluaciones** → abre una evaluación → **Publicar** → **Lanzar en vivo** (o **Sesiones → Nueva sesión**).
2. Elige si entran **con su RU** (lista oficial, cuenta para la nota; opcional pedir los últimos 3 dígitos del CI) o **con apodo** (repasos).
3. Se abre el **proyector** (`/#/host/...`): muestra la dirección, el **PIN** y un **código QR**. Los estudiantes entran desde el celular o la PC.
4. **Empezar** → cuenta regresiva 3‑2‑1 → pregunta. Se cierra sola cuando se acaba el tiempo o cuando todos respondieron.
5. Se muestran la respuesta correcta y el gráfico de respuestas → **ranking** → siguiente pregunta (tecla **Espacio**).
6. Al final: **podio**, tabla de resultados con la **nota 0‑100** (solo aciertos, no velocidad) y **Descargar Excel**.

Controles: **P** pausa, **+10 s**, **Cerrar pregunta**, **F** pantalla completa, retirar a un participante, autorizar un cambio de
dispositivo. Si un estudiante recarga la página o se le corta el internet, vuelve a entrar solo con su mismo puntaje.
En sesiones con apodo, el botón **Simular 10 estudiantes** permite ensayar la clase sin celulares.

## Cómo se publica

Cada vez que se sube un cambio a la rama `main`, GitHub Actions compila el proyecto y lo publica
solo en GitHub Pages (archivo `.github/workflows/deploy.yml`). El avance se ve en la pestaña
**Actions** del repositorio.

## Trabajar en tu computadora (opcional)

1. Instala **Node.js 22** desde <https://nodejs.org> (versión LTS).
2. Descarga el proyecto:
   ```bash
   git clone https://github.com/jllv26/yaguarquiz.git
   cd yaguarquiz
   npm install
   ```
3. Copia `.env.example` como `.env` (los valores de Supabase se completan en la Fase 1).
4. Inicia el modo de desarrollo:
   ```bash
   npm run dev
   ```
5. Abre la dirección que aparece (por ejemplo `http://localhost:5173/yaguarquiz/`).

## Pruebas

```bash
npm test        # pruebas unitarias (importación de Excel, etc.)
```

`scripts/make-test-list.mjs` genera `lista_prueba_40_con_2_errores.xlsx` y `scripts/make-test-questions.mjs` genera `preguntas_prueba_30.xlsx` (5 preguntas de cada tipo) para probar las importaciones.

## Seguridad

- Las claves secretas (`sb_secret_...`, contraseña de la base de datos) **nunca** se suben al repositorio.
- La única clave de Supabase que usa la página es la `publishable key` (sb_publishable_...), que es pública por diseño;
  la protección real la dan las reglas RLS de la base de datos.
- Las respuestas correctas nunca se envían al navegador del estudiante antes de cerrar la pregunta: el estudiante no puede
  leer ninguna tabla, solo llama funciones que validan su ficha de juego. La corrección, el tiempo (reloj del servidor) y los
  puntos se calculan en el servidor; una respuesta repetida o tardía se rechaza.

## Identidad visual

| Uso | Color | HEX |
|---|---|---|
| Institucional | Azul UAP | `#1F3864` |
| Institucional | Rojo UAP | `#8B1A1A` |
| Escudo | Verde | `#1B7339` |
| Escudo | Oro | `#C9A23A` |
| Texto | Plomo | `#4D4D4D` |
| Juego | Coral · Eléctrico · Mango · Selva | `#FF3355` · `#2D7DFF` · `#FFB800` · `#1DBF73` |

Tipografías: **Outfit** (títulos) e **Inter** (textos), incluidas en el proyecto (no dependen de internet).

## Licencia

MIT — ver `LICENSE`.
