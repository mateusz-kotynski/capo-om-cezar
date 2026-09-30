import { describe, expect, it } from 'vitest'

import { en } from './messages/en'
import { pl } from './messages/pl'

/** Flatten a dictionary into `path -> string` leaves (plural groups flatten to `path.one` ...). */
function leaves(node: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof node === 'string') {
    out.set(prefix, node)
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      for (const [path, text] of leaves(value, prefix ? `${prefix}.${key}` : key)) out.set(path, text)
    }
  }
  return out
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort()

// Deliberately empty in Polish: the English "the <label> label" sentence ends with a word the
// Polish phrasing ("dodał(a) etykietę <label>") does not need.
const ALLOWED_EMPTY_PL = new Set(['forge.thread.label'])

describe('message dictionaries', () => {
  const enLeaves = leaves(en)
  const plLeaves = leaves(pl)

  it('have exactly the same keys (the type system enforces it; this pins the runtime shape)', () => {
    expect([...plLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort())
  })

  it('use the same {placeholders} in both languages, key by key', () => {
    const mismatched = [...enLeaves.entries()]
      .filter(([path, text]) => placeholders(text).join() !== placeholders(plLeaves.get(path) ?? '').join())
      .map(([path]) => path)
    expect(mismatched).toEqual([])
  })

  it('never ship an empty Polish string', () => {
    const empty = [...plLeaves.entries()]
      .filter(([path, text]) => text.trim() === '' && !ALLOWED_EMPTY_PL.has(path))
      .map(([path]) => path)
    expect(empty).toEqual([])
  })

  it('give every Polish plural group all four forms', () => {
    const groups = new Set(
      [...plLeaves.keys()].filter((path) => path.endsWith('.few')).map((path) => path.slice(0, -'.few'.length)),
    )
    for (const group of groups) {
      for (const form of ['one', 'few', 'many', 'other']) {
        expect(plLeaves.get(`${group}.${form}`), `${group}.${form}`).toBeTruthy()
      }
    }
  })
})
