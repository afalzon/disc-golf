import L from 'leaflet'
import type { PoiKind } from '../types/course'

const markerSvg = (color: string): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
  <path d="M13 1C6.4 1 1 6.4 1 13c0 8.6 10.3 22 11.2 23.2a1 1 0 0 0 1.6 0C14.7 35 25 21.6 25 13 25 6.4 19.6 1 13 1z" fill="${color}" stroke="#14322b" stroke-width="1.6"/>
  <circle cx="13" cy="13" r="4.2" fill="#ffffff" opacity="0.95"/>
</svg>
`

const svgToDataUrl = (svg: string): string => {
  return `data:image/svg+xml;base64,${btoa(svg.trim())}`
}

const buildMarker = (color: string): L.Icon => {
  return L.icon({
    iconUrl: svgToDataUrl(markerSvg(color)),
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -30],
  })
}

const poiSvg = (color: string, body: string): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
  <circle cx="17" cy="17" r="15" fill="${color}" stroke="#14322b" stroke-width="1.5"/>
  ${body}
</svg>
`

const buildPoiIcon = (color: string, body: string): L.Icon => {
  return L.icon({
    iconUrl: svgToDataUrl(poiSvg(color, body)),
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  })
}

export const teeIcon = buildMarker('#1f9d55')
export const pinIcon = buildMarker('#2f6bff')

const poiIcons: Record<PoiKind, L.Icon> = {
  parking: buildPoiIcon(
    '#f59e0b',
    '<path d="M12 8h5.1c2.6 0 4.4 1.8 4.4 4.1 0 2.4-1.8 4.1-4.4 4.1H15v5h-3V8zm3 5.7h2c1 0 1.7-.7 1.7-1.6 0-.9-.7-1.6-1.7-1.6h-2v3.2z" fill="#ffffff"/>',
  ),
  restroom: buildPoiIcon(
    '#8b5cf6',
    '<path d="M14.7 8.2c0-1.1.9-2 2-2 1.2 0 2 .9 2 2s-.8 2-2 2c-1.1 0-2-.9-2-2zm-3.2 5.8c0-1.2.9-2.1 2.1-2.1h6.8c1.2 0 2.1.9 2.1 2.1v1.1h-3v9h-2.1v-5.3h-.8v5.3h-2.1v-9h-3v-1.1z" fill="#ffffff"/>',
  ),
  water: buildPoiIcon(
    '#0ea5e9',
    '<path d="M17 6c-2.4 3.4-5.2 6.9-5.2 10.2 0 3.3 2.3 6.1 5.2 6.1s5.2-2.8 5.2-6.1C22.2 12.9 19.4 9.4 17 6zm0 14.8c-1.6 0-2.8-1.3-2.8-2.8 0-.9.5-1.8 1.2-2.4.7-.6 1.1-1.4 1.6-2.2.5.8.9 1.6 1.6 2.2.7.6 1.2 1.5 1.2 2.4 0 1.5-1.2 2.8-2.8 2.8z" fill="#ffffff"/>',
  ),
  shelter: buildPoiIcon(
    '#16a34a',
    '<path d="M8 16.2 17 8l9 8.2-1.5 1.7-1.8-1.6v7.2h-4.4v-5.4h-2.6v5.4H10v-7.2l-1.8 1.6L6.7 16.2 8 15z" fill="#ffffff"/>',
  ),
  start: buildPoiIcon(
    '#22c55e',
    '<path d="M13 10.2 24.2 17 13 23.8z" fill="#ffffff"/>',
  ),
  finish: buildPoiIcon(
    '#0f172a',
    '<path d="M12 9.2h1.7v15.6H12z" fill="#ffffff"/><path d="M13.7 10.2h8.4v8.8h-8.4z" fill="#ffffff"/><path d="M13.7 10.2h4.2v4.4h-4.2z" fill="#0f172a"/><path d="M17.9 14.6h4.2V19h-4.2z" fill="#0f172a"/>',
  ),
  info: buildPoiIcon(
    '#64748b',
    '<circle cx="17" cy="11.3" r="1.8" fill="#ffffff"/><path d="M15.5 15h3v8h-3z" fill="#ffffff"/>',
  ),
  other: buildPoiIcon(
    '#ef4444',
    '<path d="M17 8.2l2.2 4.4 4.9.7-3.5 3.4.8 4.8-4.4-2.3-4.4 2.3.8-4.8-3.5-3.4 4.9-.7L17 8.2z" fill="#ffffff"/>',
  ),
}

export const poiIconForKind = (kind: PoiKind): L.Icon => poiIcons[kind]
