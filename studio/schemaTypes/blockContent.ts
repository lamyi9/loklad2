import { defineArrayMember, defineType } from 'sanity'

/**
 * Rich text for the app description. Kept deliberately small so everything an
 * editor can do here is rendered by src/lib/portable-text.ts on the website.
 */
export const blockContent = defineType({
  name: 'blockContent',
  title: 'Description',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Normal', value: 'normal' },
        { title: 'Heading 2', value: 'h2' },
        { title: 'Heading 3', value: 'h3' },
        { title: 'Heading 4', value: 'h4' },
        { title: 'Quote', value: 'blockquote' },
      ],
      lists: [
        { title: 'Bullet', value: 'bullet' },
        { title: 'Numbered', value: 'number' },
      ],
      marks: {
        decorators: [
          { title: 'Bold', value: 'strong' },
          { title: 'Italic', value: 'em' },
          { title: 'Code', value: 'code' },
        ],
        annotations: [
          {
            name: 'link',
            title: 'Link',
            type: 'object',
            fields: [
              {
                name: 'href',
                title: 'URL',
                type: 'url',
                validation: (rule) =>
                  rule.uri({ scheme: ['http', 'https', 'mailto'] }),
              },
            ],
          },
        ],
      },
    }),
  ],
})
