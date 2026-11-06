# A/B Test Experiments by Abu Zaher

**CRO Developer** with 5 years of experience and **300+ experiments built** across eCommerce, B2B SaaS, and lead generation.

This repository contains a selection of real A/B test experiments I developed professionally — anonymised to protect client confidentiality.
---

## About Me

I specialise in the **technical development and implementation** of A/B tests and CRO experiments. My workflow:

1. **Feasibility check** - review the experiment brief and Figma designs, identify blockers before development.
2. **Experiment build** - develop the variation in JavaScript, HTML, and CSS on the testing platform.
3. **Goal and tracking setup** - configure conversion events and analytics integrations per the experiment plan.
4. **QA fix and resolution** - resolve QA feedback and prepare for client launch.

> I work closely with PMs, strategists, and QA engineers, owning the full technical lifecycle of each experiment.

---

## Tech Stack

| Category | Tools |
|----------|-------|
| **Testing platforms** | Monetate, Optimizely, Kameleeon, VWO, AB Tasty, Convert |
| **Languages** | JavaScript (ES6+), HTML5, CSS/SASS |
| **Analytics** | GA4, Google Tag Manager, Segment |
| **Workflow** | Figma (design handoff) |

---

## Key Technical Patterns

The standard below is what every variation in this repository is cloned from. The goal is for an experiment to drop onto a live page without colliding with the host site's own JavaScript, CSS, or DOM, and without being affected by anything else the experimentation platform happens to be running on the same page.

### IIFE wrapper

Every variation file is wrapped in an Immediately Invoked Function Expression. It shadows `window` with a safe local reference and keeps every variable inside the experiment private.

```javascript
((w) => {
    "use strict";

    const window = typeof unsafeWindow !== "undefined" ? unsafeWindow : w;

    // everything for this experiment lives in here

})(window);
```

The `unsafeWindow` check matters because the same file runs both inside the platform's normal sandbox and inside a Tampermonkey or Greasemonkey context during local QA. Anything declared with `const` or `let` inside the wrapper is invisible to the host page and to other experiments on the same page.

### Unique tag

Every experiment gets a single string identifier derived from the client and experiment number, for example `cv-x-y`. That one string then namespaces:

- the CSS body class added by `utils.init`: `document.body.classList.add(tag)`
- every CSS selector that targets host elements: `.cv-x-y .target-element`
- every element the variant injects: `<a class="cv-x-y__cta">`
- every state key written to storage: `${tag}__cta-clicked`
- the QA log prefix: `[client] cv-x-y |`

```javascript
const tag = 'cv-x-y';
```

If this string collides with anything on the host page or another experiment, every other layer breaks. Keeping it unique per experiment is the single rule the rest of the standard relies on.

### Utils object

All helper functions and the experiment's entry point live on a single `utils` object. Nothing floats at the top level of the IIFE except `tag`, `window`, `qa`, `log`, the `utils` object itself, and `initVariation`.

```javascript
const utils = {
    waitUntil: (condition, wait = 6000) => { /* ... */ },

    init: () => {
        try {
            utils.waitUntil(() => document.body, 0).then((docBody) => {
                docBody.classList.add(tag);
            });

            listener();
            initVariation();

            log('running');
        } catch (err) {
            log(err.message);
        }
    },
};
```

Three reasons for grouping helpers this way:

- Every experiment starts from the same `utils` object. I copy the skeleton, change the `tag`, fill in `initVariation`, and ship.
- Helpers reference each other through `utils.x`. A renamed helper fails loudly during QA instead of silently calling a stale closure.
- `utils.init` is the only thing the IIFE actually executes. Nothing runs before the body class is applied, and any error thrown anywhere inside `initVariation` is caught so a runtime bug cannot crash the host page.

### Custom async DOM utility

A Promise-based `waitUntil` using a `requestAnimationFrame` loop with a configurable timeout fallback. No naive `setTimeout` polling.

```javascript
waitUntil: (condition, wait = 6000) => {
    return new Promise((resolve, reject) => {
        let stop = false;

        const timeout = wait && setTimeout(() => {
            stop = true;
            reject(new Error('Timeout waiting for condition'));
        }, wait);

        const check = () => {
            if (stop) return;
            if (!condition()) return requestAnimationFrame(check);

            clearTimeout(timeout);
            resolve(condition());
        };

        requestAnimationFrame(check);
    });
}
```

Why `requestAnimationFrame` over `setInterval`:

- it is paint-aligned, so I never act on a node that is mid-render
- it pauses while the tab is inactive, so an idle tab does not burn CPU
- it has no fixed interval, so the wait is as short as it can be

The default 6000ms timeout prevents a missing target from leaking a permanent recursive callback. Passing `wait = 0` disables the timeout for nodes that are legitimately allowed to take an arbitrary amount of time to appear.

### Asynchronous Data Fetching (XHR)

For experiments requiring dynamic data (like "Best Sellers" or live inventory), I use a Promise-wrapped XMLHttpRequest. This allows the variation to fetch data and only proceed with DOM mutations once the payload is ready.

```
const getBestSellers = () => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.example.com/products", true);

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    // Logic to parse response and build HTML string
                    resolve(resultHtml);
                } else {
                    reject(new Error('Request failed: ' + xhr.status));
                }
            }
        };
        xhr.send();
    });
};
```

Error Handling: By using Promises, I can catch network failures gracefully without breaking the rest of the script.
Performance: The request is asynchronous, ensuring the main thread isn't blocked while waiting for the server response.

### Event delegation

Per-element listeners die the moment the host application re-renders the DOM, which on an SPA happens on every route change. The standard is one delegated listener on `document`, which checks the target with `closest`.

```javascript
document.addEventListener('click', (e) => {
    if (e.target.closest(`.${tag}__cta`)) {
        // code for the click
    }
});
```

This costs one global listener per experiment instead of N listeners, and the listener stays alive after the host re-renders the entire view. `closest` also handles the common case where the click target is a child of the actual button (a span, an icon) rather than the button itself.

The same pattern applies to any user interaction: hover, focus, submit. The listener is attached once at the top of the experiment and the handler decides what to do based on the target.

### SPA listener

Single-page applications change the URL through `history.pushState` and `history.replaceState` without firing any built-in event. To detect route changes the standard pattern is to wrap both methods so they dispatch a custom `locationchange` event, then listen for it.

```javascript
const listener = () => {
    window.addEventListener("locationchange", function () {
        setTimeout(() => {
            // re-apply variation after host router finishes
            initVariation();
        }, 20);
    });

    history.pushState = ((f) =>
        function pushState() {
            var ret = f.apply(this, arguments);
            window.dispatchEvent(new Event("pushstate"));
            window.dispatchEvent(new Event("locationchange"));
            return ret;
        })(history.pushState);

    history.replaceState = ((f) =>
        function replaceState() {
            var ret = f.apply(this, arguments);
            window.dispatchEvent(new Event("replacestate"));
            window.dispatchEvent(new Event("locationchange"));
            return ret;
        })(history.replaceState);

    window.addEventListener("popstate", () => {
        window.dispatchEvent(new Event("locationchange"));
    });
};
```

The pattern works because of three details:

- The patches **wrap**, they do not replace. The original `history.pushState` is captured in the closure (`f`) and still runs first via `f.apply(this, arguments)`, so the host application's router keeps working exactly as before.
- `popstate` is the browser's native back-and-forward event. Translating it into a `locationchange` event means the rest of the experiment listens to one event regardless of how the URL changed.
- The `setTimeout(..., 20)` after the `locationchange` gives the host's router one tick to finish unmounting the old view before the experiment touches the DOM. Without it, the experiment sometimes acts on a node that has already been replaced.

This pattern is idempotent. If two experiments both wrap `pushState`, the second wraps over the first, both copies of the wrapped function still call the original, and both `locationchange` listeners fire.

### Tag-scoped CSS

Every selector in the variant's CSS file is prefixed with the body class. There are no unscoped selectors anywhere.

```css
.cv-x-y .target-element {
    /* override */
}

.cv-x-y__cta {
    /* injected element */
}

.cv-x-y .target-element:hover {
    /* override only valid inside the variant */
}
```

The body class is added by `utils.init` only when the variant is running. The control group never receives the class, so the entire variant stylesheet is dead code for them.

This convention handles two failure modes:

- The host application shares a class name with the variant. Because every selector starts with `.cv-x-y`, the variant cannot accidentally restyle anything outside an active experiment context.
- Two experiments touch the same element. Both have their own scoped selectors and their own injected elements (`cv-x-y__cta` vs `cv-a-b__cta`), so neither one sees the other's DOM additions.

For elements injected by the experiment, the `${tag}__name` BEM-style suffix produces a class that is guaranteed not to exist anywhere else on the page. The variant can target it without specificity wars with the host's stylesheet.

---

## Defensive Coding

### Cookie-based QA mode

Verbose logging in QA, no debug code in production. The QA flag is opt-in via a cookie:

```javascript
const qa = document.cookie.indexOf('cfQA') > -1;
const log = qa
    ? Function.prototype.bind.call(console.log, console, `[client] ${tag} |`)
    : () => { };
```

In production, `log` is a no-op, so nothing the experiment does prints to the console. The moment the cookie is present, every `log(...)` call becomes a `console.log` prefixed with the experiment tag.

The `bind` keeps the call site (file and line) accurate in DevTools, which a forwarding wrapper would lose. Grepping the console for one experiment's tag isolates that experiment's logs from anything else running on the page.

### Duplicate injection guard

On an SPA, `initVariation` runs more than once: first on initial load, then again on every `locationchange`. The variant must not inject the same element twice.

```javascript
const initVariation = () => {
    if (document.querySelector(`.${tag}__cta`)) return;

    // ... inject the CTA
};
```

The check is cheap and the early return keeps the rest of `initVariation` honest: nothing inside it has to be re-entrant.

### One-shot interaction handler

For events that should fire a conversion goal exactly once per session, the handler removes itself after the first match.

```javascript
const handler = (e) => {
    if (!e.target.closest(`.${tag}__cta`)) return;

    sendEvent(`${tag}__cta-clicked`);
    document.removeEventListener('click', handler);
};

document.addEventListener('click', handler);
```

This avoids inflating goal counts when a user clicks the same CTA twice, and the listener cleans itself up rather than leaving a permanent global handler for a goal that has already fired.

---

## The Skeleton

Every variation file in this repository is a fill-in of this skeleton. The `tag` changes; `listener` and `initVariation` change. Everything else stays identical.

```javascript
((w) => {
    "use strict";

    const tag = 'cv-x-y';
    const window = typeof unsafeWindow !== "undefined" ? unsafeWindow : w;
    const qa = document.cookie.indexOf('cfQA') > -1;
    const log = qa ? Function.prototype.bind.call(console.log, console, `[client] ${tag} |`) : () => { };

    const utils = {
        waitUntil: (condition, wait = 6000) => {
            return new Promise((resolve, reject) => {
                let stop = false;
                const timeout = wait && setTimeout(() => { stop = true; reject(new Error('Timeout')); }, wait);
                const check = () => {
                    if (stop) return;
                    if (!condition()) return requestAnimationFrame(check);
                    clearTimeout(timeout);
                    resolve(condition());
                };
                requestAnimationFrame(check);
            });
        },

        init: () => {
            try {
                utils.waitUntil(() => document.body, 0).then((docBody) => {
                    docBody.classList.add(tag);
                });

                listener();
                initVariation();

                log('running');
            } catch (err) {
                log(err.message);
            }
        },
    };

    const listener = () => {
        // history-API patches and locationchange handler
    };

    const initVariation = () => {
        if (document.querySelector(`.${tag}__cta`)) return;

        // experiment-specific DOM mutations
        // every DOM read goes through utils.waitUntil
        // every user interaction goes through a delegated listener on document
        // every CSS class read or written is prefixed with `tag`
    };

    utils.init();
})(window);
```

Any experiment in this repository can be read by replacing `tag` in your head and skipping straight to `initVariation`.

---

## Contact

- **LinkedIn:** [linkedin.com/in/abu-zaher](https://linkedin.com/in/abu-zaher)
- **GitHub:** [github.com/abu-jaher](https://github.com/abu-jaher)
