/* Generic console helper: paste this file, then call inspector('name'). */
(function (host) {
  'use strict';

  var inspectors = Object.create(null);

  function assertName(name) {
    if (typeof name !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ||
        name === '__proto__' || name === 'prototype' || name === 'constructor') {
      throw new Error('Use a valid JavaScript identifier for the shortcut name.');
    }
  }

  function inspector(name) {
    assertName(name);
    if (inspectors[name]) {
      if (host[name] !== inspectors[name]) throw new Error('The global ' + name + ' has been replaced.');
      return inspectors[name];
    }
    if (name in host) throw new Error('The global ' + name + ' already exists; choose another name.');

    var instance = Object.create(null);
    function define(name, descriptor) {
      assertName(name);
      if (name === 'add' || name === 'addGetter' || name === 'import') {
        throw new Error('The name ' + name + ' is reserved by the inspector.');
      }
      descriptor.enumerable = true;
      descriptor.configurable = true;
      Object.defineProperty(instance, name, descriptor);
      return instance;
    }
    Object.defineProperties(instance, {
      add: { value: function (key, value) {
        return define(key, { value: value, writable: true });
      } },
      addGetter: { value: function (key, getter) {
        if (typeof getter !== 'function') throw new TypeError('The getter must be a function.');
        return define(key, { get: getter });
      } },
      import: { value: function (commands) {
        if (typeof commands !== 'function') throw new TypeError('Import expects a function.');
        commands(instance);
        return instance;
      } }
    });
    inspectors[name] = instance;
    host[name] = instance;
    return instance;
  }

  host.inspector = inspector;
})(window);

/*
 * Optional Optimizely preset. Importing it adds shortcuts to any inspector:
 *
 *   inspector('opt');
 *   opt.import(optimizelyCommands);
 *   opt.getdata;
 *   opt.getvisitor;
 *   opt.getCampaignStates();
 *   opt.push({ type: 'user', attributes: { example: 'value' } });
 */
(function (host) {
  'use strict';

  // Import into any inspector; no Optimizely calls are made until a shortcut
  // is accessed or invoked, so the preset also works before the SDK loads.
  function optimizelyCommands(target) {
    function sdk() {
      if (!host.optimizely) throw new Error('Optimizely is not available on this page.');
      return host.optimizely;
    }
    function get(key) {
      var opt = sdk();
      if (typeof opt.get !== 'function') throw new Error('Optimizely get is not ready yet.');
      return opt.get(key);
    }
    target.addGetter('optimizely', sdk);
    ['data', 'state', 'visitor', 'visitor_id', 'utils'].forEach(function (key) {
      var name = key === 'visitor_id' ? 'getvisitorid' : 'get' + key;
      target.addGetter(name, function () { return get(key); });
    });
    target.add('get', function (key) { return get(key); });
    target.add('push', function (command) {
      var opt = sdk();
      if (typeof opt.push !== 'function') throw new Error('Optimizely push is not available.');
      return opt.push(command);
    });
    [
      'getActivationId', 'getActiveExperimentIds', 'getCampaignStateLists',
      'getCampaignStates', 'getDecisionObject', 'getDecisionString',
      'getExperimentStates', 'getPageStates', 'getRedirectInfo',
      'getTrafficExclusionStats', 'getVariationMap', 'isGlobalHoldback'
    ].forEach(function (name) {
      target.add(name, function () {
        var state = get('state');
        if (!state || typeof state[name] !== 'function') {
          throw new Error('Optimizely state method ' + name + ' is not available.');
        }
        return state[name].apply(state, arguments);
      });
    });
  }

  host.optimizelyCommands = optimizelyCommands;
})(window);

/* Optional Salesforce Interactions SDK preset:
 *   inspector('sf');
 *   sf.import(salesforceInteractions);
 *   sf.salesforceSDK;
 */
(function (host) {
  'use strict';

  function salesforceInteractions(target) {
    if (typeof host.getSalesforceInteractions !== 'function') {
      throw new Error('Salesforce Interactions SDK is not available on this page.');
    }
    target.add('salesforceSDK', host.getSalesforceInteractions());
  }

  host.salesforceInteractions = salesforceInteractions;
})(window);
