// Astro content loader that reads one section of the site from Sanity at build
// time. It produces the same entry shape the old Markdown files did, so the
// pages (getCollection / render) did not need to change.
//
// Uses Sanity's plain HTTP query API with fetch, so no Sanity package is needed
// in the website. The dataset is public (Sanity free plan), so no token either.
//
// Images are downloaded at build time into public/cms/ and served from your own
// domain. This keeps the site working for visitors in places where
// cdn.sanity.io may be blocked. Set SANITY_LOCAL_IMAGES=false to use the CDN.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Loader } from 'astro/loaders'
import { portableTextToHtml } from './portable-text'

const API_VERSION = 'v2025-02-19'

export interface SanityConfig {
  projectId: string
  dataset: string
  localImages: boolean
}

function env(name: string): string | undefined {
  // .env files are exposed through import.meta.env; CI variables (Cloudflare) through process.env
  const fromMeta = (import.meta as any).env?.[name]
  return (fromMeta ?? process.env[name]) || undefined
}

// The project ID is public (it's visible in every request), so it's safe to keep
// a default here. The environment variable still wins if set.
const DEFAULT_PROJECT_ID = 'ux81inem'

export function sanityConfigFromEnv(): SanityConfig {
  const projectId = env('PUBLIC_SANITY_PROJECT_ID') ?? DEFAULT_PROJECT_ID
  return {
    projectId,
    dataset: env('PUBLIC_SANITY_DATASET') ?? 'production',
    localImages: env('SANITY_LOCAL_IMAGES') !== 'false',
  }
}

// Field names on the right are what the Astro pages already use.
const QUERY = `*[_type == $type && defined(slug.current)] | order(title asc) {
  _id,
  _updatedAt,
  "id": slug.current,
  title,
  category,
  summary,
  "banner": banner.asset->url,
  "thumbnail": thumbnail.asset->url,
  author,
  website,
  country,
  rating,
  "apk": coalesce(android.file.asset->url, android.url),
  "apk_version": android.version,
  "windows": coalesce(windows.file.asset->url, windows.url),
  "win_version": windows.version,
  "mac": coalesce(mac.file.asset->url, mac.url),
  "mac_version": mac.version,
  video,
  body
}`

export async function querySanity<T>(config: SanityConfig, query: string, params: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const url = new URL(`https://${config.projectId}.api.sanity.io/${API_VERSION}/data/query/${config.dataset}`)
  url.searchParams.set('query', query)
  url.searchParams.set('perspective', 'published')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(`$${k}`, JSON.stringify(v))
  const res = await fetchImpl(url)
  if (!res.ok) {
    throw new Error(`Sanity query failed (${res.status} ${res.statusText}): ${await res.text()}`)
  }
  const json = (await res.json()) as { result: T }
  return json.result
}

/** Download a Sanity CDN image into public/cms and return its local URL. */
async function localizeImage(url: string | null | undefined, publicDir: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  if (!url) return undefined
  // Sanity asset file names are content hashes, so an existing file never needs re-downloading
  const name = path.basename(new URL(url).pathname)
  const target = path.join(publicDir, 'cms', name)
  try {
    await fs.access(target)
  } catch {
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`Could not download ${url}: ${res.status}`)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, Buffer.from(await res.arrayBuffer()))
  }
  return `/cms/${name}`
}

function stripNulls<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

export function sanityLoader(type: string, options: { config?: SanityConfig; fetch?: typeof fetch } = {}): Loader {
  return {
    name: `sanity-${type}`,
    load: async ({ store, parseData, generateDigest, logger, config: astroConfig }) => {
      const config = options.config ?? sanityConfigFromEnv()
      const fetchImpl = options.fetch ?? fetch
      const publicDir = fileURLToPath(astroConfig.publicDir)
      const docs = await querySanity<any[]>(config, QUERY, { type }, fetchImpl)

      store.clear()
      let loaded = 0
      for (const doc of docs) {
        const { _id, _updatedAt, id, body, ...fields } = doc
        if (config.localImages) {
          for (const field of ['thumbnail', 'banner'] as const) {
            try {
              fields[field] = await localizeImage(fields[field], publicDir, fetchImpl)
            } catch (err) {
              logger.warn(`${type}/${id}: ${(err as Error).message}. Using the Sanity CDN URL instead.`)
            }
          }
        }
        let data: Record<string, unknown>
        try {
          data = await parseData({ id, data: { ...stripNulls(fields), collection: type } })
        } catch (err) {
          // One badly filled-in entry should not take the whole site down
          logger.error(`Skipping ${type}/${id} (Sanity document ${_id}): ${(err as Error).message}`)
          continue
        }
        const html = portableTextToHtml(body)
        store.set({
          id,
          data,
          digest: generateDigest({ _updatedAt, ...data, html }),
          rendered: { html },
        })
        loaded++
      }
      logger.info(`Loaded ${loaded} of ${docs.length} ${type} from Sanity`)
    },
  }
}
