/**
 * Tactics: the formation pitch, roles, team instructions, set pieces and opposition notes.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, squadOf } from '../../engine/gamestate';
import { POSITION_COORDS, Player, Tactics as TacticsType } from '../../engine/types';
import { FORMATIONS, ROLES_BY_POSITION } from '../../engine/formations';
import { validateSelection } from '../../engine/selection';
import {
  pickTeamAutomatically, setBenchSlot, setFormation, setPlayerInSlot, setSetPieceTaker,
  setSlotRole, updateTactics,
} from '../../game/actions';
import { matchEffectiveness } from '../../engine/players';
import { Field, Panel, Attr } from '../components';

export function TacticsScreen() {
  const { state, refresh, showToast, inspectPlayer } = useGame();
  const club = getClub(state, state.manager.clubId);
  const tactics = club.tactics;
  const squad = squadOf(state, club.id).filter((p) => !p.loan);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const problems = validateSelection(state, club.id);
  const selectedIds = new Set(tactics.slots.map((s) => s.playerId).filter(Boolean) as string[]);
  const benchIds = new Set(tactics.bench.filter(Boolean) as string[]);

  const available = squad
    .filter((p) => !selectedIds.has(p.id) && !benchIds.has(p.id))
    .sort((a, b) => b.currentAbility - a.currentAbility);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 420px) 1fr' }}>
      <div>
        <Panel
          title={`Formation — ${tactics.formationName}`}
          actions={
            <button
              type="button"
              className="btn btn--small"
              onClick={() => { pickTeamAutomatically(state); refresh(); showToast('Strongest side selected.'); }}
            >
              Auto pick
            </button>
          }
        >
          <Field label="Formation">
            <select
              value={tactics.formationName}
              onChange={(event) => { setFormation(state, event.target.value); refresh(); }}
            >
              {FORMATIONS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </Field>

          <div className="tactics-pitch" style={{ marginTop: 10 }}>
            {tactics.slots.map((slot, index) => {
              const coords = POSITION_COORDS[slot.position];
              const player = slot.playerId ? state.players[slot.playerId] : null;
              const effectiveness = player ? matchEffectiveness(player, slot.position) : 0;
              const uncomfortable = player && player.positions[slot.position] < 12;
              return (
                <button
                  key={index}
                  type="button"
                  className={[
                    'tactics-slot',
                    selectedSlot === index ? 'tactics-slot--selected' : '',
                    player ? '' : 'tactics-slot--empty',
                  ].filter(Boolean).join(' ')}
                  style={{ left: `${coords.x * 100}%`, top: `${(1 - coords.y) * 100}%` }}
                  onClick={() => setSelectedSlot(selectedSlot === index ? null : index)}
                  title={player ? `${player.firstName} ${player.lastName} — effectiveness ${(effectiveness * 100).toFixed(0)}%` : 'Empty'}
                >
                  <span className="tactics-slot__pos">{slot.position}</span>
                  <span className={`tactics-slot__name${uncomfortable ? ' warn' : ''}`}>
                    {player ? player.shortName : '—'}
                  </span>
                  <span className="tactics-slot__role">{slot.role}</span>
                </button>
              );
            })}
          </div>

          {problems.length > 0 && (
            <ul style={{ marginTop: 10, paddingLeft: 18 }}>
              {problems.map((problem, index) => (
                <li key={index} className={problem.severity === 'error' ? 'neg' : 'warn'}>
                  {problem.message}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Substitutes" flush>
          <table className="data">
            <tbody>
              {tactics.bench.map((id, index) => {
                const player = id ? state.players[id] : null;
                return (
                  <tr key={index}>
                    <td className="faint">{index + 1}</td>
                    <td>
                      <select
                        value={id ?? ''}
                        onChange={(event) => {
                          setBenchSlot(state, index, event.target.value || null);
                          refresh();
                        }}
                      >
                        <option value="">— empty —</option>
                        {player && <option value={player.id}>{player.shortName} ({player.naturalPosition})</option>}
                        {available.map((p) => (
                          <option key={p.id} value={p.id}>{p.shortName} ({p.naturalPosition})</option>
                        ))}
                      </select>
                    </td>
                    <td className="num muted">{player ? player.currentAbility : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <div>
        {selectedSlot !== null && (
          <SlotEditor
            slotIndex={selectedSlot}
            squad={squad}
            onClose={() => setSelectedSlot(null)}
          />
        )}

        <Panel title="Team instructions">
          <div className="grid grid--3">
            <TacticSelect label="Mentality" field="mentality"
              options={['Defensive', 'Counter', 'Balanced', 'Attacking', 'Overload']} />
            <TacticSelect label="Tempo" field="tempo" options={['Slow', 'Normal', 'Fast']} />
            <TacticSelect label="Width" field="width" options={['Narrow', 'Normal', 'Wide']} />
            <TacticSelect label="Passing" field="passingStyle"
              options={['Short', 'Mixed', 'Direct', 'Long Ball']} />
            <TacticSelect label="Pressing" field="pressing"
              options={['Deep', 'Standard', 'High', 'Gegenpress']} />
            <TacticSelect label="Defensive line" field="defensiveLine"
              options={['Deep', 'Normal', 'High']} />
            <TacticSelect label="Marking" field="marking" options={['Zonal', 'Man']} />
            <TacticSelect label="Tackling" field="tackling" options={['Cautious', 'Normal', 'Hard']} />
            <Field label="Time wasting">
              <input
                type="range" min={1} max={20} value={tactics.timeWasting}
                onChange={(event) => { updateTactics(state, { timeWasting: Number(event.target.value) }); refresh(); }}
              />
              <span className="mono">{tactics.timeWasting}/20</span>
            </Field>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 16 }}>
            <label className="row" style={{ gap: 5 }}>
              <input
                type="checkbox" checked={tactics.counterAttack}
                onChange={(event) => { updateTactics(state, { counterAttack: event.target.checked }); refresh(); }}
              />
              Counter attack
            </label>
            <label className="row" style={{ gap: 5 }}>
              <input
                type="checkbox" checked={tactics.offsideTrap}
                onChange={(event) => { updateTactics(state, { offsideTrap: event.target.checked }); refresh(); }}
              />
              Offside trap
            </label>
          </div>
          <p className="faint small" style={{ marginBottom: 0 }}>
            A high line and heavy pressing create more chances but leave you exposed. Hard tackling
            wins the ball back more often and gets your players booked.
          </p>
        </Panel>

        <Panel title="Set pieces and captaincy">
          <div className="grid grid--3">
            {([
              ['penalties', 'Penalties'],
              ['freeKicks', 'Free kicks'],
              ['corners', 'Corners'],
              ['longThrows', 'Long throws'],
              ['captain', 'Captain'],
              ['viceCaptain', 'Vice captain'],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <select
                  value={tactics.setPieces[key] ?? ''}
                  onChange={(event) => { setSetPieceTaker(state, key, event.target.value || null); refresh(); }}
                >
                  <option value="">— none —</option>
                  {squad.map((p) => (
                    <option key={p.id} value={p.id}>{p.shortName}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </Panel>

        <Panel title="Squad not in the matchday eighteen" flush>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th><th>Pos</th><th className="num">Ab</th>
                <th className="num">Cond</th><th className="num">Mor</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {available.map((player) => (
                <tr key={player.id} className="clickable" onClick={() => inspectPlayer(player.id)}>
                  <td>{player.shortName}</td>
                  <td className="pos">{player.naturalPosition}</td>
                  <td className="num">{player.currentAbility}</td>
                  <td className="num">{Math.round(player.condition)}</td>
                  <td className="num">{Math.round(player.morale)}</td>
                  <td className="muted small">
                    {player.injury ? player.injury.type
                      : player.suspensionMatches ? `Suspended (${player.suspensionMatches})`
                        : 'Available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function TacticSelect({
  label,
  field,
  options,
}: {
  label: string;
  field: keyof TacticsType;
  options: string[];
}) {
  const { state, refresh } = useGame();
  const club = getClub(state, state.manager.clubId);
  return (
    <Field label={label}>
      <select
        value={String(club.tactics[field])}
        onChange={(event) => {
          updateTactics(state, { [field]: event.target.value } as Partial<TacticsType>);
          refresh();
        }}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  );
}

function SlotEditor({
  slotIndex,
  squad,
  onClose,
}: {
  slotIndex: number;
  squad: Player[];
  onClose: () => void;
}) {
  const { state, refresh } = useGame();
  const club = getClub(state, state.manager.clubId);
  const slot = club.tactics.slots[slotIndex];
  if (!slot) return null;

  const candidates = [...squad]
    .filter((p) => !p.injury && p.suspensionMatches === 0)
    .sort((a, b) => matchEffectiveness(b, slot.position) - matchEffectiveness(a, slot.position));

  return (
    <Panel
      title={`${slot.position} — select a player`}
      actions={<button type="button" className="btn btn--small" onClick={onClose}>Done</button>}
      flush
    >
      <div className="panel__body">
        <Field label="Role">
          <select
            value={slot.role}
            onChange={(event) => { setSlotRole(state, slotIndex, event.target.value); refresh(); }}
          >
            {ROLES_BY_POSITION[slot.position].map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </Field>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Name</th><th className="num">Fit for {slot.position}</th>
            <th className="num">Ab</th><th className="num">Cond</th><th className="num">Effectiveness</th><th />
          </tr>
        </thead>
        <tbody>
          {candidates.slice(0, 24).map((player) => (
            <tr key={player.id} className={player.id === slot.playerId ? 'highlight' : ''}>
              <td>{player.shortName}</td>
              <td className="num"><Attr value={player.positions[slot.position]} /></td>
              <td className="num">{player.currentAbility}</td>
              <td className="num">{Math.round(player.condition)}</td>
              <td className="num">{(matchEffectiveness(player, slot.position) * 100).toFixed(0)}%</td>
              <td className="num">
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => { setPlayerInSlot(state, slotIndex, player.id); refresh(); }}
                >
                  Select
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
