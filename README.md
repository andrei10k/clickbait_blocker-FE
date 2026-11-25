# clickbait_blocker-FE
ClickBait Blocker is a Google Chrome Extension that is trying to hide away those awful articles with the support of users like you.

https://chrome.google.com/webstore/detail/clickbait-blocker/pebndnefgjnpdmcjjhjcpplplgglebhf


How to modify:

- npm install (the only dependency is esbuild, used for minification)
- npm run watch
- make changes to js/development/*.js and on save the js/build/*.js files will be updated, minified with esbuild.
- those files will be uploaded in your chrome extension package

How to package for the Web Store:

- npm run package
- upload dist/clickbait-blocker-<version>.zip

The zip is built from an explicit file list (manifest.json, css, image, js/build, vendor, view), so node_modules and build tooling can never end up in a store upload.

Backend:

The shared clickbait list lives at https://clickbaitblockerapi.gotskillz.tech/api/clickbait
(set in API_URL at the top of js/development/content.js). The server responds with
access-control-allow-origin: *, so the content script calls it directly and no host
permission is needed. If the API ever restricts origins, the calls have to move into a
background service worker, because MV3 applies the page's CORS rules to content scripts
and host permissions do not exempt them.

Sign in and AI preview:

The popup has a "Sign in with Google" button. It registers the account with
POST /api/user and stores the email in chrome.storage.local. Once signed in,
hovering a link shows an AI button next to "Mark as clickbait"; it calls
GET /api/summarize and shows the summary plus the clickbait score in a popover.

To get the real Google consent screen, create an OAuth client of type "Chrome
Extension" bound to this extension's id, then add the block to manifest.json:

  "oauth2": {
    "client_id": "<id>.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
  }

popup.js reads chrome.runtime.getManifest().oauth2, so no code change is needed.
Without that block it falls back to the email of the account signed into Chrome.

The consent screen needs two more things on Google's side: the app has to be
published (Audience -> Publish app), and the OAuth client's Item ID must equal the
extension id that is actually loaded, so a development build needs the same id as
the store item. The store item's public key can be pasted into manifest.json as
"key" to pin that id for unpacked builds.
