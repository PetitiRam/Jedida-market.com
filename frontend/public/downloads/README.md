Place the built Android APK here as `jedida-marketplace.apk` after running
`eas build --platform android --profile preview` in `mobile/`, downloading
the artifact, and renaming it. It will then be served at
`https://yourdomain.com/downloads/jedida-marketplace.apk` — exactly what
`DownloadApp.jsx` links to by default.

Alternatively, set VITE_APK_DOWNLOAD_URL to point at an external host
(S3, Cloudinary, GitHub Releases) if you'd rather not bundle a large binary
into the frontend deploy.
