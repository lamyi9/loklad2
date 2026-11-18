import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './schemaTypes'

// Set these in studio/.env (see .env.example). The project ID is not a secret.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID!
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineConfig({
  name: 'default',
  title: 'Loklad',
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: { types: schemaTypes },
})
