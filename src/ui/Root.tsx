/**
 * Application root: shows the start screen until there's a game to play, then hands over to the
 * main shell.
 */

import { useState } from 'react';
import { GameState } from '../engine/gamestate';
import { GameProvider } from './GameContext';
import { App } from './App';
import { StartScreen } from './screens/StartScreen';

export function Root() {
  const [state, setState] = useState<GameState | null>(null);

  if (!state) return <StartScreen onStart={setState} />;

  // Keying on the manager's club and seed means loading a different save remounts cleanly.
  return (
    <GameProvider key={`${state.seed}:${state.manager.clubId}`} initialState={state}>
      <App onQuit={() => setState(null)} />
    </GameProvider>
  );
}
