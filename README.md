# AmazoQuiz UAP

Plataforma **gratuita** de evaluaciones gamificadas (estilo Kahoot, Wayground y Educaplay) de la
**Universidad Amazónica de Pando** – Cobija, Pando, Bolivia.

Docente responsable: **Ing. Jimmy Luis Laruta Villarreal**

🌐 Sitio publicado: **https://jllv26.github.io/amazoquiz-uap/**

---

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 0. Base | Proyecto, sistema de diseño, página de inicio, publicación automática | ✅ Lista |
| 1. BD y login | Supabase, seguridad (RLS), login del docente | ⏳ Siguiente (proyecto Supabase ya creado) |
| 2. Gestión académica | Gestiones, periodos, asignaturas, listas de estudiantes por Excel | — |
| 3. Editor y banco | Editor visual, carga masiva de preguntas desde Excel | — |
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
| `/#/admin` | Docente: panel (Fase 1) |
| `/#/diseno` | Revisión del sistema de diseño |

> Se usa `#` en las direcciones para que recargar la página nunca dé error 404 en GitHub Pages.

---

## Cómo se publica

Cada vez que se sube un cambio a la rama `main`, GitHub Actions compila el proyecto y lo publica
solo en GitHub Pages (archivo `.github/workflows/deploy.yml`). El avance se ve en la pestaña
**Actions** del repositorio.

## Trabajar en tu computadora (opcional)

1. Instala **Node.js 22** desde <https://nodejs.org> (versión LTS).
2. Descarga el proyecto:
   ```bash
   git clone https://github.com/jllv26/amazoquiz-uap.git
   cd amazoquiz-uap
   npm install
   ```
3. Copia `.env.example` como `.env` (los valores de Supabase se completan en la Fase 1).
4. Inicia el modo de desarrollo:
   ```bash
   npm run dev
   ```
5. Abre la dirección que aparece (por ejemplo `http://localhost:5173/amazoquiz-uap/`).

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
