import { describe, expect, it } from 'vitest'

import { interpolate, pluralCategory, resolveMessage, resolvePlural } from './format'

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Hello {name}', { name: 'Ola' })).toBe('Hello Ola')
  })

  it('substitutes numbers', () => {
    expect(interpolate('#{position} in queue', { position: 3 })).toBe('#3 in queue')
  })

  it('leaves an unmatched placeholder verbatim rather than blanking it', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}')
  })

  it('is a no-op with no params', () => {
    expect(interpolate('Plain text')).toBe('Plain text')
  })

  it('substitutes every occurrence of a repeated placeholder', () => {
    expect(interpolate('{a} and {a}', { a: 'x' })).toBe('x and x')
  })
})

describe('pluralCategory', () => {
  it.each([
    [1, 'one'],
    [2, 'few'],
    [3, 'few'],
    [4, 'few'],
    [5, 'many'],
    [0, 'many'],
    [21, 'many'],
    [22, 'few'],
    [25, 'many'],
  ] as const)('pl: %i → %s', (count, expected) => {
    expect(pluralCategory('pl', count)).toBe(expected)
  })

  it.each([
    [1, 'one'],
    [0, 'other'],
    [2, 'other'],
    [5, 'other'],
  ] as const)('en: %i → %s', (count, expected) => {
    expect(pluralCategory('en', count)).toBe(expected)
  })
})

describe('resolveMessage (t)', () => {
  it('resolves an English leaf', () => {
    expect(resolveMessage('en', 'nav.tasks')).toBe('Tasks')
  })

  it('resolves the same key in Polish', () => {
    expect(resolveMessage('pl', 'nav.tasks')).toBe('Zadania')
  })

  it('interpolates params into the resolved template', () => {
    expect(resolveMessage('en', 'tasksPage.emptySearchSubtitle', { query: 'auth' })).toBe(
      'No tasks match "auth".',
    )
  })

  it('falls back to the raw path for an unknown key rather than throwing', () => {
    expect(resolveMessage('en', 'nope.not.a.key')).toBe('nope.not.a.key')
  })
})

describe('resolvePlural (tn) — the requirement worked example', () => {
  it('renders "1 zadanie, 2 zadania, 5 zadań"', () => {
    expect(resolvePlural('pl', 'tasksPage.count', 1)).toBe('1 zadanie')
    expect(resolvePlural('pl', 'tasksPage.count', 2)).toBe('2 zadania')
    expect(resolvePlural('pl', 'tasksPage.count', 5)).toBe('5 zadań')
  })

  it('covers every Polish cardinal category, not just the three worked examples', () => {
    expect(resolvePlural('pl', 'tasksPage.count', 3)).toBe('3 zadania')
    expect(resolvePlural('pl', 'tasksPage.count', 4)).toBe('4 zadania')
    expect(resolvePlural('pl', 'tasksPage.count', 0)).toBe('0 zadań')
    expect(resolvePlural('pl', 'tasksPage.count', 11)).toBe('11 zadań')
    expect(resolvePlural('pl', 'tasksPage.count', 22)).toBe('22 zadania')
  })

  it('renders the English one/other split for the same key', () => {
    expect(resolvePlural('en', 'tasksPage.count', 1)).toBe('1 task')
    expect(resolvePlural('en', 'tasksPage.count', 2)).toBe('2 tasks')
    expect(resolvePlural('en', 'tasksPage.count', 5)).toBe('5 tasks')
    expect(resolvePlural('en', 'tasksPage.count', 0)).toBe('0 tasks')
  })

  it('makes {count} available to the template without it being repeated in params', () => {
    expect(resolvePlural('pl', 'nav.unreadTasksTitle', 1)).toBe('1 nieprzeczytane zakończone zadanie')
    expect(resolvePlural('pl', 'nav.unreadTasksTitle', 5)).toBe('5 nieprzeczytanych zakończonych zadań')
  })
})
