import { blockedWords } from '../data/blockedWords'

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

export const containsBlockedWord = (value: string): boolean => {
  const candidate = normalize(value)
  return blockedWords.some((word) => candidate.includes(word))
}

export const validateName = (value: string, label = 'Name'): string | null => {
  const trimmed = value.trim()

  if (!trimmed) {
    return `${label} is required`
  }

  if (containsBlockedWord(trimmed)) {
    return `${label} contains blocked language`
  }

  if (trimmed.length > 40) {
    return `${label} is too long`
  }

  return null
}
