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

  // Independent diagnostic path: publish a string-valued Web Experimentation
  // attribute without changing the existing Salesforce rendering flow.
  var attributeLogPrefix = '[Optimizely decision attributes]';
  var lastAttributePayload = null;
  var previousDecisionAttributeKeys = [];

  function publishDecisionAttribute(decisions) {
    var mapped = decisions.map(function (decision) {
      var zone = decision && decision.contentZone || {};
      var attributes = decision && decision.attributes || {};
      return {
        contentZone: { name: zone.name || null, selector: zone.selector || null },
        contentPath: attributes.contentPath || null,
        experienceKey: attributes.experienceKey || null,
        isSalesforceDecision: 'true'
      };
    });
    // Clear keys from the preceding batch on this page before setting the new
    // values. Optimizely may retain attributes from earlier page loads.
    var attributes = { decisions: JSON.stringify(mapped) };
    previousDecisionAttributeKeys.forEach(function (key) { attributes[key] = null; });
    var currentKeys = [];
    decisions.forEach(function (decision, index) {
      var point = decision && decision.personalizationPointName;
      if (typeof point !== 'string' || !/^[A-Za-z0-9_]+$/.test(point)) {
        console.warn(attributeLogPrefix, 'Skipping flat attributes for an invalid personalization point name:', point);
        return;
      }
      var item = mapped[index];
      var values = {
        contentZoneName: item.contentZone.name,
        contentZoneSelector: item.contentZone.selector,
        contentPath: item.contentPath,
        experienceKey: item.experienceKey,
        isSalesforceDecision: item.isSalesforceDecision
      };
      Object.keys(values).forEach(function (field) {
        var key = point + '_' + field;
        attributes[key] = values[field] == null ? null : String(values[field]);
        if (currentKeys.indexOf(key) === -1) currentKeys.push(key);
      });
    });
    var payload = { type: 'user', attributes: attributes };
    try {
      host.optimizely = host.optimizely || [];
      if (typeof host.optimizely.push !== 'function') throw new Error('Optimizely push is unavailable');
      host.optimizely.push(payload);
      lastAttributePayload = payload;
      previousDecisionAttributeKeys = currentKeys;
      console.log(attributeLogPrefix, 'User command submitted (may be queued):', payload);
      console.log(attributeLogPrefix, 'Decoded decisions:', mapped);
      inspectDecisionAttribute('after user command');
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

  // Step 1. Subscribe to and forward Salesforce decisions.
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

  // Step 2. Store decisions and try to process them.
  function receiveDecisions(container, decisions) {
    if (!Array.isArray(decisions)) return;
    activeContainer = container;
    generation += 1;
    latestDecisions = decisions;
    publishDecisionAttribute(decisions);
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
  if (!tryInitializeOptimizely()) {
    console.warn(logPrefix, 'Waiting for Optimizely utilities.');
    interval = host.setInterval(function () {
      if (tryInitializeOptimizely()) host.clearInterval(interval);
    }, 250);
  }
})(window);
