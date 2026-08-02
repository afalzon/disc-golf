import type { Course } from '../types/course'

export const defaultCourse: Course = {
  id: 'demo-course',
  name: 'Demo Disc Golf Course',
  center: { lat: -37.814, lng: 144.9633 },
  mapStart: { lat: -37.814, lng: 144.9633 },
  zoom: 15,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; OpenStreetMap contributors',
  holes: [
    {
      id: 1,
      name: 'Hole 1',
      par: 3,
      tee: { lat: -37.8145, lng: 144.9623 },
      pin: { lat: -37.8137, lng: 144.9631 },
      notes: 'Slight left finish. Watch the tree line.',
    },
    {
      id: 2,
      name: 'Hole 2',
      par: 4,
      tee: { lat: -37.8134, lng: 144.9632 },
      pin: { lat: -37.8129, lng: 144.9642 },
      notes: 'Long fairway with rough on the right.',
    },
    {
      id: 3,
      name: 'Hole 3',
      par: 3,
      tee: { lat: -37.813, lng: 144.9645 },
      pin: { lat: -37.8139, lng: 144.9651 },
      notes: 'Narrow tunnel shot through mature trees.',
    },
  ],
  paths: [
    {
      id: 'path-1',
      name: 'Main Walkway',
      points: [
        { lat: -37.8146, lng: 144.9625 },
        { lat: -37.8139, lng: 144.9633 },
        { lat: -37.8132, lng: 144.9644 },
      ],
    },
  ],
  pois: [
    {
      id: 'poi-parking',
      name: 'Parking',
      kind: 'parking',
      position: { lat: -37.8148, lng: 144.9629 },
      notes: 'Main car park and check-in point.',
    },
    {
      id: 'poi-water',
      name: 'Water Station',
      kind: 'water',
      position: { lat: -37.8137, lng: 144.9641 },
      notes: 'Refill bottles here if available.',
    },
    {
      id: 'poi-restroom',
      name: 'Restroom',
      kind: 'restroom',
      position: { lat: -37.8139, lng: 144.9628 },
      notes: 'Near the course entrance.',
    },
    {
      id: 'poi-shelter',
      name: 'Shelter',
      kind: 'shelter',
      position: { lat: -37.8135, lng: 144.9637 },
      notes: 'Covered seating area.',
    },
    {
      id: 'poi-other',
      name: 'Notice Board',
      kind: 'other',
      position: { lat: -37.8142, lng: 144.9646 },
      notes: 'General course information and notices.',
    },
  ],
}
