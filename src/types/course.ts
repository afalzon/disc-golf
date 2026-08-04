export type LatLng = {
  lat: number
  lng: number
}

export type Hole = {
  id: number
  name: string
  par: number
  tee: LatLng
  pin: LatLng
  notes?: string
}

export type WalkingPath = {
  id: string
  name: string
  points: LatLng[]
}

export type PoiKind =
  | 'parking'
  | 'restroom'
  | 'water'
  | 'shelter'
  | 'start'
  | 'finish'
  | 'info'
  | 'other'

export type Poi = {
  id: string
  name: string
  kind: PoiKind
  position: LatLng
  notes?: string
}

export type Course = {
  id: string
  name: string
  center: LatLng
  mapStart?: LatLng
  zoom: number
  holes: Hole[]
  paths: WalkingPath[]
  pois: Poi[]
  tileUrl?: string
  tileAttribution?: string
}
