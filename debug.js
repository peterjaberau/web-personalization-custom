/** Log the cached decision associated with a section's debug button. */
export function connectDecisionDebug(containerSelector = 'body', host = window) {
  const container = host.document.querySelector(containerSelector);
  if (!container) throw new Error(`Debug container not found: ${containerSelector}`);

  container.querySelectorAll('.experience-links [data-utm-source]').forEach((link) => {
    const url = new URL(host.location.href);
    url.searchParams.delete('utm_source');
    if (link.dataset.utmSource) url.searchParams.set('utm_source', link.dataset.utmSource);
    link.href = url.href;
  });

  const onClick = (event) => {
    const action = event.target.closest('[data-debug-action]')?.dataset.debugAction;
    if (action) {
      logDebugAction(action, host);
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
  return () => container.removeEventListener('click', onClick);
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
