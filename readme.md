# Web personalization demo

This is a static HTML, CSS and JavaScript site. Vercel serves `index.html` at
`/` and the Optimizely demo at `/index-optimizely.html`. No build step or
framework is needed. The JSON snapshots used by the Optimizely demo are in
`vha/experience_fragment/`. `.vercelignore` limits the deployment to the
site files; add new public assets there when needed.

To run the Optimizely demo locally:

```sh
node optimizely-local-server.mjs
```

Open `http://127.0.0.1:8765/index-optimizely.html`. This local server is for
the Optimizely demo only; Vercel serves the static files directly.
