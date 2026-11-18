import { defineField, defineType } from 'sanity'

/**
 * One platform's download. Editors either upload the installer here or paste a
 * link. After Publish, an uploaded file is moved to the S3 bucket automatically
 * (src/pages/api/sync-downloads.ts) and the link field is filled in.
 */
export const download = defineType({
  name: 'download',
  title: 'Download',
  type: 'object',
  options: { collapsible: true, collapsed: false },
  fields: [
    defineField({
      name: 'url',
      title: 'Download link',
      type: 'url',
      description:
        'Filled in automatically after you upload a file below and publish. You can also paste a link yourself.',
      validation: (rule) => rule.uri({ scheme: ['http', 'https'] }),
    }),
    defineField({
      name: 'file',
      title: 'Upload a new installer',
      type: 'file',
      description:
        'Upload the file, then Publish. Within a minute it is moved to the download server and the link above is updated. Use a new file name for each version (e.g. include the version number).',
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      description: 'Shown under the download button, e.g. 1.26.24',
    }),
  ],
})
