import { buildWorkbook, downloadBlob, headerCell } from '../../lib/excel'
import { QUESTION_HEADERS, questionsToMatrix } from './questionImport'
import type { EditorQuestion } from './questionModel'

/** Exporta una evaluación al mismo formato de la plantilla (sirve de respaldo y para compartir). */
export async function exportQuizToExcel(title: string, questions: EditorQuestion[]) {
  const blob = await buildWorkbook([
    {
      sheet: 'Preguntas',
      data: [QUESTION_HEADERS.map((h) => headerCell(h)), ...questionsToMatrix(questions)],
      columns: [{ width: 14 }, { width: 48 }, { width: 30 }, ...Array(6).fill({ width: 22 }), { width: 22 }, { width: 11 }, { width: 9 }, { width: 36 }, { width: 11 }, { width: 22 }],
      stickyRowsCount: 1,
    },
  ])
  const safe = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase()
  downloadBlob(blob, `evaluacion_${safe || 'yaguarquiz'}.xlsx`)
}
