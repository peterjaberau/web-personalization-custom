// Change these values to select the content source; Salesforce contentPath stays unchanged.
export const contentSource = {
  baseURL: '', // Empty uses the current page origin (localhost or Codespaces).
  basePath: '/vha/experience_fragment', // Can be empty.
  suffix: '/index.json', // Use an empty string for the live AEM endpoint.
};

// Live AEM example:
// baseURL: 'https://www.vodafone.com.au',
// basePath: '/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment',
// suffix: '',

let optimizelyCheck;

/** Log Optimizely once it becomes available, even if it loads after this script. */
export function debugOptimizely() {
  if (optimizelyCheck) return;

  const logWhenAvailable = () => {
    if (typeof window.optimizely?.get !== 'function') return false;
    try {
      const data = window.optimizely.get('data');
      if (data == null) return false;
      console.log('[optimizely Personalization]:', data);
      return true;
    } catch (error) {
      console.warn('[optimizely Personalization]: Unable to retrieve Optimizely data.', error);
      return true;
    }
  };

  if (logWhenAvailable()) return;

  console.warn('[optimizely Personalization]: Optimizely is not available yet; waiting for it to load.');
  optimizelyCheck = window.setInterval(() => {
    if (logWhenAvailable()) {
      window.clearInterval(optimizelyCheck);
      optimizelyCheck = undefined;
    }
  }, 250);
}


const latestRequests = new WeakMap();

/** Fetch the AEM JSON selected by each decision and show it in its content zone. */
export async function applyPersonalizationFromOptimizely(container, decisions = []) {
  await Promise.all(decisions.map(async (decision) => {
    const selector = decision?.contentZone?.selector;
    const contentPath = decision?.attributes?.contentPath;
    if (typeof selector !== 'string' || !selector.trim()
      || typeof contentPath !== 'string' || !contentPath.trim()) return;

    let zone;
    try {
      zone = container.querySelector(selector);
    } catch (error) {
      console.warn('[optimizely Personalization]: Invalid content zone selector:', selector, error);
      return;
    }
    if (!zone) return;

    // Only relative fragment paths under the configured AEM root are supported.
    const path = contentPath.trim().replace(/^\/+/, '');
    if (!path || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      || /[?#\\%]/.test(path)) {
      console.warn('[optimizely Personalization]: Invalid AEM content path:', contentPath);
      return;
    }

    // Show the selected path even when a zone does not have a JSON panel.
    const pathLabel = zone.querySelector('[data-personalization-content-path]');
    if (pathLabel) pathLabel.textContent = `Content path: ${contentPath.trim()}`;
    const output = zone.querySelector('[data-personalization-json]');
    if (!output) return;

    const request = Symbol('fragment request');
    latestRequests.set(zone, request);
    output.textContent = 'Loading JSON response...';
    try {
      // The base path may include a query string, as in the live AEM endpoint.
      const base = contentSource.baseURL || new URL(container.ownerDocument.baseURI).origin;
      const prefix = contentSource.basePath.replace(/\/+$/, '');
      const url = new URL(`${prefix}/${path}${contentSource.suffix}`, `${base.replace(/\/+$/, '')}/`);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`AEM request failed (${response.status})`);
      const fragment = await response.json();
      if (typeof fragment.html !== 'string') throw new Error('AEM response does not contain HTML');

      // Show the complete response as text; never execute the returned HTML.
      if (latestRequests.get(zone) === request) {
        output.textContent = JSON.stringify(fragment, null, 2);
      }
    } catch (error) {
      if (latestRequests.get(zone) === request) {
        output.textContent = 'Unable to load the JSON response.';
        console.warn('[optimizely Personalization]: Unable to render AEM fragment:', contentPath, error);
      }
    }
  }));
}

/** Receive enriched sitemap decisions, including decisions published before connection. */
export function connectToDecisions(apply, containerSelector = "body", host = window) {
  if (typeof apply !== "function") throw new Error("A personalization renderer is required")
  const container = host.document.querySelector(containerSelector)
  if (!container) throw new Error(`Personalization container not found: ${containerSelector}`)
  apply(container)

  const onDecisions = (event) => {
    if (Array.isArray(event.detail)) apply(container, event.detail)
  }
  host.addEventListener("personalization:decisions", onDecisions)
  if (Array.isArray(host.decisionsProvider)) {
    apply(container, host.decisionsProvider)
  }
  return () => host.removeEventListener("personalization:decisions", onDecisions)
}



/**
 * https://www.vodafone.com.au/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment/banner/business/team-plan/master
 * https://www.vodafone.com.au/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment/banner/business/sim-plan/sim-360
 * https://www.vodafone.com.au/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment/banner/business/eofy26/nbn/master
 * https://www.vodafone.com.au/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment/banner/business/iphone18promax/master
 * https://www.vodafone.com.au/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment/banner/business/iphone-duo/master
 *
 *
 *
 */