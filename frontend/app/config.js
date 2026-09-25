/*
 * Runtime config for the DASHBOARD APP bundle (member dashboard + admin console).
 *
 * Edit these when the app is deployed on a different domain than the API or the
 * public site. Leave a value as "" to mean "same origin as this page".
 *
 *   apiBase : where the backend API lives, including the /api path
 *   siteUrl : origin of the public-site bundle (frontend/site) — used for the
 *             "sign in" / "signed out" redirects and the logo link
 */
window.MT5 = {
  apiBase: '/api',
  siteUrl: '',
};

/* Point any link marked data-site-link at the public-site bundle
 * (e.g. the logo → landing page). No-op when siteUrl is "". */
document.addEventListener('DOMContentLoaded', function () {
  if (!window.MT5.siteUrl) return;
  document.querySelectorAll('a[data-site-link]').forEach(function (a) {
    a.href = window.MT5.siteUrl + (a.getAttribute('href') || '/');
  });
});
