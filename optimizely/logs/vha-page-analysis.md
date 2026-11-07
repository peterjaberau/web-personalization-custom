# Vodafone Team Plans: Optimizely and Salesforce capture

Source: [vha-page-analysis.json](./vha-page-analysis.json), captured on `https://www.vodafone.com.au/business/team-plans`. This describes one visitor at the time of capture. JSON paths below start at the root of that file. Keys such as `["get.state"]` and `["get.data"]` identify their Optimizely API source; IDs are quoted because they are object keys. The inspection filters state to active entities and scopes project-data entities to those related to active pages and campaigns.

## Optimizely logic flow

This is a conceptual flow illustrated by the **Team Plan ACN chat** campaign. The capture is a state snapshot, not a chronological execution log, so it shows outcomes and configuration rather than proving the precise order or timing of every operation.

| Step | Logic | Evidence in the captured JSON |
| --- | --- | --- |
| 1. Page loaded | The browser is on the Team Plans URL and the Optimizely snippet runs. | `url` identifies the captured URL; it does not record when the snippet started. |
| 2. Page matched | Optimizely evaluates its page conditions and marks the corresponding page active. | `["get.state"].getPageStates["6068427075354624"].staticConditions` contains the Team Plans URL; `.isActive` is `true`. |
| 3. Audience evaluated | The campaign's audience conditions and other eligibility rules are evaluated for the visitor. | `["get.data"].experiments["5505477121933312"].audienceIds` lists the configured audience IDs. `["get.state"].getCampaignStates["6187662548140032"].audiences` lists the audiences the visitor was in when the campaign activated. The audience definitions are in `["get.data"].audiences`; their execution sequence is not recorded. |
| 4. Campaign and variation selected | For this visitor, the campaign is active and Optimizely reports the assigned experiment and variation. | `["get.state"].getCampaignStates["6187662548140032"].isActive`, `.experiment` and `.variation`; `.isInCampaignHoldback` is `false`. |
| 5. Variation changes configured | The selected variation supplies changes for the Optimizely page, including an element selector and replacement HTML. | `["get.data"].variations["6445246433722368"].actions[0].pageId` identifies the page. `.changes[0].selector` is `.FLFtS > p:nth-of-type(3)` and `.changes[0].attributes.html` holds the replacement HTML. The configuration alone does not prove that the element was found or changed in the DOM. |

Salesforce attributes are submitted separately by the POC. Their presence under `["get.visitor"].custom` does not establish that an existing audience used them or that a campaign was re-evaluated after submission.

## Active Optimizely campaigns and assigned variations

The **Optimizely decision** here is the experiment and variation reported in campaign state, not a Salesforce decision. All four campaigns below have `isActive: true` and `isInCampaignHoldback: false` in the captured state.

| Campaign | Optimizely decision: experiment → assigned variation | Page / target and captured change |
| --- | --- | --- |
| **Business Apple navigation** (`6636850394169344`) | `6720080334028800` → **EGW \| DCP-personalized-Business-Apple** (`6074198538321920`) | Page `6073900440748032`, business URL condition. Appends CSS to `head`; the CSS targets a countdown element. Also has a `custom_code` change whose code is not present in this capture. |
| **Business SIMO** (`5710553163759616`) | `4930130561204224` → **EGW\|DCP-TEMP-Personalised-Business-SIMO** (`5428207248211968`) | Page `5923171895869440`, which includes the Team Plans URL. The change uses selector `.iDSVCZ` with `attributes.remove: true`. |
| **Team Plan ACN chat** (`6187662548140032`) | `5505477121933312` → **EGW \| DCP-personalized-business-Team-plan-ACN-chat-now** (`6445246433722368`) | Page `6068427075354624`, Team Plans URL. Replaces HTML at `.FLFtS > p:nth-of-type(3)` with ABN and chat copy. |
| **Team Plan layout** (`5058376931999744`) | `5585651746209792` → **EGW \| DCP-18151 - CRO \| Team Plan layout** (`4703059320766464`) | Page `6419850359209984`, Team Plans URL. Includes `custom_code` whose code is not present here, and CSS appended to `head`, including selectors for `[data-testid="plan-card-AU13017"]`, `[data-testid="plan-card-AU12963"]` and `.plans-toggle-container`. |

The CSS shown in configuration is a configured change; this capture does not establish that every selector found a matching element or that every CSS declaration took effect.

## JSON paths for the active campaigns

| Campaign | Captured state and decision | Campaign configuration | Experiment configuration | Assigned variation and changes | Optimizely page state |
| --- | --- | --- | --- | --- | --- |
| Business Apple | `["get.state"].getCampaignStates["6636850394169344"]` | `["get.data"].campaigns["6636850394169344"]` | `["get.data"].experiments["6720080334028800"]` | `["get.data"].variations["6074198538321920"].actions[0].changes` | `["get.state"].getPageStates["6073900440748032"]` |
| Business SIMO | `["get.state"].getCampaignStates["5710553163759616"]` | `["get.data"].campaigns["5710553163759616"]` | `["get.data"].experiments["4930130561204224"]` | `["get.data"].variations["5428207248211968"].actions[0].changes` | `["get.state"].getPageStates["5923171895869440"]` |
| Team Plan ACN chat | `["get.state"].getCampaignStates["6187662548140032"]` | `["get.data"].campaigns["6187662548140032"]` | `["get.data"].experiments["5505477121933312"]` | `["get.data"].variations["6445246433722368"].actions[0].changes` | `["get.state"].getPageStates["6068427075354624"]` |
| Team Plan layout | `["get.state"].getCampaignStates["5058376931999744"]` | `["get.data"].campaigns["5058376931999744"]` | `["get.data"].experiments["5585651746209792"]` | `["get.data"].variations["4703059320766464"].actions[0].changes` | `["get.state"].getPageStates["6419850359209984"]` |

For each state entry, `.experiment`, `.variation`, `.audiences`, `.isActive` and `.isInCampaignHoldback` contain the relevant reported decision details. The audiences in the capture are `egw-campaign` and `experiment-eligible group`. Their configured conditions are described below.

## Captured audience conditions

All four active campaign experiments list the two audiences below with an `and` operator in their `audienceIds`. The capture includes each audience's configured JavaScript condition:

| Audience | Configured condition | JSON path |
| --- | --- | --- |
| `egw-campaign` (`5388103595065344`) | The pathname contains `/business` and excludes `/cart` and `/checkout`. | `["get.data"].audiences["5388103595065344"].conditions` |
| `experiment-eligible group` (`5747059051986944`) | Reads the `optimizelyEndUserId` cookie, parses its final two characters as an integer, and returns whether the result is greater than 1. If the cookie is absent it uses `0`. | `["get.data"].audiences["5747059051986944"].conditions` |

Neither of these captured condition scripts refers to the Salesforce attributes. The campaign state lists both audiences for this visitor at activation; it does not say that the POC's later attribute submission caused activation.

## Salesforce decisions and visitor attributes

| Salesforce point | Sitemap selector | Experience | Content path | Submitted attribute paths |
| --- | --- | --- | --- | --- |
| `SECTION_HERO_V1` | `#section-hero` | `DEFAULT` | `/banner/business/team-plan/master` | `lastSubmittedCommand.attributes.SECTION_HERO_V1_contentZoneSelector`, `.SECTION_HERO_V1_experienceKey`, `.SECTION_HERO_V1_contentPath` |
| `SECTION_FAQ_V1` | `#section-faq` | `DEFAULT` | `/banner/business/team-plan/master` | `lastSubmittedCommand.attributes.SECTION_FAQ_V1_contentZoneSelector`, `.SECTION_FAQ_V1_experienceKey`, `.SECTION_FAQ_V1_contentPath` |
| `SECTION_FEATURES_V1` | `#section-features` | `DEFAULT` | `/banner/business/iphone-duo/master` | `lastSubmittedCommand.attributes.SECTION_FEATURES_V1_contentZoneSelector`, `.SECTION_FEATURES_V1_experienceKey`, `.SECTION_FEATURES_V1_contentPath` |

For the abbreviated paths after the first in each row, prepend `lastSubmittedCommand.attributes`. Each point also has `contentZoneName` and `isSalesforceDecision` attributes. Their values are visible in the submitted command and in `["get.visitor"].custom["<attribute name>"].value`. The combined JSON string is at `lastSubmittedCommand.attributes.decisions` and `["get.visitor"].custom.decisions.value`.

The capture confirms these attributes appear in Optimizely's visitor object. It does not confirm campaign targeting based on them. The Salesforce selectors originate in the sitemap; the capture does not verify that they match elements on the actual Vodafone page or that they correspond to the Optimizely selectors above.
