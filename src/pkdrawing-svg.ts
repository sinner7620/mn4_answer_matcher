interface Field { n: number; w: number; v: number | Uint8Array }
interface Point { x: number; y: number; width: number }
interface Stroke { points: Point[]; color: string }

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function decodeBase64(value: string): Uint8Array {
  const text = String(value || "").replace(/^data:[^,]+,/, "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "")
  if (!text || text.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(text)) throw new Error("invalid-base64")
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const character of text) {
    if (character === "=") break
    const index = BASE64.indexOf(character)
    if (index < 0) throw new Error("invalid-base64-character")
    buffer = (buffer << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 255)
    }
  }
  return new Uint8Array(bytes)
}

function unsigned(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0
  for (let index = 0; index < length; index++) value = value * 256 + bytes[offset + index]
  return value
}

function ascii(bytes: Uint8Array, offset: number, length: number, wide = false): string {
  let value = ""
  for (let index = 0; index < length; index++) value += String.fromCharCode(wide ? unsigned(bytes, offset + index * 2, 2) : bytes[offset + index])
  return value
}

function binaryPlist(bytes: Uint8Array): any {
  if (bytes.length < 40 || ascii(bytes, 0, 8) !== "bplist00") throw new Error("invalid-bplist")
  const trailer = bytes.length - 32
  const offsetSize = bytes[trailer + 6]
  const refSize = bytes[trailer + 7]
  const count = unsigned(bytes, trailer + 8, 8)
  const top = unsigned(bytes, trailer + 16, 8)
  const table = unsigned(bytes, trailer + 24, 8)
  if (!offsetSize || !refSize || count > 100000 || table >= bytes.length) throw new Error("invalid-bplist-trailer")
  const offsets = Array.from({ length: count }, (_, index) => unsigned(bytes, table + index * offsetSize, offsetSize))
  const cache: any[] = []
  function objectLength(position: number, info: number): [number, number] {
    if (info < 15) return [info, position]
    const marker = bytes[position++]
    const size = Math.pow(2, marker & 15)
    if (marker >> 4 !== 1 || size > 8) throw new Error("invalid-bplist-length")
    return [unsigned(bytes, position, size), position + size]
  }
  function parse(index: number): any {
    if (cache[index] !== undefined) return cache[index]
    let position = offsets[index]
    const marker = bytes[position++]
    const kind = marker >> 4
    const info = marker & 15
    let result: any
    if (kind === 0) result = info === 8 ? false : info === 9 ? true : null
    else if (kind === 1) result = unsigned(bytes, position, Math.pow(2, info))
    else if (kind === 2) {
      const size = Math.pow(2, info)
      const view = new DataView(bytes.buffer, bytes.byteOffset + position, size)
      result = size === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false)
    } else if (kind === 3) result = new DataView(bytes.buffer, bytes.byteOffset + position, 8).getFloat64(0, false)
    else if (kind === 4 || kind === 5 || kind === 6) {
      const [length, start] = objectLength(position, info)
      result = kind === 4 ? bytes.slice(start, start + length) : ascii(bytes, start, length, kind === 6)
    } else if (kind === 8) result = { uid: unsigned(bytes, position, info + 1) }
    else if (kind === 10) {
      const [length, start] = objectLength(position, info)
      result = []
      cache[index] = result
      for (let item = 0; item < length; item++) result.push(parse(unsigned(bytes, start + item * refSize, refSize)))
    } else if (kind === 13) {
      const [length, start] = objectLength(position, info)
      result = {}
      cache[index] = result
      const values = start + length * refSize
      for (let item = 0; item < length; item++) result[String(parse(unsigned(bytes, start + item * refSize, refSize)))] = parse(unsigned(bytes, values + item * refSize, refSize))
    } else throw new Error("unsupported-bplist-object")
    cache[index] = result
    return result
  }
  return parse(top)
}

function drawingData(encoded: string): Uint8Array {
  const raw = decodeBase64(encoded)
  if (raw[0] === 119 && raw[1] === 114 && raw[2] === 100) return raw
  function unarchive(bytes: Uint8Array): any {
    const archive = binaryPlist(bytes)
    const objects = archive?.$objects
    const rootRef = archive?.$top?.root
    if (!objects || typeof rootRef?.uid !== "number") throw new Error("missing-archive-root")
    const resolve = (value: any) => value && typeof value.uid === "number" ? objects[value.uid] : value
    const root = resolve(rootRef)
    if (root?.["NS.data"] instanceof Uint8Array) return root["NS.data"]
    if (root?.["NS.keys"] && root?.["NS.objects"]) {
      const dictionary: any = {}
      root["NS.keys"].forEach((key: any, index: number) => { dictionary[String(resolve(key))] = resolve(root["NS.objects"][index]) })
      return dictionary
    }
    return root
  }
  const first = unarchive(raw)
  if (first instanceof Uint8Array && first[0] === 119 && first[1] === 114 && first[2] === 100) return first
  const second = first instanceof Uint8Array ? unarchive(first) : first
  const content = second?.drawing2 || second?.drawing1
  if (!(content instanceof Uint8Array)) throw new Error("missing-drawing-data")
  return content
}

function fields(bytes: Uint8Array, start = 0): Field[] {
  const output: Field[] = []
  let position = start
  function varint(): number {
    let value = 0
    let multiplier = 1
    let byte = 0
    do {
      if (position >= bytes.length) throw new Error("truncated-varint")
      byte = bytes[position++]
      value += (byte & 127) * multiplier
      multiplier *= 128
    } while (byte & 128)
    return value
  }
  while (position < bytes.length) {
    const key = varint()
    const n = Math.floor(key / 8)
    const w = key & 7
    let value: number | Uint8Array
    if (w === 0) value = varint()
    else if (w === 1) { value = bytes.slice(position, position + 8); position += 8 }
    else if (w === 2) { const length = varint(); value = bytes.slice(position, position + length); position += length }
    else if (w === 5) { value = bytes.slice(position, position + 4); position += 4 }
    else throw new Error("unsupported-wire-type")
    output.push({ n, w, v: value })
  }
  return output
}

function all(items: Field[], n: number): Field[] { return items.filter(item => item.n === n) }
function one(items: Field[], n: number): Field | undefined { const found = all(items, n); return found[found.length - 1] }
function f32(value: Uint8Array, offset = 0): number { return new DataView(value.buffer, value.byteOffset + offset, 4).getFloat32(0, true) }

function decodeStrokes(raw: Uint8Array): Stroke[] {
  if (raw[0] !== 119 || raw[1] !== 114 || raw[2] !== 100) throw new Error("invalid-drawing-header")
  const root = fields(raw, 3)
  const colors = all(root, 4).map(item => {
    const colorField = one(fields(item.v as Uint8Array), 1)
    if (!colorField || colorField.w !== 2) return "rgba(25,25,25,1)"
    const rgba = fields(colorField.v as Uint8Array)
    const values = [1, 2, 3, 4].map((n, index) => {
      const field = one(rgba, n)
      return field?.w === 5 ? f32(field.v as Uint8Array) : index === 3 ? 1 : 0
    })
    const scale = Math.max(values[0], values[1], values[2]) <= 1.01 ? 255 : 1
    return `rgba(${Math.round(values[0] * scale)},${Math.round(values[1] * scale)},${Math.round(values[2] * scale)},${Math.max(0, Math.min(1, values[3]))})`
  })
  const strokes: Stroke[] = []
  for (const strokeField of all(root, 5)) {
    const stroke = fields(strokeField.v as Uint8Array)
    const ink = one(stroke, 4)
    const path = one(stroke, 5)
    const transformField = one(stroke, 7)
    if (!path) continue
    const pathFields = fields(path.v as Uint8Array)
    const count = Number(one(pathFields, 3)?.v || 0)
    const packed = one(pathFields, 7)?.v as Uint8Array
    if (!count || !packed) continue
    const stride = packed.length / count
    if (![12, 14, 16, 18, 20, 22].includes(stride)) continue
    const transform = [1, 0, 0, 1, 0, 0]
    if (transformField) {
      const transformFields = fields(transformField.v as Uint8Array)
      for (let index = 1; index <= 6; index++) {
        const value = one(transformFields, index)
        if (value?.w === 5) transform[index - 1] = f32(value.v as Uint8Array)
      }
    }
    const points: Point[] = []
    for (let index = 0; index < count; index++) {
      const offset = index * stride
      const x = f32(packed, offset)
      const y = f32(packed, offset + 4)
      const width = stride >= 16 ? Math.abs(f32(packed, offset + 12)) : 2
      points.push({ x: transform[0] * x + transform[2] * y + transform[4], y: transform[1] * x + transform[3] * y + transform[5], width: Number.isFinite(width) && width > 0 && width < 100 ? width : 2 })
    }
    if (points.length) strokes.push({ points, color: colors[Number(ink?.v || 0)] || "rgba(25,25,25,1)" })
  }
  return strokes
}

function base64Ascii(value: string): string {
  let result = ""
  for (let offset = 0; offset < value.length; offset += 3) {
    const a = value.charCodeAt(offset) & 255
    const hasB = offset + 1 < value.length
    const hasC = offset + 2 < value.length
    const bits = (a << 16) | ((hasB ? value.charCodeAt(offset + 1) : 0) << 8) | (hasC ? value.charCodeAt(offset + 2) : 0)
    result += BASE64[bits >> 18 & 63] + BASE64[bits >> 12 & 63] + (hasB ? BASE64[bits >> 6 & 63] : "=") + (hasC ? BASE64[bits & 63] : "=")
  }
  return result
}

export function drawingSvgDataUri(encoded: string): string {
  const strokes = decodeStrokes(drawingData(encoded))
  if (!strokes.length) throw new Error("empty-drawing")
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  strokes.forEach(stroke => stroke.points.forEach(point => {
    minX = Math.min(minX, point.x - point.width); minY = Math.min(minY, point.y - point.width)
    maxX = Math.max(maxX, point.x + point.width); maxY = Math.max(maxY, point.y + point.width)
  }))
  const padding = 8
  const width = Math.max(1, maxX - minX + padding * 2)
  const height = Math.max(1, maxY - minY + padding * 2)
  const paths = strokes.map(stroke => {
    const path = stroke.points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
    const lineWidth = Math.max(1, stroke.points.reduce((sum, point) => sum + point.width, 0) / stroke.points.length)
    return `<path d="${path}" fill="none" stroke="${stroke.color}" stroke-width="${lineWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(1)}" height="${height.toFixed(1)}" viewBox="${(minX - padding).toFixed(1)} ${(minY - padding).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}"><rect x="${(minX - padding).toFixed(1)}" y="${(minY - padding).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="white"/>${paths}</svg>`
  return `data:image/svg+xml;base64,${base64Ascii(svg)}`
}
