// Moves installers that editors upload in Sanity Studio to the S3 bucket.
//
// Flow: an editor uploads a file in a Download field and publishes ->
// a signed Sanity webhook calls /api/sync-downloads -> this code copies every
// uploaded installer to S3, replaces the upload with the S3 link in Sanity,
// and deletes the copy from Sanity. That edit triggers the normal site rebuild.
//
// It only ever copies files that already exist in your Sanity project, so the
// webhook request itself cannot inject anything. Existing S3 files are never
// overwritten (If-None-Match), so a published installer can't be silently replaced.

import { encodeS3Key, signRequest } from './aws-sigv4'

const API_VERSION = 'v2025-02-19'
const TYPES = ['apps', 'browsers', 'communication', 'tools']
const PLATFORM_FOLDERS: Record<string, string> = { android: 'apk', windows: 'windows', mac: 'mac' }

export interface SyncEnv {
  PUBLIC_SANITY_PROJECT_ID: string
  PUBLIC_SANITY_DATASET?: string
  SANITY_WRITE_TOKEN: string
  SANITY_WEBHOOK_SECRET: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
  S3_REGION: string
  /** Optional, e.g. "public-read" if the bucket uses object ACLs instead of a bucket policy. */
  S3_OBJECT_ACL?: string
  /** Optional public base URL for links, default https://<bucket>.s3.<region>.amazonaws.com */
  S3_PUBLIC_BASE_URL?: string
}

export interface SyncResult {
  document: string
  platform: string
  url?: string
  error?: string
}

// ---------------------------------------------------------------- webhook auth

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifies the `sanity-webhook-signature` header: `t=<timestamp>,v1=<sig>` where
 * sig = base64url(HMAC-SHA256(secret, `${t}.${rawBody}`)).
 * No timestamp window is enforced: replaying a request only re-runs an idempotent sync.
 */
export async function verifySanitySignature(rawBody: string, header: string | null, secret: string | undefined): Promise<boolean> {
  if (!header || !secret) return false
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  if (!parts.t || !parts.v1) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${rawBody}`)))
  return timingSafeEqual(base64url(sig), parts.v1)
}

// ---------------------------------------------------------------- helpers

function requireEnv(env: Partial<SyncEnv>): SyncEnv {
  const required: (keyof SyncEnv)[] = [
    'PUBLIC_SANITY_PROJECT_ID',
    'SANITY_WRITE_TOKEN',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET',
    'S3_REGION',
  ]
  const missing = required.filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing settings: ${missing.join(', ')}`)
  return env as SyncEnv
}

/** Keeps file names URL- and S3-friendly: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string | undefined, fallback: string): string {
  const clean = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
  const original = name ?? ''
  const dot = original.lastIndexOf('.')
  const stem = clean(dot > 0 ? original.slice(0, dot) : original)
  const ext = dot > 0 ? clean(original.slice(dot + 1)) : ''
  if (!stem) return fallback // e.g. a name written only in Tibetan script
  return ext ? `${stem}.${ext}` : stem
}

interface Asset {
  _id: string
  url: string
  originalFilename?: string
  size?: number
  mimeType?: string
  sha1hash?: string
  extension?: string
}

interface PendingDoc {
  _id: string
  slug?: string
  draft?: { _id: string; android?: string; windows?: string; mac?: string } | null
  files: { platform: string; asset: Asset }[]
}

const QUERY = `*[_type in $types && !(_id in path("drafts.**")) && !(_id in path("versions.**"))
  && (defined(android.file.asset) || defined(windows.file.asset) || defined(mac.file.asset))]{
  _id,
  "slug": slug.current,
  "draft": *[_id == "drafts." + ^._id][0]{
    _id,
    "android": android.file.asset._ref,
    "windows": windows.file.asset._ref,
    "mac": mac.file.asset._ref
  },
  "files": [
    { "platform": "android", "asset": android.file.asset->{_id, url, originalFilename, size, mimeType, sha1hash, extension} },
    { "platform": "windows", "asset": windows.file.asset->{_id, url, originalFilename, size, mimeType, sha1hash, extension} },
    { "platform": "mac", "asset": mac.file.asset->{_id, url, originalFilename, size, mimeType, sha1hash, extension} }
  ][defined(asset._id)]
}`

declare const FixedLengthStream: undefined | (new (length: number) => { readable: ReadableStream; writable: WritableStream })

// ---------------------------------------------------------------- main

export async function syncDownloads(rawEnv: Partial<SyncEnv>, fetchImpl: typeof fetch = fetch, log: (msg: string) => void = console.log): Promise<SyncResult[]> {
  const env = requireEnv(rawEnv)
  const dataset = env.PUBLIC_SANITY_DATASET || 'production'
  const api = `https://${env.PUBLIC_SANITY_PROJECT_ID}.api.sanity.io/${API_VERSION}/data`
  const auth = { authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` }

  const queryUrl = new URL(`${api}/query/${dataset}`)
  queryUrl.searchParams.set('query', QUERY)
  queryUrl.searchParams.set('$types', JSON.stringify(TYPES))
  queryUrl.searchParams.set('perspective', 'raw')
  const qres = await fetchImpl(queryUrl, { headers: auth })
  if (!qres.ok) throw new Error(`Sanity query failed: ${qres.status} ${await qres.text()}`)
  const docs = ((await qres.json()) as { result: PendingDoc[] }).result

  const results: SyncResult[] = []
  for (const doc of docs) {
    for (const { platform, asset } of doc.files) {
      try {
        const url = await copyToS3(env, asset, platform, doc.slug ?? doc._id, fetchImpl)

        // Point the document (and its open draft, if it still holds the same upload) at S3
        const patch = { set: { [`${platform}.url`]: url }, unset: [`${platform}.file`] }
        const mutations: unknown[] = [{ patch: { id: doc._id, ...patch } }]
        if (doc.draft && (doc.draft as any)[platform] === asset._id) {
          mutations.push({ patch: { id: doc.draft._id, ...patch } })
        }
        const mres = await fetchImpl(`${api}/mutate/${dataset}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ mutations }),
        })
        if (!mres.ok) throw new Error(`Updating ${doc._id} failed: ${mres.status} ${await mres.text()}`)

        // Remove the now-unused copy from Sanity (fails harmlessly if still referenced elsewhere)
        const dres = await fetchImpl(`${api}/mutate/${dataset}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ mutations: [{ delete: { id: asset._id } }] }),
        })
        if (!dres.ok) log(`Kept Sanity asset ${asset._id} (still in use): ${dres.status}`)

        log(`${doc._id} ${platform}: moved to ${url}`)
        results.push({ document: doc._id, platform, url })
      } catch (err) {
        const message = (err as Error).message
        log(`${doc._id} ${platform}: ${message}`)
        results.push({ document: doc._id, platform, error: message })
      }
    }
  }
  return results
}

async function copyToS3(env: SyncEnv, asset: Asset, platform: string, slug: string, fetchImpl: typeof fetch): Promise<string> {
  const folder = PLATFORM_FOLDERS[platform]
  const fallback = `${slug}-${platform}${asset.extension ? '.' + asset.extension : ''}`
  const name = safeFileName(asset.originalFilename, fallback)
  const base = (env.S3_PUBLIC_BASE_URL || `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`).replace(/\/+$/, '')

  // First try the plain name (matches the existing bucket layout). If that name is
  // taken, use a name prefixed with the file's hash. If that is taken too, it is
  // the identical file from an earlier run.
  const candidates = [`${folder}/${name}`, `${folder}/${(asset.sha1hash ?? asset._id).slice(0, 8)}-${name}`]
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i]
    const status = await putObject(env, key, asset, fetchImpl)
    if (status === 'created' || (status === 'exists' && i === candidates.length - 1)) {
      return `${base}/${encodeS3Key(key)}`
    }
  }
  throw new Error('unreachable')
}

async function putObject(env: SyncEnv, key: string, asset: Asset, fetchImpl: typeof fetch): Promise<'created' | 'exists'> {
  const url = `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${encodeS3Key(key)}`

  // Cheap check first so we don't pull a big installer from Sanity for nothing.
  // (The bucket is publicly readable; the If-None-Match below still guards against races.)
  const head = await fetchImpl(url, { method: 'HEAD' })
  if (head.status === 200) return 'exists'

  const src = await fetchImpl(asset.url)
  if (!src.ok || !src.body) throw new Error(`Could not read ${asset.url} from Sanity: ${src.status}`)
  const headers: Record<string, string> = {
    'content-type': asset.mimeType || 'application/octet-stream',
    'if-none-match': '*', // never overwrite an existing file
  }
  if (env.S3_OBJECT_ACL) headers['x-amz-acl'] = env.S3_OBJECT_ACL
  const signed = await signRequest({
    method: 'PUT',
    url,
    headers,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
  })

  // S3 needs a Content-Length. In Workers, FixedLengthStream streams the file
  // straight through without holding it in memory.
  const size = asset.size ?? Number(src.headers.get('content-length'))
  let body: BodyInit
  let pump: Promise<void> | undefined
  if (typeof FixedLengthStream !== 'undefined' && size > 0) {
    const { readable, writable } = new FixedLengthStream(size)
    pump = src.body.pipeTo(writable)
    body = readable
  } else {
    body = await src.arrayBuffer()
  }

  const res = await fetchImpl(url, { method: 'PUT', headers: signed, body })
  await pump?.catch(() => {})
  if (res.status === 200) return 'created'
  if (res.status === 412) return 'exists'
  throw new Error(`S3 upload of ${key} failed: ${res.status} ${await res.text()}`)
}
