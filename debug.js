/* Initialize before GTM to capture page-load events when enabled. */
const sfSdkInspector = (function (host) {
  'use strict';

  var enabled = false;
  var eventNames = [];
  // Known names allow page-load capture before the SDK exposes CustomEvents.
  var interactionEvents = [
    'onBeforeInit', 'onInit', 'onBeforeEventSend', 'onEventSend', 'onException',
    'onInitSitemap', 'onPageMatchStatusUpdated', 'onSettledSitemap', 'onShutDown',
    'onSetAnonymousId', 'onResetAnonymousId', 'onClearPersistedIdentities',
    'onClearCookie', 'onConsentGrant', 'onConsentRevoke'
  ];
  var moduleEvents = ['onInit', 'onBeforeEventSend', 'onEventResponse', 'onStatSend', 'onTemplateDisplayEnd'];
  var fallbackEvents = [];
  ['interactions:', 'DataCloudInteractions:interactions:'].forEach(function (prefix) {
    interactionEvents.forEach(function (name) { fallbackEvents.push(prefix + name); });
  });
  ['mcis:', 'evergage:', 'dataCloud:'].forEach(function (prefix) {
    moduleEvents.forEach(function (name) { fallbackEvents.push(prefix + name); });
  });

  function logEvent(event) {
    var action = event.detail && event.detail.actionEvent;
    var label = '[SF SDK] [' + event.type + ']';
    console.log(label, 'Event detail:', event.detail);
    if (action) {
      console.log(label, 'Action event:', action);
      console.log(label, 'Source:', action.source);
      console.log(label, 'User:', action.user);
    }
    // The SDK may only expose its event names after initialization.
    subscribeSdkEvents();
  }

  function subscribe(name) {
    if (typeof name !== 'string' || !name || eventNames.indexOf(name) !== -1) return;
    host.document.addEventListener(name, logEvent);
    eventNames.push(name);
  }

  function subscribeSdkEvents() {
    try {
      var sdk = typeof host.getSalesforceInteractions === 'function' ? host.getSalesforceInteractions() : null;
      [sdk && sdk.CustomEvents, sdk && sdk.Personalization && sdk.Personalization.CustomEvents,
        sdk && sdk.DataCloud && sdk.DataCloud.CustomEvents].forEach(function (events) {
        if (events && typeof events === 'object') Object.keys(events).forEach(function (key) { subscribe(events[key]); });
      });
    } catch (error) {
      console.warn('[SF SDK] Unable to discover SDK event names:', error);
    }
  }

  function logContext(sdk) {
    if (!sdk) {
      console.log('[SF SDK] SDK not available yet; event listener is active.');
      return;
    }
    [
      ['getAnonymousId', 'Anonymous ID'], ['getCookieDomain', 'Cookie domain'],
      ['getConsents', 'Consents'], ['getSitemapResult', 'Sitemap result']
    ].forEach(function (entry) {
      try {
        if (typeof sdk[entry[0]] !== 'function') {
          console.log('[SF SDK] ' + entry[1] + ': unavailable');
          return;
        }
        var value = sdk[entry[0]]();
        console.log('[SF SDK] ' + entry[1] + ':', value);
        if (entry[0] === 'getSitemapResult') console.log('[SF SDK] Matched page:', value && value.matchedConfig);
      } catch (error) {
        console.warn('[SF SDK] Unable to read ' + entry[1] + ':', error);
      }
    });
  }

  function start() {
    if (enabled) return;
    var sdk;
    try { sdk = typeof host.getSalesforceInteractions === 'function' ? host.getSalesforceInteractions() : null; }
    catch (error) { console.warn('[SF SDK] Unable to access the SDK:', error); }
    fallbackEvents.forEach(subscribe);
    subscribeSdkEvents();
    enabled = true;
    logContext(sdk);
    console.log('[SF SDK] Listening for SDK events:', eventNames.slice());
  }

  function stop() {
    if (!enabled) return;
    eventNames.forEach(function (name) { host.document.removeEventListener(name, logEvent); });
    eventNames = [];
    enabled = false;
    console.log('[SF SDK] Stopped listening for SDK events.');
  }

  if (new URLSearchParams(host.location.search).get('sf-inspector') === 'true') start();
  return { start: start, stop: stop, isEnabled: function () { return enabled; } };
})(window);

/** Log the cached decision associated with a section's debug button. */
export function connectDecisionDebug(containerSelector = 'body', host = window) {
  const container = host.document.querySelector(containerSelector);
  if (!container) throw new Error(`Debug container not found: ${containerSelector}`);
  const inspector = sfSdkInspector;
  const sdkButton = container.querySelector('[data-debug-action="sdk"]');
  if (sdkButton && inspector?.isEnabled()) sdkButton.setAttribute('aria-pressed', 'true');

  function inspectSalesforceSdk(button) {
    if (!inspector) {
      console.warn('[SF SDK] Inspector script is unavailable.');
      return;
    }
    if (inspector.isEnabled()) inspector.stop();
    else inspector.start();
    const enabled = inspector.isEnabled();
    button.setAttribute('aria-pressed', String(enabled));
    const url = new URL(host.location.href);
    url.searchParams.set('sf-inspector', String(enabled));
    host.history.replaceState(host.history.state, '', url.href);
    updateExperienceLinks();
  }

  function updateExperienceLinks() {
    container.querySelectorAll('.experience-links [data-utm-source]').forEach((link) => {
      const url = new URL(host.location.href);
      url.searchParams.delete('utm_source');
      if (link.dataset.utmSource) url.searchParams.set('utm_source', link.dataset.utmSource);
      link.href = url.href;
    });
  }
  updateExperienceLinks();

  const onClick = (event) => {
    const actionButton = event.target.closest('[data-debug-action]');
    const action = actionButton?.dataset.debugAction;
    if (action) {
      if (action === 'sdk') inspectSalesforceSdk(actionButton);
      else logDebugAction(action, host);
      return;
    }
    const button = event.target.closest('.log-decision');
    if (!button) return;
    const section = button.closest('section');
    const decisions = host.decisionsProvider;
    if (!Array.isArray(decisions)) {
      console.log('[Section decision] Decisions have not been received yet.', section);
      return;
    }
    const decision = decisions.find((item) => {
      const selector = item?.contentZone?.selector;
      if (typeof selector !== 'string' || !selector.trim()) return false;
      try {
        return section.matches(selector);
      } catch {
        return false;
      }
    });
    console.log('[Section decision]', section.id || 'unconfigured section', decision ?? null);
  };
  container.addEventListener('click', onClick);
  return () => {
    container.removeEventListener('click', onClick);
    if (inspector?.isEnabled()) inspector.stop();
  };
}

/** Inspect the latest decisions or the SDK's sitemap state without requesting new decisions. */
function logDebugAction(action, host) {
  if (action === 'decisions') {
    console.log('[Personalization] All decisions:', host.decisionsProvider ?? 'Decisions have not been received yet.');
    return;
  }
  if (action === 'raw') {
    const diagnostics = host.personalizationDiagnostics;
    if (!diagnostics) {
      console.log('[Personalization] Raw SDK response is not available yet.');
      return;
    }
    console.log('[Personalization] Requested points:', diagnostics.points);
    console.log('[Personalization] Raw SDK response:', diagnostics.response);
    console.log('[Personalization] Published decisions:', host.decisionsProvider ?? 'No published decisions.');
    return;
  }
  try {
    const sdk = host.getSalesforceInteractions?.();
    if (typeof sdk?.getSitemapResult !== 'function') {
      console.log('[Personalization] Salesforce sitemap result is unavailable.');
      return;
    }
    const result = sdk.getSitemapResult();
    if (!result) {
      console.log('[Personalization] Salesforce sitemap has not finished matching yet.');
      return;
    }
    if (action === 'page') console.log('[Personalization] Matched page:', result.matchedConfig?.name ?? null);
    if (action === 'zones') console.log('[Personalization] Content zones:', result.matchedConfig?.contentZones ?? []);
    if (action === 'status') console.log('[Personalization] Match status:', result.matchStatus ?? []);
  } catch (error) {
    console.warn('[Personalization] Unable to inspect the sitemap:', error);
  }
}
