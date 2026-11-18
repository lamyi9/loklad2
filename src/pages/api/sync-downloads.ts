// Called by a Sanity webhook after an editor publishes an app with an uploaded
// installer. Copies the file to S3 and swaps in the S3 link. See SANITY-SETUP.md.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { syncDownloads, verifySanitySignature } from '../../lib/download-sync';

export const POST: APIRoute = async ({ request }) => {
    const settings = env as unknown as Record<string, string | undefined>;
    const rawBody = await request.text();
    const valid = await verifySanitySignature(
        rawBody,
        request.headers.get('sanity-webhook-signature'),
        settings.SANITY_WEBHOOK_SECRET,
    );
    if (!valid) return new Response('Invalid signature', { status: 401 });

    try {
        const results = await syncDownloads(settings);
        const failed = results.filter((r) => r.error);
        // A 500 makes Sanity retry the webhook later
        return Response.json({ ok: failed.length === 0, results }, { status: failed.length ? 500 : 200 });
    } catch (err) {
        console.error(err);
        return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
};
