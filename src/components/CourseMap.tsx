import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet'
import type { Course, Hole, LatLng } from '../types/course'
import { bearingDegrees, bearingToCompass, distanceMeters } from '../lib/geo'
import { pinIcon, poiIconForKind, teeIcon } from '../lib/mapIcons'

type CourseMapProps = {
  course: Course
  selectedHole: Hole
  userLocation: LatLng | null
  onSelectHole: (holeId: number) => void
}

export const CourseMap = ({
  course,
  selectedHole,
  userLocation,
  onSelectHole,
}: CourseMapProps) => {
  const distance = userLocation
    ? Math.round(distanceMeters(userLocation, selectedHole.pin))
    : null

  const bearing = userLocation
    ? bearingDegrees(userLocation, selectedHole.pin)
    : null

  return (
    <section className="map-shell">
      <aside className="card hole-panel">
        <h2>{selectedHole.name}</h2>
        <p>Par {selectedHole.par}</p>
        {selectedHole.notes ? <p>{selectedHole.notes}</p> : null}
        {distance !== null && bearing !== null ? (
          <div className="stats">
            <p>
              Distance <strong>{distance} m</strong>
            </p>
            <p>
              Bearing{' '}
              <strong>
                {Math.round(bearing)}° {bearingToCompass(bearing)}
              </strong>
            </p>
          </div>
        ) : (
          <p>Enable GPS to see distance and heading to basket.</p>
        )}

        <div className="hole-list">
          {course.holes.map((hole) => (
            <button
              key={hole.id}
              type="button"
              className={hole.id === selectedHole.id ? 'hole-btn active' : 'hole-btn'}
              onClick={() => onSelectHole(hole.id)}
            >
              {hole.name}
            </button>
          ))}
        </div>
      </aside>

      <div className="map-container">
        <MapContainer
          center={[
            (course.mapStart ?? course.center).lat,
            (course.mapStart ?? course.center).lng,
          ]}
          zoom={course.zoom}
          scrollWheelZoom
          className="leaflet-map"
        >
          <TileLayer
            url={
              course.tileUrl ??
              'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
            attribution={course.tileAttribution ?? '&copy; OpenStreetMap contributors'}
          />

          {course.paths.map((path) => (
            <Polyline
              key={path.id}
              pathOptions={{ color: '#2b8a3e', weight: 4 }}
              positions={path.points.map((point) => [point.lat, point.lng])}
            />
          ))}

          {course.holes.map((hole) => (
            <Marker
              key={`tee-${hole.id}`}
              position={[hole.tee.lat, hole.tee.lng]}
              icon={teeIcon}
            >
              <Popup>
                Tee: {hole.name}
                <br />
                <button type="button" onClick={() => onSelectHole(hole.id)}>
                  Navigate
                </button>
              </Popup>
            </Marker>
          ))}

          {course.holes.map((hole) => (
            <Marker
              key={`pin-${hole.id}`}
              position={[hole.pin.lat, hole.pin.lng]}
              icon={pinIcon}
            >
              <Popup>Basket: {hole.name}</Popup>
            </Marker>
          ))}

          {course.pois.map((poi) => (
            <Marker
              key={poi.id}
              position={[poi.position.lat, poi.position.lng]}
              icon={poiIconForKind(poi.kind)}
            >
              <Popup>
                <strong>{poi.name}</strong>
                <br />
                {poi.notes ?? poi.kind}
              </Popup>
            </Marker>
          ))}

          {userLocation ? (
            <Marker position={[userLocation.lat, userLocation.lng]}>
              <Popup>You are here</Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>
    </section>
  )
}
