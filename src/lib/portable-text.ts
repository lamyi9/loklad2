// Renders the Portable Text produced by the Sanity Studio ("Description" field)
// to HTML. Supports exactly what studio/schemaTypes/blockContent.ts allows.
// No dependencies, so the build does not need extra packages.

type Span = { _type: 'span'; text?: string; marks?: string[] }
type MarkDef = { _key: string; _type: string; href?: string }
type Block = {
  _type: string
  style?: string
  listItem?: 'bullet' | 'number'
  level?: number
  children?: Span[]
  markDefs?: MarkDef[]
}

const BLOCK_TAGS: Record<string, string> = {
  normal: 'p',
  h1: 'h2', // editors only get h2-h4; h1 is reserved for the page title
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  blockquote: 'blockquote',
}
const DECORATORS: Record<string, string> = { strong: 'strong', em: 'em', code: 'code', underline: 'u', 'strike-through': 's' }

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHref(href: string | undefined): string | null {
  if (!href) return null
  const h = href.trim()
  return /^(https?:|mailto:|\/|#)/i.test(h) ? h : null
}

function renderSpans(block: Block): string {
  const defs = new Map((block.markDefs ?? []).map((d) => [d._key, d]))
  let html = ''
  for (const span of block.children ?? []) {
    if (span._type !== 'span') continue
    let out = escapeHtml(span.text ?? '').replace(/\n/g, '<br>')
    // Apply marks inside-out so the first mark is the outermost tag
    for (const mark of [...(span.marks ?? [])].reverse()) {
      const tag = DECORATORS[mark]
      if (tag) {
        out = `<${tag}>${out}</${tag}>`
        continue
      }
      const def = defs.get(mark)
      if (def?._type === 'link') {
        const href = safeHref(def.href)
        if (href) {
          const external = /^https?:/i.test(href)
          out = `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${out}</a>`
        }
      }
    }
    html += out
  }
  return html
}

export function portableTextToHtml(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  let html = ''
  // Stack of open lists: [{ type, level }]
  const open: { tag: string; level: number }[] = []
  const closeTo = (level: number) => {
    while (open.length && open[open.length - 1].level > level) {
      html += `</li></${open.pop()!.tag}>`
    }
  }

  for (const b of blocks as Block[]) {
    if (!b || b._type !== 'block') continue
    if (b.listItem) {
      const level = Math.max(1, b.level ?? 1)
      const tag = b.listItem === 'number' ? 'ol' : 'ul'
      closeTo(level)
      const top = open[open.length - 1]
      if (top && top.level === level && top.tag !== tag) {
        html += `</li></${open.pop()!.tag}>`
      }
      const cur = open[open.length - 1]
      if (cur && cur.level === level) {
        html += `</li><li>`
      } else {
        html += `<${tag}><li>`
        open.push({ tag, level })
      }
      html += renderSpans(b)
      continue
    }
    closeTo(0)
    const tag = BLOCK_TAGS[b.style ?? 'normal'] ?? 'p'
    html += `<${tag}>${renderSpans(b)}</${tag}>\n`
  }
  closeTo(0)
  return html
}
