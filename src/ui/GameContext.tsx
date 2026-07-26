/**
 * The single place React talks to the engine.
 *
 * Game state is a big mutable object graph, so rather than fight it into immutable updates we
 * mutate it through the action layer and bump a version counter to trigger a re-render. That
 * keeps the engine simple and the UI honest about the fact that this is a simulation, not a form.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { GameState } from '../engine/gamestate';
import { AdvanceDigest } from '../game/loop';
import { UiSettings, DEFAULT_SETTINGS, loadSettings, saveSettings, autosave } from '../game/save';

export type Screen =
  | 'home' | 'squad' | 'tactics' | 'training' | 'fixtures' | 'tables' | 'transfers'
  | 'scouting' | 'finances' | 'stadium' | 'staff' | 'board' | 'club' | 'manager'
  | 'stats' | 'settings' | 'match';

interface GameContextValue {
  state: GameState;
  /** Re-render after mutating the state through an action. */
  refresh: () => void;
  /** Replace the whole state, e.g. after an undo or a load. */
  replace: (next: GameState) => void;
  screen: Screen;
  setScreen: (screen: Screen) => void;
  /** Player profile currently open in a modal, if any. */
  inspectedPlayerId: string | null;
  inspectPlayer: (id: string | null) => void;
  toast: { message: string; error: boolean } | null;
  showToast: (message: string, error?: boolean) => void;
  settings: UiSettings;
  updateSettings: (changes: Partial<UiSettings>) => void;
  /** News ids that halted the last advance — the inbox highlights and auto-opens them. */
  focusNewsIds: string[] | null;
  setFocusNews: (ids: string[] | null) => void;
  /** What happened during the last advance, shown as a strip on Home until dismissed. */
  digest: AdvanceDigest | null;
  setDigest: (digest: AdvanceDigest | null) => void;
  /** Version counter — components can depend on it to memoise expensive derivations. */
  version: number;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({
  initialState,
  children,
}: {
  initialState: GameState;
  children: React.ReactNode;
}) {
  const stateRef = useRef(initialState);
  const [version, setVersion] = useState(0);
  const [screen, setScreen] = useState<Screen>('home');
  const [inspectedPlayerId, setInspected] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [settings, setSettings] = useState<UiSettings>(() => loadSettings());
  const [focusNewsIds, setFocusNews] = useState<string[] | null>(null);
  const [digest, setDigest] = useState<AdvanceDigest | null>(null);
  const toastTimer = useRef<number | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const replace = useCallback((next: GameState) => {
    stateRef.current = next;
    setVersion((v) => v + 1);
  }, []);

  const showToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const updateSettings = useCallback((changes: Partial<UiSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes };
      saveSettings(next);
      return next;
    });
  }, []);

  const inspectPlayer = useCallback((id: string | null) => setInspected(id), []);

  const value = useMemo<GameContextValue>(() => ({
    state: stateRef.current,
    refresh,
    replace,
    screen,
    setScreen,
    inspectedPlayerId,
    inspectPlayer,
    toast,
    showToast,
    settings,
    updateSettings,
    focusNewsIds,
    setFocusNews,
    digest,
    setDigest,
    version,
  }), [refresh, replace, screen, inspectedPlayerId, inspectPlayer, toast, showToast, settings,
    updateSettings, focusNewsIds, digest, version]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used inside a GameProvider');
  return context;
}

/** Autosave without blocking the UI, and without caring if storage is unavailable. */
export function backgroundAutosave(state: GameState): void {
  void autosave(state).catch(() => {
    // Storage full or unavailable — the manual save screen surfaces the problem properly.
  });
}

export { DEFAULT_SETTINGS };
