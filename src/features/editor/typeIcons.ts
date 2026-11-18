import { CheckSquare, CircleDot, Image, ListOrdered, ToggleLeft, Type } from 'lucide-react'
import type { QuestionType } from '../quizzes/questionModel'

export const TYPE_ICONS: Record<QuestionType, typeof Type> = {
  single: CircleDot,
  multiple: CheckSquare,
  true_false: ToggleLeft,
  short_text: Type,
  ordering: ListOrdered,
  image_choice: Image,
}
