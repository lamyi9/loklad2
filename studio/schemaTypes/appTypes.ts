import { defineField, defineType } from 'sanity'

/**
 * The website has four sections. Each is its own document type so the client
 * sees four lists in the Studio sidebar. All four share the same fields, which
 * match the fields the Astro site used to read from the Markdown files.
 *
 * The `name` of each type must match the Astro collection name in
 * src/content.config.ts, because it is also the URL prefix (/apps/..., /tools/...).
 */
const sections = [
  { name: 'apps', title: 'Apps' },
  { name: 'browsers', title: 'Browsers' },
  { name: 'communication', title: 'Communication' },
  { name: 'tools', title: 'Tools' },
] as const

function appType(name: string, title: string) {
  return defineType({
    name,
    title,
    type: 'document',
    groups: [
      { name: 'main', title: 'Main', default: true },
      { name: 'downloads', title: 'Downloads' },
      { name: 'description', title: 'Description' },
    ],
    fields: [
      defineField({
        name: 'title',
        title: 'App name',
        type: 'string',
        group: 'main',
        validation: (rule) => rule.required().max(100),
      }),
      defineField({
        name: 'slug',
        title: 'Page address',
        type: 'slug',
        group: 'main',
        description: `The last part of the page URL, e.g. /${name}/signal. Click "Generate". Changing it later breaks old links.`,
        options: { source: 'title', maxLength: 96 },
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: 'category',
        title: 'Category',
        type: 'string',
        group: 'main',
        description: 'e.g. VPN, Browser, Toolkit',
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: 'summary',
        title: 'Summary',
        type: 'text',
        rows: 4,
        group: 'main',
        description: 'Short text shown at the top of the page and in search results.',
        validation: (rule) => rule.required().warning('A summary is recommended.'),
      }),
      defineField({
        name: 'thumbnail',
        title: 'Thumbnail (app icon)',
        type: 'image',
        group: 'main',
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: 'banner',
        title: 'Banner image',
        type: 'image',
        group: 'main',
        description: 'Wide background image at the top of the page.',
      }),
      defineField({
        name: 'author',
        title: 'Developer',
        type: 'string',
        group: 'main',
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: 'website',
        title: 'Official website',
        type: 'string',
        group: 'main',
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: 'country',
        title: 'Country',
        type: 'string',
        group: 'main',
      }),
      defineField({
        name: 'rating',
        title: 'Rating',
        type: 'number',
        group: 'main',
        description: 'From 0 to 5, e.g. 4.7. Apps above 4.2 appear in "Top picks".',
        validation: (rule) => rule.required().min(0).max(5),
      }),
      defineField({
        name: 'android',
        title: 'Android (APK)',
        type: 'download',
        group: 'downloads',
      }),
      defineField({
        name: 'windows',
        title: 'Windows',
        type: 'download',
        group: 'downloads',
      }),
      defineField({
        name: 'mac',
        title: 'Mac',
        type: 'download',
        group: 'downloads',
      }),
      defineField({
        name: 'video',
        title: 'Tutorial video link (MP4)',
        type: 'url',
        group: 'downloads',
      }),
      defineField({
        name: 'body',
        title: 'Description',
        type: 'blockContent',
        group: 'description',
      }),
    ],
    preview: {
      select: { title: 'title', subtitle: 'category', media: 'thumbnail' },
    },
    orderings: [
      { title: 'Name', name: 'titleAsc', by: [{ field: 'title', direction: 'asc' }] },
      { title: 'Rating', name: 'ratingDesc', by: [{ field: 'rating', direction: 'desc' }] },
    ],
  })
}

export const appTypes = sections.map((s) => appType(s.name, s.title))
