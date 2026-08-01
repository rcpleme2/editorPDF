/** Shared page-fit math so the real PageView and the lightweight
 * (unmounted) placeholder slot in PageCanvas always agree on layout size. */
export function computePageScale(
  page: { width: number; height: number; rotation: number },
  containerWidth: number,
  zoom: number,
) {
  const displayW = page.rotation % 180 === 0 ? page.width : page.height
  const displayH = page.rotation % 180 === 0 ? page.height : page.width
  const fitScale = containerWidth / displayW
  const scale = Math.min(Math.max(fitScale * zoom, 0.1), 6)
  return { scale, displayW, displayH }
}
