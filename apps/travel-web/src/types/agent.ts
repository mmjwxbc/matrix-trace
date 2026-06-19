export type AgentStatus = "running" | "done" | "failed";
export type AgentMode = "agent" | "activity-workflow";
export type RouteMode = "driving" | "walking" | "riding" | "transit";
export type AgentStage =
  | "intent_parsing"
  | "constraint_extraction"
  | "candidate_generation"
  | "tool_execution"
  | "scoring"
  | "final_execution"
  | "user_summary"
  | "conversation"
  | "assistant_turn"
  | "done"
  | "failed";

export interface SessionPreview {
  session_id: string;
  created_at: number;
  last_active: number;
  status: string;
  raw_input: string;
  mode?: AgentMode;
  isDraft?: boolean;
}

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface UserConversationMessage {
  role: "user";
  content: string | TextContentBlock[];
  mode: string;
  timestamp: number;
}

export interface AssistantConversationMessage {
  role: "assistant";
  content: TextContentBlock[];
  stage?: string | null;
  timestamp: number;
}

export interface ToolResultConversationMessage {
  role: "toolResult";
  tool_call_id: string;
  tool_name: string;
  content: TextContentBlock[];
  is_error: boolean;
  stage?: string | null;
  timestamp: number;
}

export type ConversationMessage =
  | UserConversationMessage
  | AssistantConversationMessage
  | ToolResultConversationMessage;

export interface ConversationContext {
  system_prompt: string;
  messages: ConversationMessage[];
}

export interface AgentTurn {
  turn_id: string;
  stage: string;
  trigger_mode: string;
  user_message: string | null;
  assistant_message: string | null;
  tool_calls: string[];
  status: "running" | "completed" | "failed";
}

export interface RouteWaypoint {
  name: string;
  lng: number;
  lat: number;
}

export interface RouteLeg {
  start_name: string;
  end_name: string;
  start_lng?: number;
  start_lat?: number;
  end_lng?: number;
  end_lat?: number;
  distance_text: string;
  duration_text: string;
  distance_meters?: number;
  duration_seconds?: number;
  polyline: [number, number][];
}

export interface RouteData {
  waypoints: RouteWaypoint[];
  mode: RouteMode;
  legs: RouteLeg[];
  total_distance_text: string;
  total_duration_text: string;
  total_distance_meters?: number;
  total_duration_seconds?: number;
  overview_polyline?: [number, number][];
}

export interface ToolCallLog {
  stage: string;
  tool_name: string;
  input_summary: string;
  output_summary: string;
  success: boolean;
  duration_ms: number;
  error_message: string | null;
}

export interface ToolEvent {
  id: string;
  toolName: string;
  direction: "start" | "end";
  durationMs?: number;
  success?: boolean;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
  timestamp: number;
}

export interface AgentTurnMessage {
  id: string;
  text: string;
  toolEvents?: ToolEvent[];
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  kind: "user" | "assistant";
  text?: string;
  route?: RouteData;
  timestamp: number;
  toolEvents?: ToolEvent[];
  turns?: AgentTurnMessage[];
  hasFinalPlan?: boolean;
  hasCandidatePlans?: boolean;
}

export interface AgentStatusDisplay {
  text: string;
  icon: string;
  variant: "running" | "done" | "failed";
}

export interface AgentState {
  raw_input: string;
  status: AgentStatus;
  current_action: string;
  current_stage: AgentStage;
  step_count: number;
  max_steps: number;
  conversation: ConversationContext;
  turns: AgentTurn[];
  candidate_plans: unknown[];
  tool_results: Record<string, unknown>;
  tool_logs: ToolCallLog[];
  final_plan: unknown | null;
  runtime_context: Record<string, unknown>;
  errors: string[];
  user_lat: number | null;
  user_lng: number | null;
}

export interface SessionDetail {
  session_id: string;
  created_at: number;
  last_active: number;
  state: AgentState | null;
}
