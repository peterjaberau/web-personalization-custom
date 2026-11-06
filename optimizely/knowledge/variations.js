((w) => {
    "use strict";

    const tag = 'cv-4-20';
    const window = typeof unsafeWindow !== "undefined" ? unsafeWindow : w;
    const qa = document.cookie.indexOf('cfQA') > -1;
    const log = qa ? Function.prototype.bind.call(console.log, console, '[CONV] TAF 4.20 |') : () => { };

    const utils = {
        waitUntil: (condition, wait = 6000) => {
            return new Promise((resolve, reject) => {
                let stop = false;

                const timeout =
                    wait &&
                    setTimeout(() => {
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
        },

        init: () => {
            try {
                utils.waitUntil(() => document.body, 0).then((docBody) => {
                    docBody.classList.add(tag);
                });

                initVariation();
                eventListenerFn();

                log('running v2');
            } catch (err) {
                log(err.message);
            }
        },
    }

    const initVariation = () => {

        let subjectFilter = false;

        utils.waitUntil(() => document.querySelector(`#ConceptID_allsubjects-show .facet-link`), 0).then((element) => {
            element.innerText = `See other subjects`
        });

        utils.waitUntil(() => document.querySelector(`#showLessConceptID_allsubjects .facet-link`), 0).then((element) => {
            element.innerText = `Hide other subjects`
        });

        utils.waitUntil(() => document.querySelector('.newSearchFacets [data-key="ConceptID_allsubjects"] li.parentFacets.clear .facet-link') && document.querySelector(`#appliedSearchFilters li`), 0).then((element) => {
            const filtersAppliedElements = document.querySelectorAll('#appliedSearchFilters li');
            const filtersAppliedTexts = Array.from(filtersAppliedElements)
                .map(el => el.innerText.trim().toLowerCase());

            if (filtersAppliedTexts.length == 0) return;

            // show all subject
            showAllSubject();

            document.querySelectorAll('.newSearchFacets [data-key="ConceptID_allsubjects"] li.parentFacets.clear').forEach(element => {
                const facetLink = element.querySelector(':scope > .facet-link-container > .facet-val > a.facet-link');
                if (!facetLink) return;
                const facetText = getTextWithoutChildren(facetLink).toLowerCase();
                const matchFound = filtersAppliedTexts.some(filterText => filterText.includes(facetText));

                if (matchFound) {
                    openT1Sub(element);
                    subjectFilter = true;
                }
            });

            if (subjectFilter == true) {
                document.querySelector(`.newSearchFacets [data-key="ConceptID_allsubjects"]`).classList.add(`${tag}__subjectFilterFound`);
            }

        });

        utils.waitUntil(() => document.querySelector('[data-key="ConceptID_allsubjects"]'), 0).then((element) => {
            // add see other subject btn
            !document.querySelector(`.${tag}__see-all`) && element.insertAdjacentHTML(`beforeend`, `
                    <div class="${tag}__see-all">
                        <span class="text">See other subjects</span>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4.72012 5.02949C5.01309 5.32246 5.48887 5.32246 5.78184 5.02949L9.53184 1.27949C9.82481 0.986524 9.82481 0.510742 9.53184 0.217773C9.23887 -0.0751953 8.76309 -0.0751953 8.47012 0.217773L5.2498 3.43809L2.02949 0.220117C1.73652 -0.0728518 1.26074 -0.0728518 0.967773 0.220117C0.674805 0.513086 0.674805 0.988867 0.967773 1.28184L4.71777 5.03184L4.72012 5.02949Z" fill="#2550A0"/>
</svg>                      
                    </div>
                    <div class="${tag}__hide-all">
                        <span class="text">Hide other subjects</span>
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4.72012 0.217578C5.01309 -0.0753908 5.48887 -0.0753908 5.78184 0.217578L9.53184 3.96758C9.82481 4.26055 9.82481 4.73633 9.53184 5.0293C9.23887 5.32227 8.76309 5.32227 8.47012 5.0293L5.2498 1.80898L2.02949 5.02695C1.73652 5.31992 1.26074 5.31992 0.967773 5.02695C0.674805 4.73398 0.674805 4.2582 0.967773 3.96523L4.71777 0.215234L4.72012 0.217578Z" fill="#2550A0"/>
</svg>
                    </div>
                `)
        });


        // move checkboxes 
        utils.waitUntil(() => document.querySelector('.newSearchFacets #filter .overlay-content .facetsBody'), 0).then((element) => {
            element.insertAdjacentElement('beforeend', document.querySelector(`.newSearchFacets .accessTypeWrapper`));
        });
    }

    const getTextWithoutChildren = (element) => {
        const clone = element.cloneNode(true);
        Array.from(clone.querySelectorAll('*')).forEach(child => child.remove());
        return clone.textContent.trim();
    }

    const openT1Sub = (element) => {
        const interval = setInterval(() => {
            const button = element.querySelector('button');
            const buttonActive = element.querySelector('button.active');
            if (button && !buttonActive) {
                button.click();
            }
            element.classList.add(`${tag}__visible`);
        }, 50)

        setTimeout(() => {
            clearInterval(interval)
        }, 3000)
    }

    const showAllSubject = () => {
        const interval = setInterval(() => {
            if (!document.querySelector(`#ConceptID_allsubjects-show.hidden`)) {
                document.querySelector(`#ConceptID_allsubjects-show`) && document.querySelector(`#ConceptID_allsubjects-show`).click();
                
                setTimeout(()=>{
                    document.querySelector(`#ConceptID_allsubjects-show`).addEventListener(`click`, (e) => {
                        window['optimizely'] = window['optimizely'] || [];
                        window['optimizely'].push({
                            type: "event",
                            eventName: "clicks_on__show_more",
                        });
                    })
                },500)
            }
        }, 20)

        setTimeout(() => {
            clearInterval(interval)
        }, 3000)
    }

    const eventListenerFn = () => {
        document.addEventListener(`click`, (e) => {
            const el = e.target

            if (el.closest(`.${tag}__see-all`)) {
                document.querySelector(`.newSearchFacets #filter .overlay-content`).classList.add(`${tag}__active`);
                window['optimizely'] = window['optimizely'] || [];
                window['optimizely'].push({
                    type: "event",
                    eventName: "clicks_on__show_more",
                });
            }

            if (el.closest(`.${tag}__hide-all`)) {
                document.querySelector(`.newSearchFacets #filter .overlay-content`).classList.remove(`${tag}__active`);
            }
        })

        listener();
    }

    const listener = () => {
        /* These are the modifications: */
        window.addEventListener("locationchange", () => {
            const interval = setInterval(() => {
                if (!document.querySelector(`.${tag}__see-all`)) {
                    initVariation();
                }
            }, 250)

            setTimeout(() => {
                clearInterval(interval);
            }, 5000)
        });

        history.pushState = ((originalPushState) =>
            function pushState(...args) {
                const result = originalPushState.apply(this, args);
                window.dispatchEvent(new Event("pushstate"));
                window.dispatchEvent(new Event("locationchange"));
                return result;
            }
        )(history.pushState);

        history.replaceState = ((originalReplaceState) =>
            function replaceState(...args) {
                const result = originalReplaceState.apply(this, args);
                window.dispatchEvent(new Event("replacestate"));
                window.dispatchEvent(new Event("locationchange"));
                return result;
            }
        )(history.replaceState);

        window.addEventListener("popstate", () => {
            window.dispatchEvent(new Event("locationchange"));
        });
    };

    utils.init();

})(window);