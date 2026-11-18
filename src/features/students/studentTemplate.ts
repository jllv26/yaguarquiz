import { buildWorkbook, downloadBlob, headerCell, noteCell, titleCell } from '../../lib/excel'
import { TEMPLATE_HEADERS } from './studentImport'

/** Genera plantilla_estudiantes.xlsx con una hoja de datos y otra de instrucciones. */
export function buildStudentTemplate(): Promise<Blob> {
  const header = TEMPLATE_HEADERS.map((h) => headerCell(h.header))
  const examples = [0, 1, 2].map((i) => TEMPLATE_HEADERS.map((h) => h.example[i] || null))
  const instructions = [
    [titleCell('Plantilla de estudiantes — YaguarQuiz UAP'), null],
    [null, null],
    [headerCell('Columna'), headerCell('Qué escribir')],
    ['codigo_universitario', noteCell('Obligatorio. Registro universitario (RU). Es la clave: si el estudiante ya existe, se reutiliza y solo se inscribe en la asignatura.')],
    ['ci', noteCell('Opcional. Carnet de identidad. Se usa como segundo dato de verificación en exámenes.')],
    ['apellidos', noteCell('Obligatorio. Apellido paterno y materno.')],
    ['nombres', noteCell('Obligatorio.')],
    ['correo', noteCell('Opcional. Debe tener formato válido (ejemplo@gmail.com).')],
    ['carrera', noteCell('Opcional.')],
    [null, null],
    [titleCell('Consejos'), null],
    [noteCell('• Borra las 3 filas de ejemplo y pega tu lista desde la fila 2.'), null],
    [noteCell('• No cambies los nombres de las columnas de la fila 1.'), null],
    [noteCell('• Si tu lista tiene una sola columna "Apellidos y nombres", también se acepta: el sistema los separa y te pide revisarlos.'), null],
    [noteCell('• También puedes subir un archivo .csv con las mismas columnas.'), null],
  ]
  return buildWorkbook([
    {
      sheet: 'Estudiantes',
      data: [header, ...examples],
      columns: [{ width: 22 }, { width: 14 }, { width: 26 }, { width: 24 }, { width: 30 }, { width: 24 }],
      stickyRowsCount: 1,
    },
    { sheet: 'Instrucciones', data: instructions, columns: [{ width: 26 }, { width: 90 }] },
  ])
}

export async function downloadStudentTemplate() {
  downloadBlob(await buildStudentTemplate(), 'plantilla_estudiantes.xlsx')
}
