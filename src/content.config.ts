import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { sanityLoader } from './lib/sanity-loader';

// Content is edited in Sanity Studio (see studio/ and SANITY-SETUP.md) and
// pulled in at build time. The schema below is the same one the Markdown
// files used, so pages and components work unchanged.
const appSchema = z.object({
    title: z.string().max(100),
    category: z.string(),
    summary: z.string().optional(),
    banner: z.string().optional(),
    thumbnail: z.string(),
    author: z.string(),
    website: z.string(),
    collection: z.string(),
    country: z.string().optional(),
    rating: z.number(),
    apk: z.string().url().optional(),
    apk_version: z.string().optional(),
    windows: z.string().url().optional(),
    win_version: z.string().optional(),
    mac: z.string().url().optional(),
    mac_version: z.string().optional(),
    video: z.string().url().optional(),
});

export const collections = {
    'apps': defineCollection({ loader: sanityLoader('apps'), schema: appSchema }),
    'browsers': defineCollection({ loader: sanityLoader('browsers'), schema: appSchema }),
    'communication': defineCollection({ loader: sanityLoader('communication'), schema: appSchema }),
    'tools': defineCollection({ loader: sanityLoader('tools'), schema: appSchema }),
};
