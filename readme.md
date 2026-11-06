# Web personalization demo

This is a static HTML, CSS and JavaScript site. Vercel serves `index.html` at
`/` and the Optimizely demo at `/index-optimizely.html`. No build step or
framework is needed. The JSON snapshots used by the Optimizely demo are in
`vha/experience_fragment/`. `.vercelignore` limits the deployment to the
site files; add new public assets there when needed.

To run the Optimizely demo locally:

```sh
node optimizely-local-server.mjs
```

Open `http://127.0.0.1:8765/index-optimizely.html`. This local server is for
the Optimizely demo only; Vercel serves the static files directly.

## Salesforce decisions with Optimizely utilities

`index-optimizely.html` loads `personalization-salesforce-optimizely.js` after
its sections. Each section has an initially empty `.section-content`. A
separate `debug.js` module handles the debug toolbar and the **Log decision**
buttons.

Salesforce is responsible for selecting the page's experiences and publishing
the decisions. The adapter does not ask Optimizely to make that decision. It
uses Optimizely's `waitForElement` utility to locate each target, then its own
JavaScript fetches the content and builds the demo UI. No Optimizely campaign or
variation needs to be configured for this adapter as long as an Optimizely Web
Experimentation instance exposing `get('utils')` is already running on the page.

### Flow at a glance

The functions are listed in source order. Salesforce decisions and Optimizely
utilities may arrive in either order; processing waits until both are ready.

```text
1. connectToDecisions
   |  subscribe to Salesforce decisions and forward any existing snapshot
   v
2. receiveDecisions
   |  store the latest decisions
   v
3. tryInitializeOptimizely
   |  obtain Optimizely utilities; retry if unavailable
   v
4. processLatestDecisions
   |  wait for both inputs; select the last decision per selector
   v
5. applyDecisionToZone
   |  coordinates the following steps for each decision:
   |-- 6. mapDecisionToContent: extract and validate the decision
   |       `-- 7. buildFragmentURL: validate the path and build the URL
   |-- 8. utils.waitForElement: wait for the target section
   |-- 9. createOrUpdateDecisionView: create or update the demo UI
   |-- 10. fetchFragment: fetch and validate the JSON response
   `-- 11. showFragmentResponse: display JSON as text
```

Salesforce chooses the content. Optimizely helps locate the target section.
The adapter fetches the response and updates the page; it does not render or
pass the returned HTML to Optimizely.

### Execution sequence

1. **`connectToDecisions`** finds `main`, calls the callback once with only
   the container, subscribes to the `personalization:decisions` browser event,
   and forwards any existing `window.decisionsProvider` array. The initial call
   has no decisions, so the callback returns without rendering. The connector
   returns an unsubscribe function; the current startup code does not use it.
2. **`receiveDecisions`** saves each decision array and increments the generation
   counter, then calls `processLatestDecisions`. It can run before or after
   Optimizely is ready.
3. **`tryInitializeOptimizely`** obtains `window.optimizely.get('utils')` and
   calls `processLatestDecisions`. If utilities are unavailable, startup retries
   every 250 ms. If supported, `utils.onUrlChange` invalidates old decisions
   and pending results; Salesforce must publish decisions for the new page.
4. **`processLatestDecisions`** returns until it has both a decision array and
   utilities. It captures the generation and calls `applyDecisionToZone` for
   each selected decision. If the same selector occurs multiple times in one
   array, only the last decision for that exact selector is passed on. This
   function does not fetch content or update the page.
5. **`applyDecisionToZone`** coordinates the remaining steps for one decision.
   Multiple decisions can be processed asynchronously. It stops if mapping
   fails or the target is no longer valid.
6. **`mapDecisionToContent`** extracts the selector, content path, point name
   and experience key, validates the selector, and calls `buildFragmentURL`.
   Decisions without a valid selector or path are skipped.
7. **`buildFragmentURL`** validates the relative content path and combines it
   with `contentSource` to construct the request URL.
8. **`utils.waitForElement`** receives the mapped selector and returns the
   matching element. `applyDecisionToZone` then checks that the element remains
   connected, lies inside `main`, and belongs to the latest generation.
9. **`createOrUpdateDecisionView`** finds `.section-content` in the selected
   zone and creates or reuses the heading, expandable panel and log button.
   The heading comes from the personalization point name; the panel label is
   `experienceKey: contentPath`.
10. **`fetchFragment`** requests the URL, parses the response as JSON and checks
    for a string `html` property. It does not modify the page. Errors are shown
    in the panel and logged to the console if the batch is still current.
11. **`showFragmentResponse`** displays the complete JSON response as text in
    the panel, but only if the decision batch is still current and the zone is
    connected. It does not insert the returned HTML.

For example, a decision with selector `#section-hero`, experience key
`DEFAULT`, and content path `/banner/business/team-plan/master` waits for the
hero section and fetches the following local snapshot:

```text
/vha/experience_fragment/banner/business/team-plan/master/index.json
```

### Content source configuration

The adapter's `contentSource` defaults to the local snapshot directory and
`/index.json` suffix. For the example live AEM endpoint, configure it as:

```js
var contentSource = {
  baseURL: 'https://www.vodafone.com.au',
  basePath: '/rest/experienceFragments?path=/content/experience-fragments/vha/experience_fragment',
  suffix: ''
};
```

The API must return JSON with a string `html` property. Cross-origin requests
also require the API to permit the page's origin. The current demo only
inspects that response; rendering the AEM HTML would require a separate
implementation and appropriate handling of the returned content.

The script can later be adapted for Optimizely custom code. In that setup an
Optimizely experience must actually run the code on the intended pages, and
Salesforce decisions must still be published and accessible to it.
