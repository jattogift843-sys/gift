/*
 * Runtime config for the PUBLIC SITE bundle.
 *
 * Edit these when the site is deployed on a different domain than the API or
 * the dashboard app. Leave a value as "" to mean "same origin as this page".
 *
 *   apiBase : where the backend API lives, including the /api path
 *   appUrl  : origin of the dashboard-app bundle (frontend/app) — used to
 *             redirect here after a successful login
 */
window.MT5 = {
  apiBase: '/api',
  appUrl: '',
};
