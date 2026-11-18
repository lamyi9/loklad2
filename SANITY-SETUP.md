# Sanity CMS setup

The site's content (apps, browsers, communication, tools) now lives in Sanity.
Your client edits it in **Sanity Studio**, a web app at `https://<name>.sanity.studio`.
When they click **Publish**, Sanity tells Cloudflare to rebuild the site (about 1–2 minutes).

```
studio/                          Sanity Studio (the editing app) – its own package.json
src/lib/sanity-loader.ts         Pulls content from Sanity at build time
src/lib/portable-text.ts         Turns the rich-text description into HTML
src/content.config.ts            Astro collections, now loading from Sanity
src/pages/api/sync-downloads.ts  Moves uploaded installers to S3 (step 6)
src/lib/download-sync.ts, aws-sigv4.ts   ...its logic and AWS request signing
```

The website needs **no new npm packages**: it talks to Sanity's HTTP API with `fetch`.

You need Node.js 22.12 or newer for the Studio (`node -v`).

---

## 1. Create the Sanity project (once, ~5 min)

1. Sign up / log in at https://www.sanity.io/manage and click **Create new project**.
   Name it e.g. `Loklad`. Copy the **Project ID** shown on the project page.
2. Set up the Studio:

   ```sh
   cd studio
   cp .env.example .env        # then put your Project ID in .env
   npm install
   npx sanity login
   npx sanity dataset create production --visibility public
   ```

   If it says the dataset already exists, that's fine. It must be **public**
   (the free plan only has public datasets, and the website reads it without a token).

3. Run it locally to check: `npm run dev` → http://localhost:3333
   If the login loops, run `npx sanity cors add http://localhost:3333 --credentials`.

## 2. Existing content (done)

The 20 entries from the old Markdown files were imported on 2026-11-18, with their
images. The Markdown files, `public/images` and the one-off migration script were
then removed; they are still in git history (commit `05bfc9c`) if ever needed.

## 3. Point the website at Sanity

```sh
cp .env.example .env     # put the same Project ID in PUBLIC_SANITY_PROJECT_ID
pnpm install
pnpm dev                 # check a few pages
pnpm build
```

In **Cloudflare → Workers & Pages → (this site) → Settings → Build → Variables**, add
`PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET=production`.

## 4. Publish the Studio for the client

```sh
cd studio
npm run deploy           # pick a hostname, e.g. loklad -> https://loklad.sanity.studio
```

Then in https://www.sanity.io/manage → your project → **Members**, invite the client
with the **Editor** role. Free plan: up to 20 people.

## 5. Rebuild the site automatically on Publish

1. **Cloudflare:** Workers & Pages → this site → Settings → Builds → **Deploy Hooks** →
   create one for the `main` branch. Copy the URL.
2. **Sanity:** manage → your project → API → **Webhooks** → Create webhook:
   - URL: the Cloudflare deploy hook URL
   - Dataset: `production`
   - Trigger on: Create, Update, Delete
   - Filter: `_type in ["apps", "browsers", "communication", "tools"]`
   - HTTP method: POST, leave "Trigger webhook when drafts are modified" **off**

The free plan allows 2 webhooks; this uses one. Step 6 uses the other.

## 6. Let the client upload installers to S3 from the Studio

When the client uploads an installer in a Download field and publishes, the site's
`/api/sync-downloads` endpoint (a Cloudflare server function) copies the file to the
S3 bucket, puts the S3 link in the field, and deletes the copy from Sanity. The AWS
keys live only in Cloudflare as encrypted secrets; nothing secret is in the Studio.

Existing files in S3 are **never overwritten**. If the name is taken, the new file
gets a short prefix (e.g. `windows/99887766-psiphon3.exe`).

**a. A new AWS key that can only add files** (don't reuse the old Tina key — delete that one).
In AWS IAM, create a user (e.g. `loklad-uploader`) with only this policy, then create an access key for it:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": [
      "arn:aws:s3:::loklad/apk/*",
      "arn:aws:s3:::loklad/windows/*",
      "arn:aws:s3:::loklad/mac/*"
    ]
  }]
}
```

It can't delete, list or read anything, so even if it leaked, nobody could remove or
replace the existing installers.

**b. A Sanity token.** sanity.io/manage → your project → API → Tokens → Add API token,
name `S3 sync`, permission **Editor**. Copy it (it's shown once).

**c. A webhook secret.** Any long random string, e.g. the output of `openssl rand -hex 32`.

**d. Cloudflare secrets.** Workers & Pages → this site → Settings → **Variables and Secrets**
(the runtime ones, not the Build variables). Add each as type **Secret**:

| Name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from step a |
| `AWS_SECRET_ACCESS_KEY` | from step a |
| `SANITY_WRITE_TOKEN` | from step b |
| `SANITY_WEBHOOK_SECRET` | from step c |

`S3_BUCKET`, `S3_REGION` and the Sanity project ID are already in `wrangler.jsonc`.
Deploy once after adding them (push a commit or use the deploy hook).

**e. The webhook.** sanity.io/manage → API → Webhooks → Create webhook:
- Name: `Move uploads to S3`
- URL: `https://<your-site-domain>/api/sync-downloads`
- Dataset: `production`, Trigger on: **Create** and **Update**
- Filter: `_type in ["apps", "browsers", "communication", "tools"] && (defined(android.file.asset) || defined(windows.file.asset) || defined(mac.file.asset))`
- Projection: `{_id}`
- HTTP method: POST, drafts **off**
- Secret: the string from step c

**f. Test it.** In the Studio, upload a small file to any app's Download field and
publish. Within a minute the link field should show an S3 address and the upload
should be gone. If not, open the webhook's **Attempts log** in sanity.io/manage;
the response says what went wrong. If the new link gives "Access Denied" in the
browser, your bucket makes files public per file rather than with a bucket policy:
add a plain variable `S3_OBJECT_ACL` = `public-read` in Cloudflare and add
`s3:PutObjectAcl` to the policy in step a.

---

## Notes

- **Images** are downloaded during the build into `public/cms/` (git-ignored) and
  served from your own domain, so the site does not depend on `cdn.sanity.io`
  being reachable for visitors. Set `SANITY_LOCAL_IMAGES=false` to turn that off.
- **Downloads**: each platform takes either an upload (moved to S3 automatically, step 6)
  or a pasted link. Between Publish and the move finishing (about a minute) the site
  briefly links to the copy on Sanity; that's the only Sanity bandwidth an installer uses.
- **If Sanity is down during a build**, the build fails and Cloudflare keeps serving
  the last good version. The live site never depends on Sanity.
- An entry that fails validation is skipped with an error in the build log instead
  of breaking the whole site.
- Back up the content now and then: `cd studio && npx sanity dataset export production backup.tar.gz`.

## For the client: adding or updating an app

1. Open the Studio link and log in.
2. Pick the section on the left (Apps, Browsers, Communication, Tools).
3. To add one, click the **+** at the top of the list. Fill in the **Main** tab,
   click **Generate** next to "Page address", add downloads on the **Downloads** tab
   and the text on the **Description** tab.
4. For a new version of an installer: on the **Downloads** tab, upload the file under
   "Upload a new installer" and update the version number. Give each version its own
   file name (e.g. `Signal-8.2.0.exe`).
5. Click **Publish**. The site updates within a few minutes.
