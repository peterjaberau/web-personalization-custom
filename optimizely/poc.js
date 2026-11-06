'use strict';
var bentofn = {
    aid: 'DCP-18263',
    config: {


        TickerHtml: '<style>:root{font-family:Arial,Helvetica,sans-serif;color:#172033;background:#fff}*{box-sizing:border-box}body{margin:0}main>section{min-height:200px;border:1px solid #d5dbe4}.page-section{padding:6px 16px}.section-content{width:min(100%,1200px);min-height:200px;margin:0 auto;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center}.page-section h1{margin:0;font-size:clamp(1.5rem,3vw,2.5rem);line-height:1.1;letter-spacing:-.03em;overflow-wrap:anywhere}.hero-default .section-content{background:#eef6ff}.hero-business .section-content,.hero-transportation .section-content{background:#f2f8f1}.features .section-content{background:#fff8e9}.faq .section-content{background:#f8f1ff}.debug-toolbar{width:100%;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:16px;background:#f3f6fa;border:1px solid #d5dbe4}.debug-toolbar button{padding:8px 14px;border:1px solid #aab6c5;border-radius:4px;background:#fff;color:#172033;cursor:pointer}.debug-toolbar button:hover{background:#e7edf5}.debug-actions,.experience-links{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.experience-links a{color:#172033;font-weight:600}</style><div class="debug-toolbarmain "><div class="debug-toolbar"><nav class="experience-links" aria-label="Experience selection"><a href="?" data-utm-source="">DEFAULT</a><a href="?utm_source=TEAM" data-utm-source="TEAM">BUSINESS</a><a href="?utm_source=SIM" data-utm-source="SIM">TRANSPORTATION</a></nav><div class="debug-actions" role="group" aria-label="Personalization debug actions"><button type="button" data-debug-action="decisions">All Decisions</button><button type="button" data-debug-action="raw">Raw SDK Response</button><button type="button" data-debug-action="page">Matched Page</button><button type="button" data-debug-action="zones">Content Zones</button><button type="button" data-debug-action="status">Match Status</button></div></div><section id="section-hero"><div class="page-section hero-default"><div class="section-content"><h1>SECTION_HERO_V1: Waiting for a decision</h1><button type="button" class="log-decision">Log decision</button></div></div></section><section id="section-faq"><div class="page-section faq"><div class="section-content"><h1>SECTION_FAQ_V1: Waiting for a decision</h1><button type="button" class="log-decision">Log decision</button></div></div></section><section id="section-features"><div class="page-section features"><div class="section-content"><h1>SECTION_FEATURES_V1: Waiting for a decision</h1><button type="button" class="log-decision">Log decision</button></div></div></section></div>',

    },
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
        // Paste this inside your Optimizely Variation Code Execution block
        var utils = window.optimizely.get('utils');
        utils.waitForElement('body').then(function(body) {
            (function() {
                var scriptUrl = "https://cdn.c360a.salesforce.com/beacon/c360a/d6abf9f0-ecea-4884-ab38-0b4ee6bca246/scripts/c360a.min.js%22;"

                // 1. Prevent duplicate loading instances if the variant re-runs
                if (document.querySelector('script[src="' + scriptUrl + '"]')) {
                    console.log("[Salesforce Loader] Script is already present in the DOM head.");
                    return;
                }

                // 2. Build the script element container
                var sfScript = document.createElement("script");
                sfScript.type = "text/javascript";
                sfScript.src = scriptUrl;
                sfScript.async = true;

                // 3. Optional: Pass your environment's CSP nonce safely if required
                if (typeof window.nonce === "string") {
                    sfScript.nonce = window.nonce;
                }

                // 4. Verification triggers
                sfScript.onload = function() {
                    console.log("[Salesforce Loader] c360a.min.js successfully fetched and evaluated.");
                };

                sfScript.onerror = function(err) {
                    console.log("[Salesforce Loader] Failed to load the Salesforce script node:", err);
                };

                // 5. Inject into the document head
                document.head.appendChild(sfScript);
            })();
        });

        const elementsclass = document.querySelector ('.debug-toolbarmain');
        if(!elementsclass){
            document.querySelector("#__next > main > div:nth-child(1)").insertAdjacentHTML('afterend', this.config.TickerHtml);

        }
        connectToDecisions(applyPersonalization, '.debug-toolbarmain');
        connectDecisionDebug('.debug-toolbarmain');

        function applyPersonalization(container, decisions) {
            var activeDecisions;
            if (!decisions) {
                activeDecisions = [];
            } else {
                activeDecisions = decisions;
            }

            for (var i = 0; i < activeDecisions.length; i++) {
                var decision = activeDecisions[i];

                var selector = null;
                if (decision) {
                    if (decision.contentZone) {
                        selector = decision.contentZone.selector;
                    }
                }
                if (typeof selector !== "string" || !selector.trim()) continue;

                var zone = null;
                try {
                    zone = container.querySelector(selector);
                } catch (error) {
                    console.warn("Invalid personalization content zone selector:", selector, error);
                    continue;
                }

                var heading = null;
                if (zone) {
                    heading = zone.querySelector(".section-content h1");
                }
                if (!heading) continue;

                var name = "Unknown zone";
                if (decision) {
                    if (decision.contentZone && decision.contentZone.name) {
                        name = decision.contentZone.name;
                    } else if (decision.personalizationPointName) {
                        name = decision.personalizationPointName;
                    }
                }

                var experience = "—";
                if (decision && decision.attributes) {
                    if (decision.attributes.experienceKey !== null && decision.attributes.experienceKey !== undefined) {
                        experience = decision.attributes.experienceKey;
                    }
                }

                var contentPath = "—";
                if (decision && decision.attributes) {
                    if (decision.attributes.contentPath !== null && decision.attributes.contentPath !== undefined) {
                        contentPath = decision.attributes.contentPath;
                    }
                }

                heading.textContent = name + ": " + experience + " - " + contentPath;
            }
        }

        /** Receive enriched sitemap decisions, including decisions published before connection. */
        function connectToDecisions(apply, containerSelector, host) {
            var targetContainer;
            if (!containerSelector) {
                targetContainer = "body";
            } else {
                targetContainer = containerSelector;
            }

            var currentHost;
            if (!host) {
                currentHost = window;
            } else {
                currentHost = host;
            }

            if (typeof apply !== "function") throw new Error("A personalization renderer is required");
            var container = currentHost.document.querySelector(targetContainer);
            if (!container) throw new Error("Personalization container not found: " + targetContainer);
            apply(container);

            var onDecisions = function (event) {
                if (event && event.detail && Array.isArray(event.detail)) {
                    apply(container, event.detail);
                }
            };
            currentHost.addEventListener("personalization:decisions", onDecisions);
            if (currentHost.decisionsProvider && Array.isArray(currentHost.decisionsProvider)) {
                apply(container, currentHost.decisionsProvider);
            }
            return function () {
                currentHost.removeEventListener("personalization:decisions", onDecisions);
            };
        }

        /** Log the cached decision associated with a section's debug button. */
        function connectDecisionDebug(containerSelector, host) {
            var targetContainer;
            if (!containerSelector) {
                targetContainer = 'body';
            } else {
                targetContainer = containerSelector;
            }

            var currentHost;
            if (!host) {
                currentHost = window;
            } else {
                currentHost = host;
            }

            var container = currentHost.document.querySelector(targetContainer);
            if (!container) throw new Error("Debug container not found: " + targetContainer);

            var links = container.querySelectorAll('.experience-links [data-utm-source]');
            for (var j = 0; j < links.length; j++) {
                var link = links[j];
                var currentHref = currentHost.location.href;

                var baseParts = currentHref.split('?');
                var baseUrl = baseParts;
                var queryStr = "";
                if (baseParts.length > 1) {
                    queryStr = baseParts;
                }

                var pairs = [];
                if (queryStr) {
                    pairs = queryStr.split('&');
                }
                var newPairs = [];
                for (var k = 0; k < pairs.length; k++) {
                    if (pairs[k].indexOf('utm_source=') !== 0 && pairs[k] !== '') {
                        newPairs.push(pairs[k]);
                    }
                }

                var utmVal = link.getAttribute('data-utm-source');
                if (utmVal) {
                    newPairs.push('utm_source=' + encodeURIComponent(utmVal));
                }

                var finalHref = baseUrl;
                if (newPairs.length > 0) {
                    finalHref = baseUrl + '?' + newPairs.join('&');
                }
                link.href = finalHref;
            }

            var onClick = function (event) {
                var targetElement = event.target;
                var closestAction = null;

                while (targetElement && targetElement !== currentHost.document) {
                    if (targetElement.hasAttribute && targetElement.hasAttribute('data-debug-action')) {
                        closestAction = targetElement;
                        break;
                    }
                    targetElement = targetElement.parentNode;
                }

                var action = null;
                if (closestAction) {
                    action = closestAction.getAttribute('data-debug-action');
                }
                if (action) {
                    logDebugAction(action, currentHost);
                    return;
                }

                var buttonTarget = event.target;
                var isLogDecisionButton = false;
                while (buttonTarget && buttonTarget !== currentHost.document) {
                    if (buttonTarget.className && buttonTarget.className.indexOf('log-decision') !== -1) {
                        isLogDecisionButton = true;
                        break;
                    }
                    buttonTarget = buttonTarget.parentNode;
                }
                if (!isLogDecisionButton) return;

                var sectionTarget = buttonTarget;
                var sectionElement = null;
                while (sectionTarget && sectionTarget !== currentHost.document) {
                    if (sectionTarget.tagName && sectionTarget.tagName.toLowerCase() === 'section') {
                        sectionElement = sectionTarget;
                        break;
                    }
                    sectionTarget = sectionTarget.parentNode;
                }
                if (!sectionElement) return;

                var decisions = currentHost.decisionsProvider;
                if (!decisions || !Array.isArray(decisions)) {
                    console.log('[Section decision] Decisions have not been received yet.', sectionElement);
                    return;
                }

                var foundDecision = null;
                for (var m = 0; m < decisions.length; m++) {
                    var item = decisions[m];

                    var itemSelector = null;
                    if (item) {
                        if (item.contentZone) {
                            itemSelector = item.contentZone.selector;
                        }
                    }
                    if (typeof itemSelector !== 'string' || !itemSelector.trim()) continue;

                    try {
                        var matchesMethod = sectionElement.matches || sectionElement.msMatchesSelector || sectionElement.webkitMatchesSelector;
                        if (matchesMethod && matchesMethod.call(sectionElement, itemSelector)) {
                            foundDecision = item;
                            break;
                        }
                    } catch (err) {}
                }

                console.log('[Section decision]', sectionElement.id || 'unconfigured section', foundDecision);
            };

            container.addEventListener('click', onClick);
            return function () {
                container.removeEventListener('click', onClick);
            };
        }

        /** Inspect the latest decisions or the SDK's sitemap state without requesting new decisions. */
        function logDebugAction(action, host) {
            if (action === 'decisions') {
                var decisionsLog = 'Decisions have not been received yet.';
                if (host.decisionsProvider !== null && host.decisionsProvider !== undefined) {
                    decisionsLog = host.decisionsProvider;
                }
                console.log('[Personalization] All decisions:', decisionsLog);
                return;
            }
            if (action === 'raw') {
                var diagnostics = host.personalizationDiagnostics;
                if (!diagnostics) {
                    console.log('[Personalization] Raw SDK response is not available yet.');
                    return;
                }
                console.log('[Personalization] Requested points:', diagnostics.points);
                console.log('[Personalization] Raw SDK response:', diagnostics.response);

                var publishedLog = 'No published decisions.';
                if (host.decisionsProvider !== null && host.decisionsProvider !== undefined) {
                    publishedLog = host.decisionsProvider;
                }
                console.log('[Personalization] Published decisions:', publishedLog);
                return;
            }
            try {
                var sdk = null;
                if (typeof host.getSalesforceInteractions === 'function') {
                    sdk = host.getSalesforceInteractions();
                }
                if (!sdk || typeof sdk.getSitemapResult !== 'function') {
                    console.log('[Personalization] Salesforce sitemap result is unavailable.');
                    return;
                }
                var result = sdk.getSitemapResult();
                if (!result) {
                    console.log('[Personalization] Salesforce sitemap has not finished matching yet.');
                    return;
                }
                if (action === 'page') {
                    var pageName = null;
                    if (result.matchedConfig) {
                        pageName = result.matchedConfig.name;
                    }
                    console.log('[Personalization] Matched page:', pageName);
                }
                if (action === 'zones') {
                    var zonesList = [];
                    if (result.matchedConfig) {
                        var contextZones = result.matchedConfig.contentZones;
                        if (contextZones !== null && contextZones !== undefined) {
                            zonesList = contextZones;
                        }
                    }
                    console.log('[Personalization] Content zones:', zonesList);
                }
                if (action === 'status') {
                    var statusList = [];
                    if (result.matchStatus) {
                        statusList = result.matchStatus;
                    }
                    console.log('[Personalization] Match status:', statusList);
                }
            } catch (error) {
                console.warn('[Personalization] Unable to inspect the sitemap:', error);
            }
        }



    },
    addStyling: function () {
        const styleId = "MCP_Simo_Plan_Id";
        if (document.getElementById(styleId)) return;

        var style = document.createElement('style');

        style.textContent = '.promo-countdown-bar{width:100%!important;background-color:#0b0d10!important;color:#fff!important;padding:12px 20px!important;display:flex!important;justify-content:center!important;align-items:center!important;gap:24px!important;font-size:16px!important;letter-spacing:.5px!important;box-sizing:border-box!important;border-bottom:1px solid #1a1f26!important}.promo-text{font-size:16px!important;font-weight:700!important;white-space:nowrap!important}.promo-text span{font-size: 19px;font-weight:400!important;text-transform:none!important;color:#ffffff!important;margin-left:4px!important;display:inline!important}.countdown-timer{display:flex!important;align-items:center!important;gap:16px!important}.time-segment{display:flex!important;align-items:baseline!important;gap:4px!important;font-weight:700!important;font-size:16px!important;min-width:45px!important}.time-label{font-size:10px!important;color:#848d9c!important;font-weight:400!important;text-transform:lowercase!important}@media(max-width:900px){.promo-countdown-bar{flex-direction:column!important;gap:8px!important;padding:12px 20px!important;text-align:center!important}.promo-text{white-space:normal!important}} ';
        document.head.appendChild(style);


    }
};

var crowdMaxDCP18263Counter = 5;
var crowdFinderDCP18263 = setInterval(function () {
    crowdMaxDCP18263Counter = crowdMaxDCP18263Counter - 1;
    if (typeof croWD !== 'undefined') {
        clearInterval(crowdFinderDCP18263);
        bentofn.observe();
        croWD.cmdr('DCP-18263', 'inject');
    }
    if (crowdMaxDCP18263Counter <= 0) {
        clearInterval(crowdFinderDCP18263);
    }
}, 1000);
