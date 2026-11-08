/*
 * Salesforce -> Optimizely page-decision attribute POC.
 * Run as a Chrome DevTools snippet after loading the Salesforce sitemap.
 * It requests configured page decisions; it does not request content,
 * change the page, activate campaigns, or reload Optimizely.
 *
 * Console commands:
 *   vhaPoc.run()     Fetch fresh Salesforce decisions
 *   vhaPoc.inspectOptimizelyContext()
 *   vhaPoc.stop()    Ignore the result of any pending POC request.
 *
 * copy(vhaPoc.inspectOptimizelyContext());
 */
(function (host) {
  'use strict';

  /**************************************************************************
   * CONFIGURATION
   * prefix: Identifies this POC in browser console messages.
   * targetPagePersonalizationPoints: Defines which Salesforce decisions enter the process.
   * salesforceToOptimizelyDecisionMapping: Defines the Salesforce-to-Optimizely data contract.
   **************************************************************************/
  var prefix = '[VHA Salesforce Optimizely POC]';
  var targetPagePersonalizationPoints = ['page_base_poc', 'page_extended_poc', 'page_priority_poc'];
  var salesforceToOptimizelyDecisionMapping = {
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

  /**************************************************************************
   * STATE MANAGEMENT
   * requestGeneration: Identifies the current run so outdated responses can be ignored.
   * lastPayload: Preserves the latest submitted command for inspection.
   * initializeSnippet(): Establishes the public snippet instance and begins the initial flow.
   * run(): Coordinates one complete Salesforce-to-Optimizely decision flow.
   * stop(): Invalidates pending work without clearing previously submitted attributes.
   **************************************************************************/
  var requestGeneration = 0;
  var lastPayload = null;

  function initializeSnippet() {
    if (host.vhaPoc && typeof host.vhaPoc.stop === 'function') host.vhaPoc.stop();
    host.vhaPoc = {
      run: run,
      inspectOptimizelyContext: inspectOptimizelyContext,
      stop: stop
    };
    inspectOptimizelyContext();
    run();
  }

  async function run() {
    var generation = ++requestGeneration;
    try {
      var requestedUrl = host.location.href;
      var sdk = getReadySalesforceSdk();
      var decisions = await fetchSalesforcePageDecisions(sdk);
      if (generation !== requestGeneration || host.location.href !== requestedUrl) {
        console.warn(prefix, 'Ignoring an outdated decision request.');
        return;
      }
      var command = buildOptimizelyUserCommandFromDecisions(decisions);
      submitOptimizelyUserCommand(command);
    } catch (error) {
      console.warn(prefix, 'Could not fetch and publish Salesforce decisions:', error);
    }
  }

  function stop() { requestGeneration++; }

  /**************************************************************************
   * SALESFORCE
   * getReadySalesforceSdk(): Provides the Salesforce dependency required by the flow.
   * fetchSalesforcePageDecisions(): Supplies decisions for the configured page points.
   * buildOptimizelyUserCommandFromDecisions(): Translates Salesforce decisions into the Optimizely user command.
   * readSalesforceDecisionField(): Supports translation of mapped Salesforce fields.
   **************************************************************************/
  function getReadySalesforceSdk() {
    if (typeof host.getSalesforceInteractions !== 'function') throw new Error('Salesforce Interactions SDK is unavailable. Load it using the extension first.');
    var sdk = host.getSalesforceInteractions();
    if (!sdk || !sdk.Personalization || typeof sdk.Personalization.fetch !== 'function') {
      throw new Error('Salesforce Personalization.fetch API is unavailable.');
    }
    return sdk;
  }

  async function fetchSalesforcePageDecisions(sdk) {
    var points = targetPagePersonalizationPoints.slice();
    console.log(prefix, 'Requesting Salesforce page decisions for:', points);
    var response = await sdk.Personalization.fetch(points);
    if (!response || !Array.isArray(response.personalizations)) throw new Error('Unexpected Salesforce personalization response.');
    console.log(prefix, 'Salesforce page-decision response:', response);
    return response.personalizations;
  }

  function buildOptimizelyUserCommandFromDecisions(decisions) {
    var attributes = {};
    var byPoint = Object.create(null);
    decisions.forEach(function (decision) {
      var point = decision && decision.personalizationPointName;
      if (targetPagePersonalizationPoints.indexOf(point) !== -1) {
        if (byPoint[point]) console.warn(prefix, 'Multiple decisions for point; using the last:', point);
        byPoint[point] = decision;
      }
    });
    targetPagePersonalizationPoints.forEach(function (point) {
      if (!byPoint[point]) console.log(prefix, 'No decision returned for point:', point);
    });
    Object.keys(salesforceToOptimizelyDecisionMapping).forEach(function (attributeName) {
      var mapping = salesforceToOptimizelyDecisionMapping[attributeName];
      var decision = byPoint[mapping.point];
      var value = decision ? readSalesforceDecisionField(decision, mapping.field) : null;
      attributes[attributeName] = value == null ? null : String(value);
    });
    return { type: 'user', attributes: attributes };
  }

  function readSalesforceDecisionField(decision, path) {
    return path.split('.').reduce(function (value, key) {
      return value != null ? value[key] : undefined;
    }, decision);
  }

  /**************************************************************************
   * OPTIMIZELY
   * submitOptimizelyUserCommand(): Delivers the translated decision data and starts inspection.
   **************************************************************************/
  function submitOptimizelyUserCommand(command) {
    try {
      host.optimizely = host.optimizely || [];
      if (typeof host.optimizely.push !== 'function') throw new Error('Optimizely push is unavailable.');
      host.optimizely.push(command);
      lastPayload = command;
      console.log(prefix, 'User command submitted (may be queued):', command);
      inspectOptimizelyContext();
    } catch (error) {
      console.warn(prefix, 'Could not submit the user command:', error);
    }
  }

  /**************************************************************************
   * OPTIMIZELY INSPECTION
   * inspectOptimizelyContext(): Produces the public report of the current Optimizely context.
   * readOptimizelyValue(): Provides resilient access to Optimizely report inputs.
   * inspectActiveOptimizelyState(): Collects the active state included in the report.
   * selectActiveOptimizelyConfiguration(): Limits project data to the active experience context.
   * addVariation(): Retains variations linked to the selected active configuration.
   * addExperiment(): Retains experiments and their linked variations for the selected context.
   * summarizeOptimizelyConfiguration(): Creates the compact project-data overview.
   * items(): Supplies valid project entities to the configuration summary.
   **************************************************************************/
  function inspectOptimizelyContext() {
    var report = { url: host.location.href, lastSubmittedCommand: lastPayload,
      'get.visitor': readOptimizelyValue('visitor'), 'get.visitor_id': readOptimizelyValue('visitor_id'),
      'get.state': {}, 'get.data': {} };
    console.log(prefix, 'Inspection URL:', host.location.href);
    console.log(prefix, 'Last submitted user command:', report.lastSubmittedCommand);
    console.log(prefix, 'get("visitor"):', report['get.visitor']);
    console.log(prefix, 'get("visitor_id"):', report['get.visitor_id']);
    if (!host.optimizely || typeof host.optimizely.get !== 'function') {
      console.log(prefix, 'Optimizely get is not ready; the user command may be queued.');
      return report;
    }
    report['get.state'] = inspectActiveOptimizelyState(readOptimizelyValue('state'));
    var allData = readOptimizelyValue('data');
    report['get.data'] = selectActiveOptimizelyConfiguration(allData, report['get.state']);
    report.meta = { current: { data: summarizeOptimizelyConfiguration(report['get.data']) }, all: { data: summarizeOptimizelyConfiguration(allData) } };
    console.log(prefix, 'get("data") scoped to active pages and campaigns; selected objects are unchanged:', report['get.data']);
    console.log(prefix, 'Project-data summaries for current scope and all entities:', report.meta);
    return report;
  }

  function readOptimizelyValue(key) {
    if (!host.optimizely || typeof host.optimizely.get !== 'function') return undefined;
    try { return host.optimizely.get(key); }
    catch (error) { console.warn(prefix, 'Unable to read Optimizely ' + key + ':', error); }
  }

  function inspectActiveOptimizelyState(state) {
    var results = {};
    if (!state) {
      console.log(prefix, 'Optimizely state is unavailable.');
      return results;
    }
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

  function selectActiveOptimizelyConfiguration(data, state) {
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

  function summarizeOptimizelyConfiguration(data) {
    if (!data) return null;
    function items(key) {
      var collection = data[key] || {};
      return Object.keys(collection).map(function (id) { return collection[id]; }).filter(function (item) { return item && typeof item === 'object'; });
    }
    return {
      campaigns: items('campaigns').map(function (item) { return item.name == null ? null : item.name; }),
      pages: items('pages').map(function (item) { return { name: item.name == null ? null : item.name, apiName: item.apiName == null ? null : item.apiName }; }),
      experiments: items('experiments').map(function (item) { return { name: item.name == null ? null : item.name, campaignName: item.campaignName == null ? null : item.campaignName }; }),
      variations: items('variations').map(function (item) { return item.name == null ? null : item.name; })
    };
  }

  initializeSnippet();
})(window);

/**************************************************************************
 * EXECUTION FLOW
 * 1. initializeSnippet(): Replace the old instance and expose public controls.
 *    -> stop(): Invalidate the old instance when one exists.
 *    -> 2. inspectOptimizelyContext(): Capture the pre-submission context.
 *       -> 3. readOptimizelyValue(): Supply visitor, state and project data.
 *       -> 4. inspectActiveOptimizelyState(): Collect active experience state.
 *       -> 5. selectActiveOptimizelyConfiguration(): Select related project data.
 *          -> 6. addExperiment() -> addVariation(): Retain linked entities.
 *       -> 7. summarizeOptimizelyConfiguration() -> items(): Build the overview.
 *    -> 8. run(): Start the Salesforce-to-Optimizely decision flow.
 *       -> 9. getReadySalesforceSdk(): Resolve the Salesforce dependency.
 *       -> 10. fetchSalesforcePageDecisions(): Request configured page points.
 *       -> 11. buildOptimizelyUserCommandFromDecisions(): Create the user command.
 *          -> 12. readSalesforceDecisionField(): Supply each mapped value.
 *       -> 13. submitOptimizelyUserCommand(): Submit and retain the command.
 *          -> 14. inspectOptimizelyContext(): Build the post-submission report
 *                 by repeating the inspection branch in steps 3-7.
 * Public controls:
 *    run() -> step 8 | inspectOptimizelyContext() -> step 2 | stop() -> invalidate
 **************************************************************************/
