// When regenerating, restore the custom setup call before SI.initSitemap.
/* eslint-disable */
var SI = getSalesforceInteractions()
SI.setLoggingLevel("debug")
SI.init({
  consents: [
    {
      purpose: "Tracking",
      provider: "POC",
      status: "Opt In",
    },
  ],
  personalization: {
    dataspace: "default",
  },
}).then(() => {
  const sitemapConfig = {
    global: {
      listeners: [],
      onActionEvent: (actionEvent) => actionEvent,
    },
    pageTypeDefault: {
      name: "default",
      eventType: "userEngagement",
    },
    pageTypes: [
      {
        name: "Home page",
        isMatch: () => window.location.pathname.includes("/index.html"),
        // Zone names must match Salesforce personalization point API names.
        // Replace these example selectors with stable targets on the actual page.
        contentZones: [
          { name: "SECTION_HERO_V1", selector: "#section-hero" },
          { name: "SECTION_FAQ_V1", selector: "#section-faq" },
          { name: "SECTION_FEATURES_V1", selector: "#section-features" },
        ],
        interaction: {
          name: "Page View - Home",
          eventType: "userEngagement",
        },
      },
      {
        name: "Optimizely",
        isMatch: () => window.location.pathname.includes("/index-optimizely.html"),
        // Zone names must match Salesforce personalization point API names.
        // Replace these example selectors with stable targets on the actual page.
        contentZones: [
          { name: "SECTION_HERO_V1", selector: "#section-hero" },
        ],
        interaction: {
          name: "Page View - Home",
          eventType: "userEngagement",
        },
      },
      {
        name: "Business SIM-only page",
        isMatch: () => window.location.pathname.includes("/business/sim-only"),
        contentZones: [
          { name: "SECTION_HERO_V1", selector: "#section-hero" },
          { name: "SECTION_FAQ_V1", selector: "#section-faq" },
          { name: "SECTION_FEATURES_V1", selector: "#section-features" },
        ],
        interaction: {
          name: "Page View - Business SIM-only",
          eventType: "userEngagement",
        },
      },
    ],
  }


  // Listen before initialization so the SDK's selected-page event is not missed.
  currentPageMatched(sitemapConfig, getPageDecisions)
  SI.initSitemap(sitemapConfig)
})
/* eslint-enable */

// Wait for the SDK to select a page; do not evaluate its isMatch functions again.
function currentPageMatched(sitemapConfig, handler) {
  const eventName = SI.CustomEvents.OnPageMatchStatusUpdated;
  let handled = false;
  const onPageMatch = (event) => {
    if (handled) return;
    const selected = event.detail?.matchStatus?.find((entry) => entry.status === 'selected');
    if (!selected) return;
    handled = true;
    document.removeEventListener(eventName, onPageMatch);
    const page = sitemapConfig.pageTypes.find((pageType) => pageType.name === selected.pageName)
      || (sitemapConfig.pageTypeDefault?.name === selected.pageName ? sitemapConfig.pageTypeDefault : undefined);
    handler(page);
  };
  document.addEventListener(eventName, onPageMatch);
}

// Request and publish decisions for the selected page's content zones.
async function getPageDecisions(page) {
  try {
    if (!Array.isArray(page?.contentZones)) return;

    const zones = new Map();
    page.contentZones.forEach((zone) => {
      if (typeof zone?.name === 'string' && zone.name.trim() && !zones.has(zone.name)) {
        zones.set(zone.name, zone);
      }
    });
    if (!zones.size) return;

    const points = [...zones.keys()];
    const response = await SI.Personalization.fetch(points);
    window.personalizationDiagnostics = { points, response };
    if (!Array.isArray(response?.personalizations)) {
      throw new Error('Unexpected Salesforce personalization response');
    }
    const contentDecisions = [];
    response.personalizations.forEach((item) => {
      const zone = zones.get(item?.personalizationPointName);
      if (!zone) return;
      contentDecisions.push({
        ...item,
        contentZone: { name: zone.name, selector: zone.selector || null },
      });
    });
    window.decisionsProvider = contentDecisions;
    console.log('[Personalization] Published decisions for page', page.name, contentDecisions);
    window.dispatchEvent(new CustomEvent('personalization:decisions', { detail: contentDecisions }));
  } catch (error) {
    console.warn('Sitemap personalization decision request failed', error);
  }
}
