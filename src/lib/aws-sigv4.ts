// Minimal AWS Signature Version 4 signer for S3, using Web Crypto only.
// Works in Cloudflare Workers and Node 20+ without the AWS SDK.

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}

/** RFC 3986 encoding of each path segment, as S3 expects. */
export function encodeS3Key(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/')
}

export interface SignOptions {
  method: string
  url: string // already-encoded URL
  headers?: Record<string, string>
  accessKeyId: string
  secretAccessKey: string
  region: string
  service?: string
  payloadHash?: string
  date?: Date
}

/** Returns the headers to send: the given headers plus x-amz-date, x-amz-content-sha256 and Authorization. */
export async function signRequest(o: SignOptions): Promise<Record<string, string>> {
  const service = o.service ?? 's3'
  const url = new URL(o.url)
  const amzDate = (o.date ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const payloadHash = o.payloadHash ?? 'UNSIGNED-PAYLOAD'

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(o.headers ?? {})) headers[k.toLowerCase()] = v
  headers['host'] = url.host
  headers['x-amz-date'] = amzDate
  headers['x-amz-content-sha256'] = payloadHash

  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, ' ')}\n`).join('')
  const signedHeaders = names.join(';')
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeS3Key(k), encodeS3Key(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const canonicalRequest = [o.method.toUpperCase(), url.pathname || '/', query, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${day}/${o.region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  let key = await hmac(enc.encode('AWS4' + o.secretAccessKey), day)
  key = await hmac(key, o.region)
  key = await hmac(key, service)
  key = await hmac(key, 'aws4_request')
  const signature = toHex(await hmac(key, stringToSign))

  const out: Record<string, string> = { ...headers }
  delete out['host'] // fetch sets Host itself
  out['authorization'] = `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return out
}
