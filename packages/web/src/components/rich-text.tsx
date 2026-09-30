import * as React from 'react'

/** Renders one translated sentence that embeds inline elements — a link, a `<code>`, emphasis —
 *  without splitting it into prefix/suffix fragments (which force one word order and one set of
 *  spaces on every language). The message marks each slot with a tag, `Open <link>Settings</link>`,
 *  and the caller supplies what each tag becomes:
 *
 *      <RichText text={t('x.hint')} tags={{ link: (label) => <Link to="/y">{label}</Link> }} />
 *
 *  Tags are flat (no nesting) and only the names in `tags` are recognised; anything else, and any
 *  text outside a tag, is emitted as plain text — never as HTML. */
export type RichTextTags = Record<string, (content: string) => React.ReactNode>

const TAG = /<([a-z]\w*)>(.*?)<\/\1>/gs

export function RichText({ text, tags }: { text: string; tags: RichTextTags }): React.ReactElement {
  const parts: React.ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(TAG)) {
    const render = Object.hasOwn(tags, match[1]!) ? tags[match[1]!] : undefined
    if (!render) {
      // A slot the caller does not handle would render as literal text — say so in dev.
      if (import.meta.env?.DEV) console.warn(`RichText: no handler for <${match[1]}> in "${text.slice(0, 60)}"`)
      continue
    }
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<React.Fragment key={index++}>{render(match[2]!)}</React.Fragment>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
