/**
 * Settings and saves.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../GameContext';
import {
  deleteSave, exportSaveFile, listSaves, loadGame, saveGame, SaveSlotMeta,
} from '../../game/save';
import { canUndo, undo } from '../../game/actions';
import { getClub } from '../../engine/gamestate';
import { settingsFor } from '../../engine/difficulty';
import { ConfirmDialog, Field, OptionGroup, Panel } from '../components';

export function SettingsScreen({ onQuit }: { onQuit: () => void }) {
  const { state, replace, refresh, settings, updateSettings, showToast } = useGame();
  const [saves, setSaves] = useState<SaveSlotMeta[]>([]);
  const [slotName, setSlotName] = useState('');
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [busy, setBusy] = useState(false);

  const club = getClub(state, state.manager.clubId);
  const difficulty = settingsFor(state.difficulty);

  useEffect(() => { setSaves(listSaves()); }, []);

  const doSave = async (id: string, name: string) => {
    setBusy(true);
    try {
      const meta = await saveGame(state, id, name);
      setSaves(listSaves());
      showToast(`Saved to "${name}" (${Math.round(meta.sizeBytes / 1024)}KB, ${meta.storage}).`);
    } catch {
      showToast('Could not save — browser storage may be full. Try exporting to a file instead.', true);
    }
    setBusy(false);
  };

  return (
    <>
      <div className="grid grid--2">
        <Panel title="Saved games">
          <div className="row" style={{ marginBottom: 10 }}>
            <input
              placeholder="New save name"
              value={slotName}
              onChange={(e) => setSlotName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void doSave(`slot-${Date.now()}`, slotName.trim() || `${club.shortName} ${state.season}`)}
            >
              Save
            </button>
          </div>
          <table className="data">
            <tbody>
              {saves.map((save) => (
                <tr key={save.id}>
                  <td>
                    <div className="strong">{save.name}</div>
                    <div className="faint small">
                      {save.clubName} · {save.season} · {save.date} · {Math.round(save.sizeBytes / 1024)}KB
                    </div>
                  </td>
                  <td className="num">
                    <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => void doSave(save.id, save.name)}
                      >
                        Overwrite
                      </button>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={async () => {
                          const loaded = await loadGame(save.id);
                          if (loaded) { replace(loaded); showToast('Save loaded.'); }
                          else showToast('That save could not be loaded.', true);
                        }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="btn btn--small btn--danger"
                        onClick={() => void deleteSave(save.id).then(() => setSaves(listSaves()))}
                      >
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {saves.length === 0 && <tr><td className="muted">No saves yet.</td></tr>}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => exportSaveFile(state)}>
              Export to a file
            </button>
            <span className="faint small">
              Saves live in your browser. Export a file if you want one that survives clearing
              your browsing data.
            </span>
          </div>
        </Panel>

        <div>
          <Panel title="Preferences">
            <Field label="Default match speed">
              <OptionGroup
                options={[
                  { value: 'slow', label: 'Slow' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'fast', label: 'Fast' },
                ]}
                value={settings.matchSpeed}
                onChange={(value) => updateSettings({ matchSpeed: value })}
              />
            </Field>
            <div className="col" style={{ marginTop: 12 }}>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={settings.showAttributeColours}
                  onChange={(e) => updateSettings({ showAttributeColours: e.target.checked })}
                />
                Colour-code attribute values
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={settings.confirmRiskyActions}
                  onChange={(e) => updateSettings({ confirmRiskyActions: e.target.checked })}
                />
                Confirm before irreversible decisions
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={state.autoPlayMatches}
                  onChange={(e) => { state.autoPlayMatches = e.target.checked; refresh(); }}
                />
                Auto-simulate my matches (skip the match screen)
              </label>
            </div>
          </Panel>

          <Panel title={`Difficulty — ${state.difficulty}`}>
            <p className="muted" style={{ marginTop: 0 }}>
              Difficulty is fixed for the career. On this setting:
            </p>
            <table className="data">
              <tbody>
                <tr>
                  <td>Bias in your favour</td>
                  <td className="num">
                    {difficulty.attackBonus > 1
                      ? `+${Math.round((difficulty.attackBonus - 1) * 100)}% attack, +${Math.round((difficulty.defenceBonus - 1) * 100)}% defence`
                      : 'None'}
                  </td>
                </tr>
                <tr><td>Board patience</td><td className="num">×{difficulty.boardPatience}</td></tr>
                <tr><td>Injury frequency</td><td className="num">×{difficulty.injuryRate}</td></tr>
                <tr><td>Rivals bidding for your players</td><td className="num">×{difficulty.poachingAggression}</td></tr>
                <tr><td>Budgets</td><td className="num">×{difficulty.budgetMultiplier}</td></tr>
                <tr>
                  <td>Bad-run guardrail</td>
                  <td className="num">
                    {difficulty.badRunGuardrail
                      ? `after ${difficulty.badRunGuardrail} straight defeats`
                      : 'Off'}
                  </td>
                </tr>
                <tr><td>Undo last action</td><td className="num">{difficulty.allowUndo ? 'Allowed' : 'Off'}</td></tr>
                <tr><td>Auto-fix illegal line-ups</td><td className="num">{difficulty.autoRepairSelection ? 'On' : 'Off'}</td></tr>
              </tbody>
            </table>
          </Panel>

          <Panel title="Undo">
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!canUndo(state)}
                onClick={() => {
                  const restored = undo(state);
                  if (restored) { replace(restored); showToast('Last action undone.'); }
                }}
              >
                {canUndo(state) ? `Undo: ${state.lastUndo?.label}` : 'Nothing to undo'}
              </button>
            </div>
            <p className="faint small" style={{ marginBottom: 0 }}>
              You can undo your most recent transfer or contract action, but only on the same day it
              happened. Once you press Continue, it stands.
            </p>
          </Panel>

          <Panel title="Quit">
            <button type="button" className="btn btn--danger" onClick={() => setConfirmQuit(true)}>
              Quit to the start screen
            </button>
          </Panel>
        </div>
      </div>

      {confirmQuit && (
        <ConfirmDialog
          title="Quit to the start screen?"
          danger
          confirmLabel="Quit"
          body={<p>Unsaved progress since the last autosave will be lost. Save first if you want to be certain.</p>}
          onCancel={() => setConfirmQuit(false)}
          onConfirm={onQuit}
        />
      )}
    </>
  );
}
