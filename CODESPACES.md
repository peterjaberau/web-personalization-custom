# Optimizely demo in GitHub Codespaces

1. Open this repository in a GitHub Codespace.
2. In the Codespace terminal, run `node optimizely-local-server.mjs`.
3. Open the forwarded port 8765 from the **Ports** tab. Keep its visibility private.
4. Open `/index-optimizely.html` using the forwarded URL.

The server proxies the five configured Vodafone AEM fragments. The page must be served through this server to use the proxy. Salesforce SDK configuration and sitemap matching may need to be updated for the forwarded Codespace URL. Node.js 20 or newer is required.
