# Deployment Guide

How to build and deploy the Pharmacy Laser App to the cPanel-hosted UAT site
(`uat.airrabbitstech.com`). The same steps work for any Apache / cPanel static
host — only the target folder changes.

## Overview

This is a static single-page app (React + Vite). "Deploying" means:

1. Produce a production build (`dist/`).
2. Upload its contents into the site's document root.

The backend is **Supabase** (hosted separately) — there is no server to deploy.
The Supabase URL + anon key are baked into the bundle at build time from `.env`.

---

## 1. Build

From the project root:

```bash
rm -rf dist
npm run build          # runs: tsc -b && vite build
```

Output goes to `dist/`. It contains:

```
dist/
  index.html
  .htaccess            # SPA routing + caching (Apache) — do not skip this
  favicon.svg
  icons.svg
  assets/              # content-hashed JS/CSS bundles
```

> The asset filenames are content-hashed (e.g. `index-Bxlu7X2L.js`), so every
> build produces new names and browser caching busts automatically.

### Package it as a zip (optional, for File Manager upload)

```bash
rm -f pharmacylaserapp-dist.zip
(cd dist && zip -r -q ../pharmacylaserapp-dist.zip . -x '.DS_Store')
```

The files must sit at the **archive root** (not inside a `dist/` subfolder) so
they extract straight into the web root. `*-dist.zip` is gitignored.

---

## 2. Deploy via cPanel File Manager

Target folder: `/home/<user>/uat.airrabbitstech.com`
(the subdomain's document root — **not** `public_html`).

1. **Show hidden files.** File Manager → top-right **Settings** →
   tick **"Show Hidden Files (dotfiles)"** → Save. You must be able to see
   `.htaccess`.

2. **Remove the previous build.** In the target folder, delete only:
   `assets/`, `index.html`, `favicon.svg`, `icons.svg`.
   **Keep** host-managed files: `cgi-bin/`, `php.ini`, and (if present)
   `.well-known/` and any existing `.htaccess` you intend to replace.
   *(Deleting the old `assets/` matters — old hashed bundles are not overwritten
   and would otherwise accumulate.)*

3. **Upload** `pharmacylaserapp-dist.zip` into the target folder (toolbar →
   Upload).

4. **Extract in place.** Right-click the zip → **Extract** → confirm the target
   path is the subdomain folder (not a subfolder). You should now have
   `index.html`, `assets/`, `favicon.svg`, `icons.svg`, and **`.htaccess`** at
   the root.

5. **Verify & clean up.** Confirm `.htaccess` is present and `index.html`'s
   timestamp is current. Delete the uploaded zip.

### Alternative: rsync / SFTP

If you have SSH/SFTP access, skip the zip:

```bash
rsync -av --delete \
  --exclude cgi-bin --exclude php.ini --exclude '.well-known' \
  dist/ <user>@<host>:/home/<user>/uat.airrabbitstech.com/
```

`--delete` removes stale files but is told to preserve the host-managed ones.

---

## 3. Verify the deploy

1. Open `https://uat.airrabbitstech.com` and **hard-refresh**
   (Cmd/Ctrl + Shift + R).
2. **Deep-link test:** navigate to Reports, then reload the browser. It should
   stay on the page, not 404 — this confirms the `.htaccess` SPA rewrite works.

The `.htaccess` handles three things: rewrite all non-file routes to
`index.html` (SPA routing), long-cache the hashed assets, and never cache
`index.html` (so new deploys are picked up immediately).

---

## Notes & caveats

- **Supabase config is build-time.** The bundle points at whatever `.env` held
  when you ran `npm run build`. To change environments, edit `.env` and rebuild.
  Only the **anon** key is public/embedded — never put the service-role key in
  the app or `.env` used for the build.
- **Database migrations are separate.** New features that add tables/columns
  (e.g. `supabase/migrations/*_sales_returns.sql`) must be applied to the
  Supabase project *before* those features will work. Deploying the frontend
  does not run migrations.
- **Never deploy `.env`** or any secret file — only the contents of `dist/`.
- **Do not run the e2e suite (`e2e/*.spec.ts`) against production Supabase** —
  its setup/teardown deletes data. Use `npm run test:unit` for safe checks.
