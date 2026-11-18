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
| 3. Editor y banco | Editor visual, carga masiva de preguntas desde Excel | ⏳ Siguiente |
| 4. Juego en vivo | Sala, PIN/QR, partida en tiempo real, puntaje en el servidor | — |
| 5. Examen y tarea | Autoritmo, tiempo total, apertura/cierre automático, anti-copia | — |
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
- Migraciones: `0001` esquema + RLS, `0002` datos de ejemplo, `0003` gestión académica (importar estudiantes, plan de calificación).
- Pruebas de seguridad: `tests/sql/10_rls_test.sql` y `tests/sql/20_academic_test.sql` (se ejecutan en un PostgreSQL local con
  `tests/sql/00_supabase_stub.sql`).

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

`scripts/make-test-list.mjs` genera `lista_prueba_40_con_2_errores.xlsx` para probar la importación.

## Seguridad

- Las claves secretas (`sb_secret_...`, contraseña de la base de datos) **nunca** se suben al repositorio.
- La única clave de Supabase que usa la página es la `publishable key` (sb_publishable_...), que es pública por diseño;
  la protección real la dan las reglas RLS de la base de datos.
- Las respuestas correctas nunca se envían al navegador del estudiante antes de tiempo (Fase 4).

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
