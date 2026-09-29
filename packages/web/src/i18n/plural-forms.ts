/**
 * Every plural-aware message leaf carries all four CLDR cardinal categories `Intl.PluralRules`
 * ever returns for English or Polish (`Intl.PluralRules('pl').select` only ever answers `one`,
 * `few`, `many` or `other` for a cardinal count — never `zero`/`two`, which are dual/Semitic-
 * language categories neither locale here uses). English repeats its "other" text under
 * `few`/`many`: the shape stays identical across locales so `tn()`'s lookup never has to
 * special-case one, and a Polish form is never missing one of its own three categories by
 * accident (see `en.ts`/`pl.ts` — both are typed against `Messages`, which uses this shape for
 * every plural leaf).
 */
export interface PluralForms {
  one: string
  few: string
  many: string
  other: string
}
