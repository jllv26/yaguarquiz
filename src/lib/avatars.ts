/** Avatares: fauna amazónica de Pando. */
export const ANIMALS = [
  { emoji: '🐆', name: 'Jaguar' },
  { emoji: '🦜', name: 'Paraba' },
  { emoji: '🐒', name: 'Mono' },
  { emoji: '🦥', name: 'Perezoso' },
  { emoji: '🐊', name: 'Lagarto' },
  { emoji: '🐢', name: 'Peta' },
  { emoji: '🐍', name: 'Boa' },
  { emoji: '🐬', name: 'Bufeo' },
  { emoji: '🦋', name: 'Mariposa' },
  { emoji: '🐸', name: 'Rana' },
  { emoji: '🦉', name: 'Búho' },
  { emoji: '🐟', name: 'Pacú' },
  { emoji: '🦦', name: 'Londra' },
  { emoji: '🐜', name: 'Tucandera' },
  { emoji: '🦅', name: 'Harpía' },
  { emoji: '🐗', name: 'Taitetú' },
] as const

export const AVATAR_COLORS = ['#1B7339', '#1F3864', '#8B1A1A', '#C9A23A', '#2D7DFF', '#7C3AED', '#14B8A6', '#FF3355', '#E07A1F', '#0f8a50']

export function randomAvatar() {
  return {
    animal: ANIMALS[Math.floor(Math.random() * ANIMALS.length)].emoji,
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  }
}
