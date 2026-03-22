import floorPlansData from '../data/floorPlans.json';
import { normalizeLocationToken, normalizeRoomReference } from './location';
import { FloorPlanConfig, FloorPlanMatch, FloorPlanPoint, FloorPlanRoomMarker, FloorPlanRoomShape } from '../types/floorPlan';

export const floorPlanConfig = floorPlansData as FloorPlanConfig;

function addNormalizedCandidate(candidates: Set<string>, value?: string | null) {
  const normalized = value ? normalizeLocationToken(value) : '';

  if (normalized) {
    candidates.add(normalized);
  }
}

function getLocationCandidates(location: string) {
  const normalizedRoomLocation = normalizeRoomReference(location);
  const rawCandidates = [location, normalizedRoomLocation]
    .flatMap((value) => value.split(/[,;|+&]/))
    .flatMap((part) => part.split(/\s+/))
    .map((part) => part.trim())
    .filter(Boolean);

  const normalizedCandidates = new Set<string>();

  rawCandidates.forEach((part) => {
    addNormalizedCandidate(normalizedCandidates, part);
  });

  [location, normalizedRoomLocation].forEach((value) => {
    value.match(/[A-Za-z]+\s*\d+[A-Za-z0-9]*/g)?.forEach((part) => {
      addNormalizedCandidate(normalizedCandidates, part);
    });

    value.match(/\b\d+\s*[A-Za-z]+\b/g)?.forEach((part) => {
      addNormalizedCandidate(normalizedCandidates, part);
    });
  });

  location.match(/\blokaal\s*([0-9]+[a-z0-9]*)\b/gi)?.forEach((part) => {
    const match = part.match(/([0-9]+[a-z0-9]*)/i);

    if (match?.[1]) {
      addNormalizedCandidate(normalizedCandidates, `b${match[1]}`);
    }
  });

  addNormalizedCandidate(normalizedCandidates, location);
  addNormalizedCandidate(normalizedCandidates, normalizedRoomLocation);

  if (normalizedCandidates.size === 0) {
    addNormalizedCandidate(normalizedCandidates, location.replace(/\s+/g, ''));
    addNormalizedCandidate(normalizedCandidates, normalizedRoomLocation.replace(/\s+/g, ''));
  }

  return Array.from(normalizedCandidates);
}

export function formatFloorPlanLabel(label?: string | null) {
  return normalizeRoomReference(label).trim();
}

export function getFloorPlanMarkerBounds(marker: FloorPlanRoomMarker) {
  const polygon = getFloorPlanMarkerPolygon(marker);

  if (!polygon?.length) {
    return null;
  }

  const xValues = polygon.map((point) => point.x);
  const yValues = polygon.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getMarkerAliases(marker: FloorPlanRoomMarker) {
  return Array.from(new Set([marker.id, marker.label, ...marker.aliases].filter(Boolean)))
    .map(formatFloorPlanLabel)
    .map(normalizeLocationToken);
}

function getAliasScore(candidate: string, alias: string) {
  if (!candidate || !alias) {
    return 0;
  }

  const specificity = alias.length + (/\d/.test(alias) ? 12 : 0) + (/[A-Z]/.test(alias) ? 2 : 0);

  if (candidate === alias) {
    return 200 + specificity;
  }

  if (candidate.includes(alias) || alias.includes(candidate)) {
    return Math.min(candidate.length, alias.length) >= 3 ? 100 + specificity : 0;
  }

  return 0;
}

export function findFloorPlanMatch(location?: string | null): FloorPlanMatch | null {
  if (!location?.trim()) {
    return null;
  }

  const candidates = getLocationCandidates(location);
  let bestMatch: FloorPlanMatch | null = null;

  floorPlanConfig.buildings.forEach((building) => {
    building.levels.forEach((level) => {
      level.markers.forEach((marker) => {
        getMarkerAliases(marker).forEach((alias) => {
          candidates.forEach((candidate) => {
            const score = getAliasScore(candidate, alias);

            if (!score) {
              return;
            }

            if (!bestMatch || score > bestMatch.score) {
              bestMatch = {
                building,
                level,
                marker,
                matchedAlias: alias,
                score,
              };
            }
          });
        });
      });
    });
  });

  return bestMatch;
}

export function isExternalFloorPlanMarker(marker?: FloorPlanRoomMarker | null) {
  return marker?.kind === 'external';
}

export function getFloorPlanMarkerShape(marker: FloorPlanRoomMarker): FloorPlanRoomShape {
  if (marker.shape === 'rectangle' || marker.shape === 'polygon') {
    return marker.shape;
  }

  if (
    typeof marker.x === 'number' &&
    typeof marker.y === 'number' &&
    typeof marker.width === 'number' &&
    typeof marker.height === 'number'
  ) {
    return 'rectangle';
  }

  return 'polygon';
}

export function getFloorPlanMarkerPolygon(marker: FloorPlanRoomMarker) {
  if (getFloorPlanMarkerShape(marker) === 'polygon' && marker.polygon?.length && marker.polygon.length >= 3) {
    return marker.polygon;
  }

  if (
    typeof marker.x === 'number' &&
    typeof marker.y === 'number' &&
    typeof marker.width === 'number' &&
    typeof marker.height === 'number'
  ) {
    return [
      { x: marker.x, y: marker.y },
      { x: marker.x + marker.width, y: marker.y },
      { x: marker.x + marker.width, y: marker.y + marker.height },
      { x: marker.x, y: marker.y + marker.height },
    ];
  }

  if (typeof marker.x === 'number' && typeof marker.y === 'number') {
    const size = 4;

    return [
      { x: marker.x - size, y: marker.y - size },
      { x: marker.x + size, y: marker.y - size },
      { x: marker.x + size, y: marker.y + size },
      { x: marker.x - size, y: marker.y + size },
    ];
  }

  return null;
}

export function getFloorPlanMarkerLabelPosition(marker: FloorPlanRoomMarker) {
  if (marker.labelPosition) {
    return marker.labelPosition;
  }

  const polygon = getFloorPlanMarkerPolygon(marker);

  if (!polygon?.length) {
    return null;
  }

  return getPolygonCentroid(polygon);
}

export function getPolygonCentroid(points: FloorPlanPoint[]) {
  const totals = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: Number((totals.x / points.length).toFixed(1)),
    y: Number((totals.y / points.length).toFixed(1)),
  };
}
