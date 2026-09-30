import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RichText } from '@/components/rich-text'

afterEach(cleanup)

describe('RichText', () => {
  it('renders the slots and keeps every space around them', () => {
    const { container } = render(
      <p>
        <RichText
          text="Tag repos in <link>Settings → Projects</link> to group them."
          tags={{ link: (label) => <a href="/x">{label}</a> }}
        />
      </p>,
    )
    expect(container.innerHTML).toBe('<p>Tag repos in <a href="/x">Settings → Projects</a> to group them.</p>')
  })

  it('handles several slots and a slot at either end', () => {
    const { container } = render(
      <p>
        <RichText
          text="<code>gh</code> and <code>gh auth login</code>"
          tags={{ code: (c) => <code>{c}</code> }}
        />
      </p>,
    )
    expect(container.innerHTML).toBe('<p><code>gh</code> and <code>gh auth login</code></p>')
  })

  it('leaves unknown tags as plain text and never emits markup', () => {
    const { container } = render(
      <p>
        <RichText text="a <b>bold</b> <constructor>x</constructor>" tags={{ link: (c) => <a>{c}</a> }} />
      </p>,
    )
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toBe('a <b>bold</b> <constructor>x</constructor>')
  })
})
