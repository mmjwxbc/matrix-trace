import { create } from "zustand";
import * as sessionsApi from "../api/sessions";
import { ApiError } from "../api/client";
import type { AgentMode, AgentState, SessionPreview } from "../types/agent";

interface UserLocation {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  altitude_m?: number | null;
  altitude_accuracy_m?: number | null;
  heading_degrees?: number | null;
  speed_mps?: number | null;
  timestamp_ms?: number;
}

interface SessionStore {
  mode: AgentMode;
  sessions: SessionPreview[];
  activeSessionId: string | null;
  agentState: AgentState | null;
  isLoading: boolean;
  error: string | null;
  userLocation: UserLocation | null;
  setMode: (mode: AgentMode) => Promise<void>;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string>;
  startDraftSession: () => string;
  selectDraftSession: (id: string) => void;
  isDraftSession: (id: string | null | undefined) => boolean;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateState: (state: AgentState) => void;
  setUserLocation: (loc: UserLocation | null) => void;
  requestUserLocation: () => Promise<void>;
  clearActiveSession: () => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  mode: "agent",
  sessions: [],
  activeSessionId: null,
  agentState: null,
  isLoading: false,
  error: null,
  userLocation: null,

  setMode: async (mode) => {
    if (get().mode === mode) return;
    set({
      mode,
      sessions: [],
      activeSessionId: null,
      agentState: null,
      error: null,
    });
    await get().loadSessions();
  },

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const mode = get().mode;
      const sessions = (await sessionsApi.listSessions(mode)).map((session) => ({
        ...session,
        mode,
      }));
      const drafts = get().sessions.filter((session) => session.isDraft && session.mode === mode);
      set({ sessions: [...drafts, ...sessions], isLoading: false });
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
    }
  },

  createSession: async () => {
    set({ error: null });
    const mode = get().mode;
    const { session_id } = await sessionsApi.createSession(mode);
    set((store) => ({
      activeSessionId: session_id,
      agentState: null,
      sessions: store.sessions.filter((session) => !session.isDraft || session.mode !== mode),
    }));
    await get().loadSessions();
    await get().selectSession(session_id);
    return session_id;
  },

  startDraftSession: () => {
    const { mode, sessions, activeSessionId } = get();
    const activeDraft = sessions.find((session) => session.session_id === activeSessionId && session.isDraft);
    if (activeDraft && !activeDraft.raw_input) {
      return activeDraft.session_id;
    }

    const existingDraft = sessions.find((session) => session.isDraft && session.mode === mode && !session.raw_input);
    if (existingDraft) {
      set({ activeSessionId: existingDraft.session_id, agentState: null, error: null });
      return existingDraft.session_id;
    }

    const now = Date.now() / 1000;
    const draft: SessionPreview = {
      session_id: `draft:${mode}:${Date.now()}`,
      created_at: now,
      last_active: now,
      status: "idle",
      raw_input: "",
      mode,
      isDraft: true,
    };

    set((store) => ({
      sessions: [draft, ...store.sessions.filter((session) => !session.isDraft || session.mode !== mode)],
      activeSessionId: draft.session_id,
      agentState: null,
      error: null,
    }));
    return draft.session_id;
  },

  selectDraftSession: (id) => {
    const draft = get().sessions.find((session) => session.session_id === id && session.isDraft);
    if (!draft) return;
    set({ activeSessionId: draft.session_id, agentState: null, error: null });
  },

  isDraftSession: (id) => {
    if (!id) return false;
    return get().sessions.some((session) => session.session_id === id && session.isDraft);
  },

  selectSession: async (id) => {
    if (get().isDraftSession(id)) {
      get().selectDraftSession(id);
      return;
    }
    set({ activeSessionId: id, error: null });
    try {
      const detail = await sessionsApi.getSession(id, get().mode);
      set({ agentState: detail.state });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        set({ activeSessionId: null, agentState: null, error: null });
      } else {
        set({ error: String(err) });
      }
    }
  },

  deleteSession: async (id) => {
    set({ error: null });
    if (get().isDraftSession(id)) {
      const { activeSessionId } = get();
      set((store) => ({
        sessions: store.sessions.filter((session) => session.session_id !== id),
        activeSessionId: activeSessionId === id ? null : activeSessionId,
        agentState: activeSessionId === id ? null : store.agentState,
      }));
      return;
    }

    try {
      await sessionsApi.deleteSession(id, get().mode);
      const { activeSessionId } = get();
      if (activeSessionId === id) {
        set({ activeSessionId: null, agentState: null });
      }
      await get().loadSessions();
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  updateState: (state) => {
    set((store) => {
      const now = Date.now() / 1000;
      const activeSessionId = store.activeSessionId;
      if (!activeSessionId) {
        return { agentState: state };
      }

      const existing = store.sessions.find((session) => session.session_id === activeSessionId);
      const nextSession: SessionPreview = {
        session_id: activeSessionId,
        created_at: existing?.created_at ?? now,
        last_active: now,
        status: state.status,
        raw_input: state.raw_input,
        mode: store.mode,
      };

      return {
        agentState: state,
        sessions: [nextSession, ...store.sessions.filter((session) => session.session_id !== activeSessionId)],
      };
    });
  },

  setUserLocation: (loc) => set({ userLocation: loc }),

  requestUserLocation: () =>
    new Promise<void>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          set({
            userLocation: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy,
              altitude_m: pos.coords.altitude,
              altitude_accuracy_m: pos.coords.altitudeAccuracy,
              heading_degrees: pos.coords.heading,
              speed_mps: pos.coords.speed,
              timestamp_ms: pos.timestamp,
            },
          });
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }),

  clearActiveSession: () => set({ activeSessionId: null, agentState: null }),
  clearError: () => set({ error: null }),
}));
