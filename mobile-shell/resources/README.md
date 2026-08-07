# App icon & splash source

`icon.png` is the real JEDIDA Marketplace brand mark (forest-green rounded
square, white "J", lime leaf accent — same mark used by `Logo.jsx` on the
web) at 1024x1024, the source size Capacitor's asset generator expects.

Once `npx cap add android` / `npx cap add ios` has been run, generate the
real per-platform launcher icons (replacing Capacitor's default blank/plain
placeholder icon) with:

```
npm install -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#0B3D24' --iconBackgroundColorDark '#0B3D24'
```

This reads `resources/icon.png` (and a `splash.png` here too, if you add one)
and writes every required Android/iOS icon size automatically — no manual
per-density asset editing needed.
