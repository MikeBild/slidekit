// Minimal multipart/form-data parser (no dependencies). Returns the content of
// the first file part, or of a field named markdown/file/md, as a UTF-8 string —
// or null if none is found. Sufficient for a single Markdown upload.

function indexOfBuf(buf, sep, from) {
  return buf.indexOf(sep, from)
}

export function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '')
  if (!m) return null
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim())

  const parts = []
  let start = 0
  let idx
  while ((idx = indexOfBuf(buffer, boundary, start)) !== -1) {
    if (idx > start) parts.push(buffer.slice(start, idx))
    start = idx + boundary.length
  }

  for (const part of parts) {
    const headerEnd = indexOfBuf(part, Buffer.from('\r\n\r\n'), 0)
    if (headerEnd < 0) continue
    const header = part.slice(0, headerEnd).toString('utf8')
    if (!/content-disposition/i.test(header)) continue
    const name = /name="([^"]*)"/i.exec(header)?.[1]
    const filename = /filename="([^"]*)"/i.exec(header)?.[1]
    if (filename || name === 'markdown' || name === 'file' || name === 'md') {
      let content = part.slice(headerEnd + 4)
      // strip a single trailing CRLF that precedes the boundary delimiter
      if (
        content.length >= 2 &&
        content[content.length - 2] === 0x0d &&
        content[content.length - 1] === 0x0a
      ) {
        content = content.slice(0, -2)
      }
      return content.toString('utf8')
    }
  }
  return null
}
