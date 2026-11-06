/** Display each decision's attributes in its matching content zone. */
export function applyPersonalization(container, decisions = []) {
  decisions.forEach((decision) => {
    const selector = decision?.contentZone?.selector
    if (typeof selector !== "string" || !selector.trim()) return

    let zone
    try {
      zone = container.querySelector(selector)
    } catch (error) {
      console.warn("Invalid personalization content zone selector:", selector, error)
      return
    }
    const heading = zone?.querySelector(".section-content h1")
    if (!heading) return
    const name = decision.contentZone.name || decision.personalizationPointName || "Unknown zone"
    const experience = decision.attributes?.experienceKey ?? "—"
    const contentPath = decision.attributes?.contentPath ?? "—"
    heading.textContent = `${name}: ${experience} - ${contentPath}`
  })
}

/** Receive enriched sitemap decisions, including decisions published before connection. */
export function connectToDecisions(apply, containerSelector = "body", host = window) {
  if (typeof apply !== "function") throw new Error("A personalization renderer is required")
  const container = host.document.querySelector(containerSelector)
  if (!container) throw new Error(`Personalization container not found: ${containerSelector}`)
  apply(container)

  const onDecisions = (event) => {
    if (Array.isArray(event.detail)) apply(container, event.detail)
  }
  host.addEventListener("personalization:decisions", onDecisions)
  if (Array.isArray(host.decisionsProvider)) {
    apply(container, host.decisionsProvider)
  }
  return () => host.removeEventListener("personalization:decisions", onDecisions)
}
