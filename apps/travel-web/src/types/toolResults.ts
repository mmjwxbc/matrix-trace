export interface ToolResultRoutePoint {
  lat: number;
  lng: number;
}

export interface ToolResultRoute {
  origin: ToolResultRoutePoint;
  destination: ToolResultRoutePoint;
  mode: string;
  start_address?: string;
  end_address?: string;
  distance_meters: number;
  duration_seconds: number;
  distance_text: string;
  duration_text: string;
  polyline: [number, number][];
}

export interface ToolResultWaypointLeg {
  start_point: ToolResultRoutePoint;
  end_point: ToolResultRoutePoint;
  start_address?: string;
  end_address?: string;
  distance_meters: number;
  duration_seconds: number;
  distance_text: string;
  duration_text: string;
  polyline?: [number, number][];
}

export interface ToolResultWaypointRoute {
  mode: string;
  total_distance_meters: number;
  total_duration_seconds: number;
  total_distance_text: string;
  total_duration_text: string;
  overview_polyline: [number, number][];
  legs: ToolResultWaypointLeg[];
}
