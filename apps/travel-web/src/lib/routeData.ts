import type { RouteData, RouteLeg, RouteMode, RouteWaypoint } from "../types/agent";
import type { ToolResultRoute, ToolResultWaypointRoute } from "../types/toolResults";

function normalizeRouteMode(mode: unknown): RouteMode {
  switch (mode) {
    case "driving":
    case "walking":
    case "riding":
    case "transit":
      return mode;
    case "bicycling":
      return "riding";
    default:
      return "driving";
  }
}

function splitOverviewPolyline(
  polyline: [number, number][],
  segmentCount: number,
  index: number
): [number, number][] {
  if (segmentCount <= 1 || polyline.length < 2) {
    return polyline;
  }

  const start = Math.floor((polyline.length * index) / segmentCount);
  const end = Math.floor((polyline.length * (index + 1)) / segmentCount);
  return polyline.slice(start, end);
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

function appendPolyline(base: [number, number][], next: [number, number][]): [number, number][] {
  if (base.length === 0) return [...next];
  if (next.length === 0) return [...base];
  const last = base[base.length - 1];
  const first = next[0];
  if (last && first && last[0] === first[0] && last[1] === first[1]) {
    return [...base, ...next.slice(1)];
  }
  return [...base, ...next];
}

function routeDistanceMeters(route: RouteData): number {
  if (typeof route.total_distance_meters === "number") return route.total_distance_meters;
  return route.legs.reduce((sum, leg) => sum + (leg.distance_meters ?? 0), 0);
}

function routeDurationSeconds(route: RouteData): number {
  if (typeof route.total_duration_seconds === "number") return route.total_duration_seconds;
  return route.legs.reduce((sum, leg) => sum + (leg.duration_seconds ?? 0), 0);
}

function samePoint(
  a: { lng: number; lat: number } | undefined,
  b: { lng: number; lat: number } | undefined
): boolean {
  if (!a || !b) return false;
  return Math.abs(a.lng - b.lng) < 0.00001 && Math.abs(a.lat - b.lat) < 0.00001;
}

function sameWaypoint(a: RouteWaypoint | undefined, b: RouteWaypoint | undefined): boolean {
  if (!a || !b) return false;
  if (samePoint(a, b)) return true;
  return a.name.trim() !== "" && a.name === b.name;
}

export function toolResultToRouteData(
  output: ToolResultRoute | ToolResultWaypointRoute,
  args: Record<string, unknown> | undefined
): RouteData | null {
  const mode = normalizeRouteMode(output.mode ?? args?.mode);

  if ("overview_polyline" in output || "legs" in output) {
    const wp = output as ToolResultWaypointRoute;
    const overview: [number, number][] = (wp.overview_polyline ?? []).map((p) => [p[0], p[1]]);
    const legs: RouteLeg[] = (wp.legs ?? []).map((leg, i) => {
      const totalLegs = (wp.legs ?? []).length || 1;
      const polyline: [number, number][] = (leg.polyline ?? []).map((p) => [p[0], p[1]]);
      return {
        start_name: leg.start_address || `Leg ${i + 1}`,
        end_name: leg.end_address || `Leg ${i + 2}`,
        start_lng: leg.start_point.lng,
        start_lat: leg.start_point.lat,
        end_lng: leg.end_point.lng,
        end_lat: leg.end_point.lat,
        distance_text: leg.distance_text,
        duration_text: leg.duration_text,
        distance_meters: leg.distance_meters,
        duration_seconds: leg.duration_seconds,
        polyline: polyline.length > 0 ? polyline : splitOverviewPolyline(overview, totalLegs, i),
      };
    });

    const waypoints: RouteWaypoint[] = [];
    if (legs[0]) {
      waypoints.push({
        name: legs[0].start_name,
        lng: legs[0].start_lng ?? 0,
        lat: legs[0].start_lat ?? 0,
      });
    }
    legs.forEach((leg) => {
      waypoints.push({
        name: leg.end_name,
        lng: leg.end_lng ?? 0,
        lat: leg.end_lat ?? 0,
      });
    });

    return {
      waypoints,
      mode,
      legs,
      total_distance_text: wp.total_distance_text ?? "Unknown",
      total_duration_text: wp.total_duration_text ?? "Unknown",
      total_distance_meters: wp.total_distance_meters,
      total_duration_seconds: wp.total_duration_seconds,
      overview_polyline: overview,
    };
  }

  const single = output as ToolResultRoute;
  if (!single.origin || !single.destination) return null;
  const polyline: [number, number][] = (single.polyline ?? []).map((p) => [p[0], p[1]]);
  const startName = single.start_address || "Origin";
  const endName = single.end_address || "Destination";
  return {
    waypoints: [
      { name: startName, lng: single.origin.lng, lat: single.origin.lat },
      { name: endName, lng: single.destination.lng, lat: single.destination.lat },
    ],
    mode,
    legs: [
      {
        start_name: startName,
        end_name: endName,
        start_lng: single.origin.lng,
        start_lat: single.origin.lat,
        end_lng: single.destination.lng,
        end_lat: single.destination.lat,
        distance_text: single.distance_text,
        duration_text: single.duration_text,
        distance_meters: single.distance_meters,
        duration_seconds: single.duration_seconds,
        polyline,
      },
    ],
    total_distance_text: single.distance_text,
    total_duration_text: single.duration_text,
    total_distance_meters: single.distance_meters,
    total_duration_seconds: single.duration_seconds,
    overview_polyline: polyline,
  };
}

export function routeDataFromToolResultRecord(result: unknown): RouteData | null {
  if (!result || typeof result !== "object") return null;
  const record = result as {
    output_data?: ToolResultRoute | ToolResultWaypointRoute;
    arguments?: Record<string, unknown>;
  };
  if (!record.output_data) return null;
  return toolResultToRouteData(record.output_data, record.arguments);
}

export function combineRoutes(
  routes: RouteData[],
  userLocation: { lng: number; lat: number } | null
): RouteData | null {
  if (routes.length === 0) return null;

  let merged = routes[0];
  for (let i = 1; i < routes.length; i += 1) {
    const incoming = routes[i];
    const waypoints = [...merged.waypoints];
    incoming.waypoints.forEach((waypoint, index) => {
      if (index === 0 && sameWaypoint(waypoints[waypoints.length - 1], waypoint)) {
        return;
      }
      waypoints.push(waypoint);
    });

    const legs = [...merged.legs];
    incoming.legs.forEach((leg) => {
      const lastLeg = legs[legs.length - 1];
      const duplicate =
        lastLeg &&
        lastLeg.start_name === leg.start_name &&
        lastLeg.end_name === leg.end_name;
      if (!duplicate) {
        legs.push(leg);
      }
    });

    const totalDistanceMeters = routeDistanceMeters(merged) + routeDistanceMeters(incoming);
    const totalDurationSeconds = routeDurationSeconds(merged) + routeDurationSeconds(incoming);

    merged = {
      waypoints,
      mode: merged.mode === incoming.mode ? merged.mode : incoming.mode,
      legs,
      total_distance_meters: totalDistanceMeters,
      total_duration_seconds: totalDurationSeconds,
      total_distance_text: formatDistance(totalDistanceMeters),
      total_duration_text: formatDuration(totalDurationSeconds),
      overview_polyline: appendPolyline(
        merged.overview_polyline ?? [],
        incoming.overview_polyline ?? []
      ),
    };
  }

  if (!userLocation) {
    return merged;
  }

  const first = merged.waypoints[0];
  if (first && samePoint(first, userLocation)) {
    return merged;
  }

  return {
    ...merged,
    waypoints: [{ name: "You", lng: userLocation.lng, lat: userLocation.lat }, ...merged.waypoints],
  };
}
