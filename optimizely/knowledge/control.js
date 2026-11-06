const qa = document.cookie.indexOf('cfQA') > -1;
const log = qa ? Function.prototype.bind.call(console.log, console, '[CONV] TAF 4.20 |') : () => { };
log('running control');

document.addEventListener(`click`, (e) => {
    const el = e.target

    if (el.closest(`#ConceptID_allsubjects-show`)) {
        window['optimizely'] = window['optimizely'] || [];
        window['optimizely'].push({
            type: "event",
            eventName: "clicks_on__show_more",
        });
    }
})