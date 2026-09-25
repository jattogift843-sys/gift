# Public site — deploy

This folder is a self-contained static site: the landing page, sign-in, and
registration. Deploy it to any static host (Netlify, Vercel, Cloudflare Pages,
S3 + CloudFront, nginx…).

## Contents

```
index.html          landing / marketing page
login.html          → served at /login
register.html       → served at /register
config.js           edit this before deploying
assets/             css, js, logo, hero video
```

## 1. Configure `config.js`

```js
window.MT5 = {
  apiBase: 'https://api.example.com/api',   // the backend API, incl. the /api path
  appUrl:  'https://app.example.com',        // where the dashboard-app bundle is hosted
};
```

- **Same domain as the API and app?** Leave both as `''` / `/api` (the defaults).
- `apiBase` must end without a trailing slash; the code appends paths like `/auth/login`.
- `appUrl` is where a user lands after signing in.

## 2. Deploy

Upload the folder as-is. It must be served from the **domain root** (so that the
absolute `/assets/...` paths resolve). Configure the host so that
`/login` → `login.html` and `/register` → `register.html` (most hosts do this
"clean URL" mapping automatically; on nginx use `try_files $uri $uri.html $uri/ =404;`).

## 3. Cross-origin note

If `apiBase` points to a different domain than this site, the backend must allow
this site's origin — set `CORS_ORIGINS` on the API server (see the root README).
