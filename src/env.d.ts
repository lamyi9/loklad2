/// <reference path="../.astro/types.d.ts" />

// Runtime variables and secrets on Cloudflare (see SANITY-SETUP.md, step 6)
declare module "cloudflare:workers" {
  export const env: Record<string, string | undefined>;
}
