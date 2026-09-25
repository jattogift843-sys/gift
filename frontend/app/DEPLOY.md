# Dashboard app — deploy

This folder is a self-contained static app: the **member dashboard** (`/app`) and
the **admin console** (`/admin`). Deploy it to any static host.

## Contents

```
app.html            → served at /app   (member dashboard)
admin.html          → served at /admin  (admin console)
config.js           edit this before deploying
assets/             css, js (app.js, admin.js, core.js, …), logo, dashboard video
```

## 1. Configure `config.js`

```js
window.MT5 = {
  apiBase: 'https://api.example.com/api',   // the backend API, incl. the /api path
  siteUrl: 'https://example.com',            // where the public-site bundle is hosted
};
```

- **Same domain as the API and site?** Leave both as `''` / `/api` (the defaults).
- `siteUrl` is used for the "sign in" redirect when a session expires, the sign-out
  redirect, and the logo link.

## 2. Deploy

Upload the folder as-is, served from the **domain root**. Map:

- `/app`   → `app.html`
- `/admin` → `admin.html`
- everything else → `app.html` (SPA fallback) is fine but not required

nginx: `try_files $uri $uri.html /app.html;`

## 3. Auth handoff

The public site sends the freshly-issued token in the URL fragment
(`…/app#t=<token>`); `assets/js/core.js` reads it on load, stores it, and cleans
the URL. This is what lets the dashboard work when it's on a different domain
than the login page. Nothing to configure.

## 4. Cross-origin note

If `apiBase` is a different domain, set `CORS_ORIGINS` on the API server to
include this app's origin (see the root README).
