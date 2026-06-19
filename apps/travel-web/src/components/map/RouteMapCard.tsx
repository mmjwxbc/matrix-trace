import React from "react";
import type { RouteData, RouteMode } from "../../types/agent";

interface RouteMapCardProps {
  route: RouteData;
}

const MODE_LABELS: Record<RouteMode, string> = {
  driving: "Driving",
  walking: "Walking",
  riding: "Cycling",
  transit: "Transit",
};

export function RouteMapCard({ route }: RouteMapCardProps) {
  return (
    <section className="route-card">
      <div className="route-card__header">
        <div>
          <div className="route-card__eyebrow">Route</div>
          <h4>{MODE_LABELS[route.mode]}</h4>
        </div>
        <div className="route-card__totals">
          <span>{route.total_distance_text}</span>
          <span>{route.total_duration_text}</span>
        </div>
      </div>
      <ol className="route-card__stops">
        {route.waypoints.map((waypoint, index) => (
          <li key={`${waypoint.name}-${index}`} className="route-card__stop">
            <span className="route-card__index">{index + 1}</span>
            <div>
              <strong>{waypoint.name}</strong>
              <div>{waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
