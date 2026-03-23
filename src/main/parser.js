import mammoth from 'mammoth'
import sharp from 'sharp'

const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Section Title'] => h1:fresh",
  "p[style-name='Subsection Title'] => h2:fresh",
  "p[style-name='Subheading'] => h3:fresh"
]

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x'
      const numericValue = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)

      return Number.isNaN(numericValue) ? match : String.fromCodePoint(numericValue)
    }

    return namedEntities[entity.toLowerCase()] ?? match
  })
}

function replaceRepeatedly(value, pattern, replacer) {
  let nextValue = value
  let previousValue = null

  while (nextValue !== previousValue) {
    previousValue = nextValue
    nextValue = nextValue.replace(pattern, replacer)
  }

  return nextValue
}

function convertInline(html) {
  let markdown = html ?? ''

  markdown = markdown.replace(/\r\n?/g, '\n')
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n')

  markdown = replaceRepeatedly(
    markdown,
    /<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, _tagName, innerHtml) => `**${convertInline(innerHtml)}**`
  )

  markdown = replaceRepeatedly(
    markdown,
    /<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, _tagName, innerHtml) => `*${convertInline(innerHtml)}*`
  )

  markdown = replaceRepeatedly(
    markdown,
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (_match, attributes, innerHtml) => {
      const linkText = convertInline(innerHtml)
      const hrefMatch = attributes.match(/\bhref=(['"])(.*?)\1/i)
      const href = hrefMatch ? decodeHtmlEntities(hrefMatch[2]) : ''

      return href ? `[${linkText}](${href})` : linkText
    }
  )

  markdown = markdown.replace(/<img\b[^>]*src=(['"])(.*?)\1[^>]*\/?>/gi, (_match, _quote, src) => {
    const normalizedSource = decodeHtmlEntities(src)
    return /^\[IMAGE_\d+\]$/.test(normalizedSource) ? normalizedSource : '[IMAGE]'
  })

  markdown = markdown.replace(/<\/?(span|html|body|div|sup|sub|u|s|del|ins)[^>]*>/gi, '')
  markdown = markdown.replace(/<[^>]+>/g, '')
  markdown = decodeHtmlEntities(markdown)
  markdown = markdown.replace(/\u00a0/g, ' ')
  markdown = markdown.replace(/[ \t]+\n/g, '\n')
  markdown = markdown.replace(/\n[ \t]+/g, '\n')
  markdown = markdown.replace(/[ \t]{2,}/g, ' ')
  markdown = markdown.replace(/\n{3,}/g, '\n\n')

  return markdown.trim()
}

function convertListItem(html) {
  const normalizedHtml = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<\/?p[^>]*>/gi, '')

  return convertInline(normalizedHtml).replace(/\n+/g, ' ').trim()
}

function convertList(listHtml, ordered) {
  const itemMatches = [...listHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]

  if (itemMatches.length === 0) {
    return ''
  }

  const lines = itemMatches.map((match, index) => {
    const content = convertListItem(match[1])
    const prefix = ordered ? `${index + 1}.` : '-'

    return `${prefix} ${content}`.trimEnd()
  })

  return `${lines.join('\n')}\n\n`
}

function convertTableCell(html) {
  const normalizedCell = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<\/?p[^>]*>/gi, '')

  const markdown = convertInline(normalizedCell)
    .replace(/\n+/g, '<br>')
    .replace(/\|/g, '\\|')

  return markdown || ' '
}

function convertTable(tableHtml) {
  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]

  if (rowMatches.length === 0) {
    return ''
  }

  const rows = rowMatches.map((rowMatch) => {
    const cellMatches = [...rowMatch[1].matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)]
    return cellMatches.map((cellMatch) => convertTableCell(cellMatch[2]))
  })

  const columnCount = Math.max(...rows.map((row) => row.length), 0)
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_unused, index) => row[index] ?? ' ')
  )

  const headerRow = normalizedRows[0]
  const separatorRow = Array.from({ length: columnCount }, () => '---')
  const dataRows = normalizedRows.slice(1)
  const tableLines = [
    `| ${headerRow.join(' | ')} |`,
    `| ${separatorRow.join(' | ')} |`,
    ...dataRows.map((row) => `| ${row.join(' | ')} |`)
  ]

  return `${tableLines.join('\n')}\n\n`
}

function convertParagraphContent(content) {
  const normalizedContent = content
    .replace(/\t+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()

  if (!normalizedContent) {
    return '\n'
  }

  const unorderedMatch = normalizedContent.match(/^[•*-]\s+(.*)$/)

  if (unorderedMatch) {
    return `- ${unorderedMatch[1].trim()}\n`
  }

  const orderedMatch = normalizedContent.match(/^(\d+)[.)]?\s+(.*)$/)

  if (orderedMatch) {
    return `${orderedMatch[1]}. ${orderedMatch[2].trim()}\n`
  }

  return `${normalizedContent}\n\n`
}

function convertBlockHtmlToMarkdown(html) {
  let markdown = html ?? ''

  markdown = markdown.replace(/\r\n?/g, '\n')
  markdown = markdown.replace(/<!--[\s\S]*?-->/g, '')
  markdown = markdown.replace(/<\/?(html|body|thead|tbody|tfoot)[^>]*>/gi, '')

  markdown = replaceRepeatedly(
    markdown,
    /<table[^>]*>([\s\S]*?)<\/table>/gi,
    (_match, tableHtml) => convertTable(tableHtml)
  )

  markdown = replaceRepeatedly(
    markdown,
    /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
    (_match, listHtml) => convertList(listHtml, true)
  )

  markdown = replaceRepeatedly(
    markdown,
    /<ul[^>]*>([\s\S]*?)<\/ul>/gi,
    (_match, listHtml) => convertList(listHtml, false)
  )

  markdown = markdown.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, innerHtml) => {
    const headingLevel = '#'.repeat(Number(level))
    const content = convertInline(innerHtml)
    return content ? `${headingLevel} ${content}\n\n` : ''
  })

  markdown = markdown.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, innerHtml) => {
    const content = convertInline(innerHtml)
    return convertParagraphContent(content)
  })

  markdown = markdown.replace(/<br\s*\/?>/gi, '\n')
  markdown = markdown.replace(/<\/?[^>]+>/g, '')
  markdown = decodeHtmlEntities(markdown)
  markdown = markdown.replace(/[ \t]+\n/g, '\n')
  markdown = markdown.replace(/\n[ \t]+/g, '\n')
  markdown = markdown.replace(/\n{3,}/g, '\n\n')

  return markdown.trim()
}

function getSectionPath(headingStack) {
  const activeHeadings = headingStack.filter(Boolean)
  return activeHeadings.length > 0 ? activeHeadings.join(' > ') : 'Document opening'
}

function detectMarkdownBlockType(segment) {
  const trimmedSegment = segment.trim()

  if (/^#{1,6}\s+/.test(trimmedSegment)) {
    return 'heading'
  }

  if (/^\|/.test(trimmedSegment)) {
    return 'table'
  }

  if (/^[-*+]\s+/.test(trimmedSegment) || /^\d+\.\s+/.test(trimmedSegment)) {
    return 'list'
  }

  if (/^\[IMAGE_\d+\]$/.test(trimmedSegment)) {
    return 'image'
  }

  return 'paragraph'
}

function normalizeMarkdownBlockText(segment, blockType) {
  if (blockType === 'table') {
    const tableSeparatorPattern = /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/
    const rows = segment
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !tableSeparatorPattern.test(line))
      .map((line) =>
        line
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(' | ')
      )

    return rows.join(' / ').trim()
  }

  const normalizedLines = segment
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
    )
    .filter(Boolean)

  const lineJoiner = blockType === 'list' ? ' / ' : ' '

  return normalizedLines
    .join(lineJoiner)
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\[IMAGE_\d+\]/g, '[Image]')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function buildBlocksFromMarkdown(markdown) {
  const segments = (markdown ?? '')
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const headingStack = []
  const blocks = []
  let blockIndex = 1

  for (const segment of segments) {
    const blockType = detectMarkdownBlockType(segment)

    if (blockType === 'heading') {
      const headingMatch = segment.match(/^(#{1,6})\s+(.+)$/)
      const headingLevel = headingMatch ? headingMatch[1].length : 1
      const headingText = normalizeMarkdownBlockText(segment, 'heading')

      headingStack[headingLevel - 1] = headingText
      headingStack.length = headingLevel

      blocks.push({
        id: `p${blockIndex}`,
        type: 'heading',
        section: getSectionPath(headingStack),
        text: headingText,
        markdown: segment
      })
      blockIndex += 1
      continue
    }

    const text = normalizeMarkdownBlockText(segment, blockType)

    if (!text && blockType !== 'image') {
      continue
    }

    blocks.push({
      id: `p${blockIndex}`,
      type: blockType,
      section: getSectionPath(headingStack),
      text: text || '[Image]',
      markdown: segment
    })
    blockIndex += 1
  }

  return blocks
}

export async function parseDocx(filePath) {
  const images = []

  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      styleMap: DOCX_STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const placeholder = `[IMAGE_${images.length + 1}]`
        const sourceBuffer = await image.readAsBuffer()
        const resizedImage = await sharp(sourceBuffer)
          .rotate()
          .resize({
            width: 1024,
            height: 1024,
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 75 })
          .toBuffer()

        images.push({
          placeholder,
          base64: resizedImage.toString('base64'),
          mimeType: 'image/jpeg'
        })

        return { src: placeholder }
      })
    }
  )

  const markdown = convertBlockHtmlToMarkdown(result.value)

  return {
    markdown,
    blocks: buildBlocksFromMarkdown(markdown),
    images
  }
}
