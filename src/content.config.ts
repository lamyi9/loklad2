import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from "astro/loaders";

const appsCollection = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/apps' }),
    schema: z.object({
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
    }),
});

const browserCollection = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/browsers' }),
    schema: z.object({
        title: z.string().max(100),
        category: z.string(),
        summary: z.string(),
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
    }),
});

const comCollection = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/communication' }),
    schema: z.object({
        title: z.string().max(100),
        category: z.string(),
        summary: z.string(),
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
    }),
});

const toolsCollection = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/tools' }),
    schema: z.object({
        title: z.string().max(100),
        category: z.string(),
        summary: z.string(),
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
    }),
});

export const collections = {
    'apps': appsCollection,
    'browsers': browserCollection,
    'communication': comCollection,
    'tools': toolsCollection,
};