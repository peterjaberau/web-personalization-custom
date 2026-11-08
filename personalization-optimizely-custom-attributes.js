/*
 * Salesforce chooses the content and zone. Optimizely supplies the DOM utility;
 * this adapter fetches the fragment and displays the JSON in the selected zone.
 * This classic script can also be pasted into Optimizely custom code.
 */
(function (host) {
  'use strict';

  // Use the live AEM endpoint by changing these three values together.
  var contentSource = {
    baseURL: '',
    basePath: '/vha/experience_fragment',
    suffix: '/index.json'
  };
  var logPrefix = '[Salesforce Optimizely]';
  var generation = 0;
  var latestDecisions = null;
  var utils = null;
  var interval = null;
  var activeContainer = null;
  var outputs = new WeakMap();

  // Page-decision mapping is independent from the section rendering flow.
  // Salesforce returns decisionId; the configured decision names are not
  // included in the response and cannot safely be inferred from attributes.
  var targetPagePersonalizationPoints = ['page_base_poc', 'page_extended_poc', 'page_priority_poc'];
  // Each Optimizely key explicitly selects its Salesforce point and field.
  var salesforceOptimizelyDecisionMaping = {
    base_point: { point: 'page_base_poc', field: 'personalizationPointName' },
    base_decision: { point: 'page_base_poc', field: 'decisionId' },
    base_experience_scope: { point: 'page_base_poc', field: 'attributes.experienceScope' },
    base_experience_tags: { point: 'page_base_poc', field: 'attributes.experienceTags' },
    base_experience_value: { point: 'page_base_poc', field: 'attributes.experienceValue' },
    extended_point: { point: 'page_extended_poc', field: 'personalizationPointName' },
    extended_decision: { point: 'page_extended_poc', field: 'decisionId' },
    extended_experience_scope: { point: 'page_extended_poc', field: 'attributes.experienceScope' },
    extended_experience_tags: { point: 'page_extended_poc', field: 'attributes.experienceTags' },
    extended_experience_value: { point: 'page_extended_poc', field: 'attributes.experienceValue' },
    priority_point: { point: 'page_priority_poc', field: 'personalizationPointName' },
    priority_decision: { point: 'page_priority_poc', field: 'decisionId' },
    priority_experience_scope: { point: 'page_priority_poc', field: 'attributes.experienceScope' },
    priority_experience_tags: { point: 'page_priority_poc', field: 'attributes.experienceTags' },
    priority_experience_value: { point: 'page_priority_poc', field: 'attributes.experienceValue' }
  };
  var pageDecisionConfig = {
    retryIntervalMs: 250,
    waitTimeoutMs: 30000
  };
  var attributeLogPrefix = '[Optimizely page decision attributes]';
  var lastAttributePayload = null;
  var pageRequestGeneration = 0;
  var pageRequestTimer = null;

  // Step 1. Request page-level decisions once Salesforce and its sitemap are ready.
  // This is separate from the sitemap event used for section rendering.
  function requestPageDecisions() {
    var requestId = ++pageRequestGeneration;
    var requestedUrl = host.location.href;
    var deadline = Date.now() + pageDecisionConfig.waitTimeoutMs;
    if (pageRequestTimer !== null) host.clearTimeout(pageRequestTimer);

    function attempt() {
      pageRequestTimer = null;
      if (requestId !== pageRequestGeneration || host.location.href !== requestedUrl) return;
      var sdk;
      var sitemap;
      try {
        sdk = typeof host.getSalesforceInteractions === 'function' && host.getSalesforceInteractions();
        sitemap = sdk && typeof sdk.getSitemapResult === 'function' && sdk.getSitemapResult();
      } catch (error) {
        // The SDK accessor may throw during initialization; retry until timeout.
      }
      if (!sdk || !sdk.Personalization || typeof sdk.Personalization.fetch !== 'function' || !sitemap || !sitemap.matchedConfig) {
        if (Date.now() >= deadline) {
          console.warn(attributeLogPrefix, 'Salesforce SDK or sitemap not ready; page decisions were not requested.');
          return;
        }
        pageRequestTimer = host.setTimeout(attempt, pageDecisionConfig.retryIntervalMs);
        return;
      }
      try {
        var points = targetPagePersonalizationPoints.slice();
        console.log(attributeLogPrefix, 'Requesting page decisions for:', points);
        Promise.resolve(sdk.Personalization.fetch(points)).then(function (response) {
          if (requestId !== pageRequestGeneration || host.location.href !== requestedUrl) {
            console.warn(attributeLogPrefix, 'Ignoring an outdated page-decision response.');
            return;
          }
          receivePageDecisions(response);
        }).catch(function (error) {
          if (requestId === pageRequestGeneration) console.warn(attributeLogPrefix, 'Page-decision request failed:', error);
        });
      } catch (error) {
        console.warn(attributeLogPrefix, 'Unable to request page decisions:', error);
      }
    }
    attempt();
  }

  function readDecisionField(decision, path) {
    return path.split('.').reduce(function (value, key) {
      return value != null ? value[key] : undefined;
    }, decision);
  }

  // Map only configured keys. A successful response clears missing point/field
  // values so persisted Optimizely attributes do not describe an older batch.
  function mapPageDecisionAttributes(decisions) {
    var attributes = {};
    var byPoint = Object.create(null);
    decisions.forEach(function (decision) {
      var point = decision && decision.personalizationPointName;
      if (targetPagePersonalizationPoints.indexOf(point) !== -1) {
        if (byPoint[point]) console.warn(attributeLogPrefix, 'Multiple decisions for point; using the last:', point);
        byPoint[point] = decision;
      }
    });
    targetPagePersonalizationPoints.forEach(function (point) {
      if (!byPoint[point]) console.log(attributeLogPrefix, 'No decision returned for point:', point);
    });
    Object.keys(salesforceOptimizelyDecisionMaping).forEach(function (attributeName) {
      var mapping = salesforceOptimizelyDecisionMaping[attributeName];
      var decision = byPoint[mapping.point];
      var value = decision ? readDecisionField(decision, mapping.field) : null;
      attributes[attributeName] = value == null ? null : String(value);
    });
    return attributes;
  }

  // Step 2.b. Receive and map page decisions before submitting to Optimizely.
  function receivePageDecisions(response) {
    if (!response || !Array.isArray(response.personalizations)) {
      console.warn(attributeLogPrefix, 'Invalid Salesforce response; leaving existing attributes unchanged:', response);
      return;
    }
    console.log(attributeLogPrefix, 'Salesforce page-decision response:', response);
    var payload = { type: 'user', attributes: mapPageDecisionAttributes(response.personalizations) };
    try {
      host.optimizely = host.optimizely || [];
      if (typeof host.optimizely.push !== 'function') throw new Error('Optimizely push is unavailable');
      host.optimizely.push(payload);
      lastAttributePayload = payload;
      console.log(attributeLogPrefix, 'User command submitted (may be queued):', payload);
      inspectDecisionAttribute('after page decisions');
    } catch (error) {
      console.warn(attributeLogPrefix, 'Could not submit the user command.', error);
    }
  }

  function inspectDecisionAttribute(reason) {
    console.log(attributeLogPrefix, 'Inspection:', reason, 'last submitted command:', lastAttributePayload);
    if (!host.optimizely || typeof host.optimizely.get !== 'function') {
      console.log(attributeLogPrefix, 'Optimizely get API is not ready; a submitted command may still be queued.');
      return;
    }
    ['visitor', 'visitor_id', 'data', 'state'].forEach(function (key) {
      try {
        var value = host.optimizely.get(key);
        console.log(attributeLogPrefix, 'get("' + key + '"):', value);
        if (key === 'state') logOptimizelyStateMethods(value);
      } catch (error) {
        console.warn(attributeLogPrefix, 'Unable to inspect ' + key + '.', error);
      }
    });
  }

  // Call each exposed state method without arguments; isolate failures so a
  // method that requires parameters does not prevent the others from logging.
  function logOptimizelyStateMethods(state) {
    [
      'getActivationId', 'getActiveExperimentIds', 'getCampaignStateLists',
      'getCampaignStates', 'getDecisionObject', 'getDecisionString',
      'getExperimentStates', 'getPageStates', 'getRedirectInfo',
      'getTrafficExclusionStats', 'getVariationMap', 'isGlobalHoldback'
    ].forEach(function (name) {
      if (!state || typeof state[name] !== 'function') {
        console.log(attributeLogPrefix, 'state.' + name + '(): unavailable');
        return;
      }
      try {
        console.log(attributeLogPrefix, 'state.' + name + '():', state[name]());
      } catch (error) {
        console.warn(attributeLogPrefix, 'state.' + name + '() failed:', error);
      }
    });
  }

  var inspectButton = host.document.querySelector('[data-optimizely-attribute-inspect]');
  if (inspectButton) inspectButton.addEventListener('click', function () {
    inspectDecisionAttribute('manual inspection');
  });

  // Step 1.a. Subscribe to and forward Salesforce section decisions.
  function connectToDecisions(apply, containerSelector) {
    if (typeof apply !== 'function') throw new Error('A personalization renderer is required');
    var container = host.document.querySelector(containerSelector || 'body');
    if (!container) throw new Error('Personalization container not found: ' + containerSelector);
    apply(container);
    function onDecisions(event) {
      if (Array.isArray(event.detail)) apply(container, event.detail);
    }
    host.addEventListener('personalization:decisions', onDecisions);
    if (Array.isArray(host.decisionsProvider)) apply(container, host.decisionsProvider);
    return function () { host.removeEventListener('personalization:decisions', onDecisions); };
  }

  // Step 2.a. Store section decisions and try to process them.
  function receiveDecisions(container, decisions) {
    if (!Array.isArray(decisions)) return;
    activeContainer = container;
    generation += 1;
    latestDecisions = decisions;
    processLatestDecisions();
  }

  // Step 3. Obtain Optimizely utilities and try to process any stored decisions.
  function tryInitializeOptimizely() {
    try {
      if (!host.optimizely || typeof host.optimizely.get !== 'function') return false;
      var candidate = host.optimizely.get('utils');
      if (!candidate || typeof candidate.waitForElement !== 'function') return false;
      utils = candidate;
      inspectDecisionAttribute('Optimizely utilities ready');
      // Decisions for the previous URL must not be applied on an SPA navigation.
      if (typeof utils.onUrlChange === 'function') utils.onUrlChange(function () {
        generation += 1;
        latestDecisions = null;
        requestPageDecisions();
      });
      processLatestDecisions();
      return true;
    } catch (error) {
      console.warn(logPrefix, 'Unable to access Optimizely utilities.', error);
      return false;
    }
  }

  // Step 4. Process a batch only when decisions and utilities are both ready.
  // If a selector occurs more than once, only its last decision is passed on.
  // Capture the generation so applyDecisionToZone can discard outdated results;
  // this function itself does not fetch content or modify the page.
  function processLatestDecisions() {
    if (!utils || !latestDecisions) return;
    var batch = generation;
    // A later decision for the same selector wins, even if responses arrive out of order.
    latestDecisions.forEach(function (decision, index) {
      var selector = decision && decision.contentZone && decision.contentZone.selector;
      if (latestDecisions.slice(index + 1).some(function (next) {
        return selector && next && next.contentZone && next.contentZone.selector === selector;
      })) return;
      applyDecisionToZone(decision, batch);
    });
  }

  // Step 5. Coordinate mapping, waiting, UI creation, fetching and display.
  function applyDecisionToZone(decision, batch) {
    var mapped = mapDecisionToContent(decision);
    if (!mapped) return;
    // Step 8. Ask Optimizely to wait for the mapped section.
    Promise.resolve().then(function () {
      return utils.waitForElement(mapped.selector);
    }).then(function (zone) {
      if (batch !== generation || !zone || !zone.isConnected) return;
      if (!activeContainer || !activeContainer.contains(zone)) return;
      var view = createOrUpdateDecisionView(zone, mapped);
      if (!view) return;
      return fetchFragment(mapped.url).then(function (fragment) {
        if (batch === generation && zone.isConnected) showFragmentResponse(view, fragment);
      }).catch(function (error) {
        if (batch === generation && zone.isConnected) {
          view.output.textContent = 'Unable to load the JSON response.';
          console.warn(logPrefix, 'Unable to load fragment:', mapped.path, error);
        }
      });
    }).catch(function (error) {
      if (batch === generation) console.warn(logPrefix, 'Unable to process content zone:', mapped.selector, error);
    });
  }

  // Step 6. Extract and validate the decision values.
  function mapDecisionToContent(decision) {
    var selector = decision && decision.contentZone && decision.contentZone.selector;
    var path = decision && decision.attributes && decision.attributes.contentPath;
    if (typeof selector !== 'string' || !selector.trim() || typeof path !== 'string' || !path.trim()) return null;
    selector = selector.trim();
    try {
      host.document.querySelector(selector); // Validate before passing it to Optimizely.
      return { selector: selector, path: path.trim(), url: buildFragmentURL(path),
        title: decision.personalizationPointName || decision.contentZone.name || 'Personalization',
        experience: decision.attributes.experienceKey || 'Unknown experience' };
    } catch (error) {
      console.warn(logPrefix, 'Skipping invalid decision.', error);
      return null;
    }
  }

  // Step 7. Validate the content path and build its URL.
  function buildFragmentURL(contentPath) {
    var path = contentPath.trim().replace(/^\/+/, '');
    if (!path || path.split('/').some(function (part) {
      return !part || part === '.' || part === '..';
    }) || /[?#\\%]/.test(path)) throw new Error('Invalid content path: ' + contentPath);
    var base = contentSource.baseURL || host.location.origin;
    return base.replace(/\/+$/, '') + contentSource.basePath.replace(/\/+$/, '') + '/' + path + contentSource.suffix;
  }

  // Step 9. Create or update the section UI without fetching content.
  function createOrUpdateDecisionView(zone, mapped) {
    var view = outputs.get(zone);
    if (!view || !zone.contains(view.output)) {
      var target = zone.matches('.section-content') ? zone : zone.querySelector('.section-content');
      if (!target) {
        console.warn(logPrefix, 'Section content container not found:', mapped.selector);
        return null;
      }
      var heading = host.document.createElement('h1');
      var details = host.document.createElement('details');
      var summary = host.document.createElement('summary');
      var output = host.document.createElement('pre');
      var button = host.document.createElement('button');
      button.type = 'button';
      button.className = 'log-decision';
      button.textContent = 'Log decision';
      details.appendChild(summary);
      details.appendChild(output);
      target.appendChild(heading);
      target.appendChild(details);
      target.appendChild(button);
      view = { heading: heading, summary: summary, output: output };
      outputs.set(zone, view);
    }
    view.heading.textContent = String(mapped.title);
    view.summary.textContent = String(mapped.experience) + ': ' + mapped.path;
    view.output.textContent = 'Loading JSON response...';
    return view;
  }

  // Step 10. Fetch and validate JSON without changing the page.
  function fetchFragment(url) {
    return host.fetch(url).then(function (response) {
      if (!response.ok) throw new Error('AEM request failed (' + response.status + ')');
      return response.json();
    }).then(function (fragment) {
      if (!fragment || typeof fragment.html !== 'string') throw new Error('AEM response does not contain HTML');
      return fragment;
    });
  }

  // Step 11. Display the fetched JSON as text.
  function showFragmentResponse(view, fragment) {
    view.output.textContent = JSON.stringify(fragment, null, 2);
  }

  connectToDecisions(receiveDecisions, 'main');
  requestPageDecisions();
  if (!tryInitializeOptimizely()) {
    console.warn(logPrefix, 'Waiting for Optimizely utilities.');
    interval = host.setInterval(function () {
      if (tryInitializeOptimizely()) host.clearInterval(interval);
    }, 250);
  }
})(window);
