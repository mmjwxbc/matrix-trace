export interface SessionSummary {
  sessionId: string;
  status: "idle" | "running";
  createdAt: number;
}

export interface PromptRequest {
  message: string;
  mode?: string;
  lat?: number;
  lng?: number;
  accuracy_m?: number;
  altitude_m?: number;
  altitude_accuracy_m?: number;
  heading_degrees?: number;
  speed_mps?: number;
  timestamp_ms?: number;
}
