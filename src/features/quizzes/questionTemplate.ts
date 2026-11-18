import { buildWorkbook, downloadBlob, headerCell, noteCell, titleCell } from '../../lib/excel'
import { QUESTION_HEADERS } from './questionImport'

const EXAMPLES: (string | number | null)[][] = [
  ['single', '¿Cuál es la capital del departamento de Pando?', null, 'Cobija', 'Riberalta', 'Trinidad', 'Puerto Rico', null, null, 1, 20, 1000, 'Cobija es la capital de Pando.', 'fácil', 'pando, geografía'],
  ['multiple', '¿Cuáles son hojas de cálculo?', null, 'Excel', 'Word', 'Google Sheets', 'PowerPoint', null, null, '1,3', 30, 1000, 'Excel y Google Sheets.', 'media', 'ofimática'],
  ['true_false', 'Una contraseña segura tiene al menos 12 caracteres.', null, null, null, null, null, null, null, 'V', 10, 1000, null, 'fácil', 'seguridad'],
  ['short_text', '¿Qué fruto amazónico exporta principalmente Pando?', null, null, null, null, null, null, null, 'castaña|almendra|nuez de brasil', 30, 2000, 'La castaña.', 'media', 'pando'],
  ['ordering', 'Ordena los pasos para enviar un correo', null, 'Escribir destinatario', 'Adjuntar archivo', 'Revisar', 'Enviar', null, null, null, 45, 1000, 'Si dejas vacía "correcta", el orden de las columnas es el correcto.', 'media', 'correo'],
  ['image_choice', '¿Cuál es el escudo de la UAP?', null, 'escudo_uap.png', 'escudo_otro.png', 'https://ejemplo.com/logo.png', null, null, null, 1, 20, 1000, 'Imágenes del ZIP o direcciones web.', 'fácil', 'uap'],
]

/** Genera plantilla_preguntas.xlsx con ejemplos de cada tipo e instrucciones. */
export function buildQuestionTemplate(): Promise<Blob> {
  const instructions: unknown[][] = [
    [titleCell('Plantilla de preguntas — YaguarQuiz UAP'), null],
    [null, null],
    [headerCell('Columna'), headerCell('Qué escribir')],
    ['tipo', noteCell('single (una correcta) · multiple (varias correctas) · true_false (V/F) · short_text (respuesta escrita) · ordering (ordenar) · image_choice (opciones con imagen)')],
    ['pregunta', noteCell('Obligatorio. El enunciado.')],
    ['imagen', noteCell('Opcional. Dirección web (https://…) o el nombre de un archivo que viene en el ZIP (ej. foto1.jpg).')],
    ['opcion_1 … opcion_6', noteCell('Entre 2 y 6 opciones, sin dejar columnas vacías en medio. En image_choice cada opción es una imagen (nombre en el ZIP o dirección web). En true_false y short_text se dejan vacías.')],
    ['correcta', noteCell('single / image_choice: número de la opción (2) · multiple: números separados por coma (1,3) · true_false: V o F · short_text: respuestas aceptadas separadas por | (Cobija|cobija pando) · ordering: orden correcto con números (3,1,4,2) o vacío si las opciones ya están en orden.')],
    ['tiempo_seg', noteCell('Opcional (5 a 600). Si está vacío: 20 segundos. Sugeridos: 5, 10, 20, 30, 45, 60, 90, 120.')],
    ['puntos', noteCell('Opcional: 1000 (estándar), 2000 (doble) o 0 (sin puntos). Si está vacío: 1000.')],
    ['explicacion', noteCell('Opcional. Se muestra al revelar la respuesta.')],
    ['dificultad', noteCell('Opcional: fácil, media o difícil.')],
    ['etiquetas', noteCell('Opcional. Palabras separadas por coma, para buscar en el banco de preguntas.')],
    [null, null],
    [titleCell('Imágenes con ZIP'), null],
    [noteCell('Pon todas las imágenes en una carpeta, comprímela en .zip y súbela junto al Excel. El sistema las reduce (máx. 1600 px, formato WebP) y las asocia por nombre.'), null],
    [noteCell('Las respuestas escritas ignoran mayúsculas, tildes y espacios de más: "Cobija", "cobija" y "COBIJA " valen igual.'), null],
  ]
  return buildWorkbook([
    {
      sheet: 'Preguntas',
      data: [QUESTION_HEADERS.map((h) => headerCell(h)), ...EXAMPLES],
      columns: [{ width: 14 }, { width: 48 }, { width: 18 }, ...Array(6).fill({ width: 20 }), { width: 22 }, { width: 11 }, { width: 9 }, { width: 36 }, { width: 11 }, { width: 22 }],
      stickyRowsCount: 1,
    },
    { sheet: 'Instrucciones', data: instructions as never, columns: [{ width: 22 }, { width: 110 }] },
  ])
}

export async function downloadQuestionTemplate() {
  downloadBlob(await buildQuestionTemplate(), 'plantilla_preguntas.xlsx')
}
