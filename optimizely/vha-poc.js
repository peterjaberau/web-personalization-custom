/*
 * Vodafone Team Plans Salesforce -> Optimizely attribute POC.
 * Run as a Chrome DevTools snippet after loading the Salesforce sitemap.
 * It requests decisions for the SDK's matched page; it does not request content,
 * change the page, activate campaigns, or reload Optimizely.
 *
 * Console commands:
 *   vhaPoc.run()     Fetch fresh Salesforce decisions for the matched page
 *                    and submit their attributes to Optimizely. The snippet
 *                    also runs this once automatically when loaded.
 *   vhaPoc.inspect() Log the submitted command, visitor and current Optimizely
 *                    active page, campaign and experiment state plus the
 *                    related configuration; returns an object
 *                    with get.state and filtered get.data as separate keys.
 *                    It does not fetch or submit Salesforce decisions.
 *   vhaPoc.stop()    Ignore the result of any pending POC request. It does not
 *                    clear attributes already submitted to Optimizely.
 *
 * copy(vhaPoc.inspect());
 */
(function (host) {
  'use strict';

  var prefix = '[VHA Salesforce Optimizely POC]';
  var targetPath = '/business/team-plans';
  var previousKeys = [];
  var requestGeneration = 0;
  var lastPayload = null;

  // Invalidate a request from an earlier execution of the snippet.
  if (host.vhaPoc && typeof host.vhaPoc.stop === 'function') host.vhaPoc.stop();

  function onTargetPage() {
    return host.location.hostname === 'www.vodafone.com.au' && host.location.pathname.replace(/\/$/, '') === targetPath;
  }

  function readOptimizely(key) {
    if (!host.optimizely || typeof host.optimizely.get !== 'function') return undefined;
    try { return host.optimizely.get(key); }
    catch (error) { console.warn(prefix, 'Unable to read Optimizely ' + key + ':', error); }
  }

  function inspect() {
    var report = { url: host.location.href, lastSubmittedCommand: lastPayload,
      'get.visitor': readOptimizely('visitor'), 'get.visitor_id': readOptimizely('visitor_id'),
      'get.state': {}, 'get.data': {} };
    console.log(prefix, 'Inspection URL:', host.location.href);
    console.log(prefix, 'Last submitted user command:', report.lastSubmittedCommand);
    console.log(prefix, 'get("visitor"):', report['get.visitor']);
    console.log(prefix, 'get("visitor_id"):', report['get.visitor_id']);
    if (!host.optimizely || typeof host.optimizely.get !== 'function') {
      console.log(prefix, 'Optimizely get is not ready; the user command may be queued.');
      return report;
    }
    report['get.state'] = inspectOptimizelyState(readOptimizely('state'));
    report['get.data'] = selectActiveConfiguration(readOptimizely('data'), report['get.state']);
    console.log(prefix, 'get("data") scoped to active pages and campaigns; selected objects are unchanged:', report['get.data']);
    return report;
  }

  function inspectOptimizelyState(state) {
    var results = {};
    if (!state) {
      console.log(prefix, 'Optimizely state is unavailable.');
      return results;
    }
    // Only keep active states; every call is isolated from failures in others.
    [
      ['getPageStates', 'Active pages and configured tags'],
      ['getCampaignStates', 'Active campaigns, audiences and assigned variations'],
      ['getExperimentStates', 'Active experiments and assigned variations']
    ].forEach(function (entry) {
      var name = entry[0];
      if (typeof state[name] !== 'function') {
        results[name] = { error: 'Method unavailable' };
        console.log(prefix, entry[1] + ': unavailable');
        return;
      }
      try {
        var result = state[name]({ isActive: true });
        results[name] = result;
        console.log(prefix, entry[1] + ':', result);
      } catch (error) {
        results[name] = { error: String(error) };
        console.warn(prefix, 'Unable to call state.' + name + '():', error);
      }
    });
    console.log(prefix, 'These are observed states; they do not establish that Salesforce attributes caused campaign eligibility or show which DOM elements changed.');
    return results;
  }

  // Select top-level entities related to active pages and campaigns. Each
  // selected object, including all nested experiments and variations, is the
  // original object returned by Optimizely. Keep audiences intact because
  // audience conditions can contain nested references.
  function selectActiveConfiguration(data, state) {
    var selected = Object.assign({}, data || {});
    selected.pages = {};
    selected.campaigns = {};
    selected.experiments = {};
    selected.variations = {};
    if (!data) return selected;
    var campaigns = state.getCampaignStates || {};
    var experiments = state.getExperimentStates || {};
    function addVariation(id) {
      if (id != null && data.variations && data.variations[id]) selected.variations[id] = data.variations[id];
    }
    function addExperiment(id) {
      var experiment = id != null && data.experiments && data.experiments[id];
      if (!experiment) return;
      selected.experiments[id] = experiment;
      (experiment.variations || []).forEach(function (variation) { if (variation) addVariation(variation.id); });
    }
    Object.keys(state.getPageStates || {}).forEach(function (id) {
      if (state.getPageStates[id] && state.getPageStates[id].isActive && data.pages && data.pages[id]) selected.pages[id] = data.pages[id];
    });
    Object.keys(campaigns).forEach(function (id) {
      var current = campaigns[id];
      if (!current || !current.isActive) return;
      var campaign = data.campaigns && data.campaigns[id];
      if (campaign) {
        selected.campaigns[id] = campaign;
        (campaign.experiments || []).forEach(function (experiment) {
          if (experiment) {
            addExperiment(experiment.id);
            (experiment.variations || []).forEach(function (variation) { if (variation) addVariation(variation.id); });
          }
        });
      }
      addExperiment(current.experiment && current.experiment.id);
      addVariation(current.variation && current.variation.id);
      (current.allExperiments || []).forEach(function (experiment) { if (experiment) addExperiment(experiment.id); });
    });
    Object.keys(experiments).forEach(function (id) {
      var current = experiments[id];
      if (current && current.isActive) {
        addExperiment(id);
        addVariation(current.variation && current.variation.id);
      }
    });
    return selected;
  }

  function buildAttributes(decisions) {
    var attributes = {};
    var currentKeys = [];
    previousKeys.forEach(function (key) { attributes[key] = null; });
    var mapped = [];
    decisions.forEach(function (decision) {
      var point = decision && decision.personalizationPointName;
      if (typeof point !== 'string' || !/^[A-Za-z0-9_]+$/.test(point)) {
        console.warn(prefix, 'Skipping decision with invalid personalizationPointName:', point);
        return;
      }
      var zone = decision.contentZone || {};
      var data = decision.attributes || {};
      var values = {
        contentZoneName: zone.name,
        contentZoneSelector: zone.selector,
        contentPath: data.contentPath,
        experienceKey: data.experienceKey,
        isSalesforceDecision: 'true'
      };
      mapped.push({ personalizationPointName: point, contentZone: { name: zone.name || null, selector: zone.selector || null },
        contentPath: data.contentPath || null, experienceKey: data.experienceKey || null, isSalesforceDecision: 'true' });
      Object.keys(values).forEach(function (field) {
        var key = point + '_' + field;
        attributes[key] = values[field] == null ? null : String(values[field]);
        if (currentKeys.indexOf(key) === -1) currentKeys.push(key);
      });
    });
    attributes.decisions = JSON.stringify(mapped);
    return { command: { type: 'user', attributes: attributes }, keys: currentKeys, decisions: mapped };
  }

  function publish(batch) {
    try {
      host.optimizely = host.optimizely || [];
      if (typeof host.optimizely.push !== 'function') throw new Error('Optimizely push is unavailable.');
      host.optimizely.push(batch.command);
      previousKeys = batch.keys;
      lastPayload = batch.command;
      console.log(prefix, 'Mapped decisions:', batch.decisions);
      console.log(prefix, 'User command submitted (may be queued):', batch.command);
      inspect();
    } catch (error) {
      console.warn(prefix, 'Could not submit the user command:', error);
    }
  }

  function getSalesforceSdk() {
    if (typeof host.getSalesforceInteractions !== 'function') throw new Error('Salesforce Interactions SDK is unavailable. Load it using the extension first.');
    var sdk = host.getSalesforceInteractions();
    if (!sdk || typeof sdk.getSitemapResult !== 'function' || !sdk.Personalization || typeof sdk.Personalization.fetch !== 'function') {
      throw new Error('Salesforce sitemap or Personalization.fetch API is unavailable.');
    }
    return sdk;
  }

  function getMatchedZones(sdk) {
    var result = sdk.getSitemapResult();
    var page = result && result.matchedConfig;
    if (!page || page.name !== 'Business Team Plans page') {
      throw new Error('Salesforce has not matched the Business Team Plans page. Check the sitemap and run vhaPoc.run() again.');
    }
    if (!Array.isArray(page.contentZones)) throw new Error('The matched page has no content zones.');
    var zones = new Map();
    page.contentZones.forEach(function (zone) {
      if (zone && typeof zone.name === 'string' && zone.name.trim() && !zones.has(zone.name)) zones.set(zone.name, zone);
    });
    if (!zones.size) throw new Error('The matched page has no valid content zone names.');
    console.log(prefix, 'Matched Salesforce page:', page.name, 'zones:', Array.from(zones.values()));
    return zones;
  }

  async function fetchDecisions(sdk, zones) {
    var points = Array.from(zones.keys());
    var response = await sdk.Personalization.fetch(points);
    if (!response || !Array.isArray(response.personalizations)) throw new Error('Unexpected Salesforce personalization response.');
    console.log(prefix, 'Requested personalization points:', points, 'Salesforce response:', response);
    return response.personalizations.reduce(function (items, item) {
      var zone = item && zones.get(item.personalizationPointName);
      if (zone) items.push(Object.assign({}, item, { contentZone: { name: zone.name, selector: zone.selector || null } }));
      return items;
    }, []);
  }

  async function run() {
    var generation = ++requestGeneration;
    try {
      if (!onTargetPage()) throw new Error('Open https://www.vodafone.com.au/business/team-plans before running the POC.');
      var sdk = getSalesforceSdk();
      var zones = getMatchedZones(sdk);
      var decisions = await fetchDecisions(sdk, zones);
      if (generation !== requestGeneration || !onTargetPage()) {
        console.warn(prefix, 'Ignoring an outdated decision request.');
        return;
      }
      // Do not publish if the sitemap changed while the request was pending.
      var currentZones = getMatchedZones(sdk);
      if (JSON.stringify(Array.from(zones.entries())) !== JSON.stringify(Array.from(currentZones.entries()))) {
        throw new Error('The matched content zones changed while fetching. Run vhaPoc.run() again.');
      }
      publish(buildAttributes(decisions));
    } catch (error) {
      console.warn(prefix, 'Could not fetch and publish Salesforce decisions:', error);
    }
  }

  function stop() { requestGeneration++; }

  host.vhaPoc = { run: run, inspect: inspect, stop: stop };
  inspect(); // Capture the Optimizely state before submitting Salesforce attributes.
  run();
})(window);
