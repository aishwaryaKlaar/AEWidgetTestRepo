// Triggers Angular Router navigation without a full page reload.
// Angular stores sequential navigationIds (1, 2, 3...) in history state.
// Using Date.now() as the ID guarantees no match in Angular's stored navigation registry,
// so Angular falls back to reading window.location.pathname — which we just set via pushState.
export function angularNavigate(path) {
  const navId = Date.now()
  window.history.pushState({ navigationId: navId }, '', path)
  window.dispatchEvent(new PopStateEvent('popstate', { state: { navigationId: navId } }))
}
