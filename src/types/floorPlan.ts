export interface FloorPlanPoint {
  x: number;
  y: number;
}

export type FloorPlanRoomShape = 'polygon' | 'rectangle';

export interface FloorPlanRoomMarker {
  id: string;
  label: string;
  aliases: string[];
  kind?: 'internal' | 'external';
  shape?: FloorPlanRoomShape;
  polygon?: FloorPlanPoint[];
  labelPosition?: FloorPlanPoint;
  color?: string;
  notes?: string;
  address?: string;
  externalLabel?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FloorPlanLevel {
  id: string;
  label: string;
  shortLabel: string;
  order: number;
  showInSelector?: boolean;
  pinnedInSelector?: boolean;
  imageDataUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  markers: FloorPlanRoomMarker[];
}

export interface FloorPlanBuilding {
  id: string;
  name: string;
  aliases: string[];
  levels: FloorPlanLevel[];
}

export interface FloorPlanConfig {
  version: number;
  updatedAt: string;
  buildings: FloorPlanBuilding[];
}

export interface FloorPlanMatch {
  building: FloorPlanBuilding;
  level: FloorPlanLevel;
  marker: FloorPlanRoomMarker;
  matchedAlias: string;
  score: number;
}
