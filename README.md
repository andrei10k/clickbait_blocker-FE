# clickbait_blocker-FE
ClickBait Blocker is a Google Chrome Extension that is trying to hide away those awful articles with the support of users like you.

https://chrome.google.com/webstore/detail/clickbait-blocker/pebndnefgjnpdmcjjhjcpplplgglebhf


How to modify:

- npm install (the only dependency is esbuild, used for minification)
- npm run watch
- make changes to js/development/*.js and on save the js/build/*.js files will be updated, minified with esbuild.
- those files will be uploaded in your chrome extension package
- go to css/style.css and replace 'mlljfchleidlfeemodakgpjkmagpafcn' with your extension id

How to package for the Web Store:

- npm run package
- upload dist/clickbait-blocker-<version>.zip

The zip is built from an explicit file list (manifest.json, css, image, js/build, vendor, view), so node_modules and build tooling can never end up in a store upload.
