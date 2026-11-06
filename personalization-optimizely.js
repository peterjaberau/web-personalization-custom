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


const aemBaseURL = 'https://www.vodafone.com.au/rest/experienceFragments';
const fragmentRoot = '/content/experience-fragments/vha/experience_fragment';
const latestRequests = new WeakMap();

/** Fetch and render each Salesforce decision's AEM fragment in its content zone. */
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

    const request = Symbol('fragment request');
    latestRequests.set(zone, request);
    // The local demo server proxies the five configured fragments to avoid browser CORS.
    const useLocalProxy = window.location.hostname === '127.0.0.1' && window.location.port === '8765';
    const url = useLocalProxy
      ? new URL('/__aem-fragment', window.location.origin)
      : new URL(aemBaseURL);
    url.searchParams.set('path', useLocalProxy ? path : `${fragmentRoot}/${path}`);

    try {
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`AEM request failed (${response.status})`);
      const fragment = await response.json();
      if (typeof fragment.html !== 'string') throw new Error('AEM response does not contain HTML');

      // JSON parsing resolves Unicode escapes; decode the outer HTML entities once.
      const decoder = container.ownerDocument.createElement('textarea');
      decoder.innerHTML = fragment.html;
      // Use the locally downloaded team-plan images when the demo runs locally.
      let html = decoder.value;
      if (useLocalProxy) {
        const images = [
          'VF-HP-desktop-offer-Teams-4000-920.webp',
          'VF-HP-MOB-TEAMS.webp',
        ];
        images.forEach((image) => {
          const remote = `https://www.vodafone.com.au/images/business/${image}`;
          const local = new URL(`./assets/vodafone/images/${image}`, container.ownerDocument.baseURI).href;
          html = html.replaceAll(remote, local);
        });
      }
      if (latestRequests.get(zone) === request) zone.innerHTML = html;
    } catch (error) {
      if (latestRequests.get(zone) === request) {
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