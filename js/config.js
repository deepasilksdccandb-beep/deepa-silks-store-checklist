// ════════════════════════════════════════════════════════════════
//  Deepa Silks Store Operations Checklist — public configuration
//
//  ⚠ NOTHING IN THIS FILE IS A SECRET. The API endpoint is a public
//    URL (Google Apps Script web-app deployments are designed for
//    public access). All authorisation happens on the backend.
//
//  The placeholder below is replaced at build time when the
//  DEEPA_API_ENDPOINT environment variable is set (npm run build),
//  or you can paste your deployment URL here directly.
// ════════════════════════════════════════════════════════════════
window.DEEPA_CONFIG = {
  apiEndpoint: '__DEEPA_API_ENDPOINT__',

  appName: 'Deepa Silks Store Operations Checklist',
  storeName: 'Deepa Silks',
  storeLocation: 'Dharmapuri',

  // Client-side photo resize (server accepts up to 3 MB decoded).
  photo: { maxWidth: 1280, quality: 0.7 },

  // PIN length accepted by the login screen (validated again server-side).
  pinLength: { min: 4, max: 4 }
};
