# Optimizely demo in GitHub Codespaces

1. Open this repository in a GitHub Codespace.
2. In the Codespace terminal, run `node optimizely-local-server.mjs`.
3. Open the forwarded port 8765 from the **Ports** tab. Keep its visibility private.
4. Open `/index-optimizely.html` using the forwarded URL.

The demo displays saved AEM JSON responses from the current page origin in the hero section. Change `contentSource` in `personalization-optimizely.js` to select another base URL and base path. The default server serves `vha/experience_fragment/.../index.json`; it does not fetch from Vodafone. Salesforce SDK configuration and sitemap matching may need to be updated for the forwarded Codespace URL. Node.js 20 or newer is required.
