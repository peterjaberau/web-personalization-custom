"use strict";

/**
 * ES5 version for a classic script or Optimizely variation code block.
 * The functions and contentSource are available in the script's scope.
 */
var contentSource = {
  baseURL: 'https://www.vodafone.com.au/rest/experienceFragments?path=/content/experience-fragments',
  basePath: '/vha/experience_fragment',
  suffix: ''
};

/** Receive sitemap decisions, including decisions published before connection. */
function connectToDecisions(apply, containerSelector, host) {
  containerSelector = containerSelector === undefined ? 'body' : containerSelector;
  host = host === undefined ? window : host;
  if (typeof apply !== 'function') throw new Error('A personalization renderer is required');
  var container = host.document.querySelector(containerSelector);
  if (!container) throw new Error('Personalization container not found: ' + containerSelector);
  apply(container);

  var onDecisions = function (event) {
    if (Array.isArray(event.detail)) apply(container, event.detail);
  };
  host.addEventListener('personalization:decisions', onDecisions);
  if (Array.isArray(host.decisionsProvider)) apply(container, host.decisionsProvider);
  return function () { host.removeEventListener('personalization:decisions', onDecisions); };
}

// Track the latest request for each zone without WeakMap or Symbol.
var latestRequests = [];
function requestState(zone) {
  var i;
  for (i = 0; i < latestRequests.length; i += 1) {
    if (latestRequests[i].zone === zone) return latestRequests[i];
  }
  var state = { zone: zone, current: null };
  latestRequests.push(state);
  return state;
}

/** Fetch each selected AEM JSON response and display it as text in its zone. */
function applyPersonalizationFromOptimizely(container, decisions) {
  decisions = decisions === undefined ? [] : decisions;
  decisions.forEach(function (decision) {
    var selector = decision && decision.contentZone && decision.contentZone.selector;
    var contentPath = decision && decision.attributes && decision.attributes.contentPath;
    if (typeof selector !== 'string' || !selector.trim() ||
        typeof contentPath !== 'string' || !contentPath.trim()) return;

    var zone;
    try {
      zone = container.querySelector(selector);
    } catch (error) {
      console.warn('[optimizely Personalization]: Invalid content zone selector:', selector, error);
      return;
    }
    if (!zone) return;

    var path = contentPath.trim().replace(/^\/+/, '');
    if (!path || path.split('/').some(function (segment) {
      return !segment || segment === '.' || segment === '..';
    }) || /[?#\\%]/.test(path)) {
      console.warn('[optimizely Personalization]: Invalid AEM content path:', contentPath);
      return;
    }

    var pathLabel = zone.querySelector('[data-personalization-content-path]');
    if (pathLabel) pathLabel.textContent = 'Content path: ' + contentPath.trim();
    var output = zone.querySelector('[data-personalization-json]');
    if (!output) return;

    var state = requestState(zone);
    var token = {};
    state.current = token;
    output.textContent = 'Loading JSON response...';

    function fail(error) {
      if (state.current === token) {
        output.textContent = 'Unable to load the JSON response.';
        console.warn('[optimizely Personalization]: Unable to render AEM fragment:', contentPath, error);
      }
    }

    try {
      var location = container.ownerDocument.location || window.location;
      var base = contentSource.baseURL || location.protocol + '//' + location.host;
      var prefix = contentSource.basePath.replace(/\/+$/, '');
      // Concatenate the query-string root before the path so AEM's ?path= value is preserved.
      var url = base.replace(/\/+$/, '') + prefix + '/' + path + (contentSource.suffix || '');
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = function () {
        try {
          if (xhr.status < 200 || xhr.status >= 300) throw new Error('AEM request failed (' + xhr.status + ')');
          var fragment = JSON.parse(xhr.responseText);
          if (!fragment || typeof fragment.html !== 'string') throw new Error('AEM response does not contain HTML');
          if (state.current === token) output.textContent = JSON.stringify(fragment, null, 2);
        } catch (error) {
          fail(error);
        }
      };
      xhr.onerror = function () { fail(new Error('AEM request failed')); };
      xhr.send();
    } catch (error) {
      fail(error);
    }
  });
}

var bentofn = {
  aid: 'DCP-18263',
  config: { TickerHtml: '' },
  observe: function () {
    croWD.hotbed.listen('croPageTrack', function (observable, eventType, data) {
      bentofn.init();
    });
    bentofn.init();
  },
  init: function () {
    croWD.debug('######### ... DCP18263 ... ###### ...initialised...########');
    this.addHtml();
    this.addStyling();
  },
  addHtml: function () {
    // Optimizely's waitForElement provides the thenable used here.
    var utils = window.optimizely.get('utils');
    utils.waitForElement('body').then(function () {
      connectToDecisions(applyPersonalizationFromOptimizely, 'body');
    });
  },
  addStyling: function () {}
};

var crowdMaxDCP18263Counter = 5;
var crowdFinderDCP18263 = setInterval(function () {
  crowdMaxDCP18263Counter = crowdMaxDCP18263Counter - 1;
  if (typeof croWD !== 'undefined') {
    clearInterval(crowdFinderDCP18263);
    bentofn.observe();
    croWD.cmdr('DCP-18263', 'inject');
  }
  if (crowdMaxDCP18263Counter <= 0) clearInterval(crowdFinderDCP18263);
}, 1000);
