/**
 * Training: the squad-wide schedule, intensity, and per-player focus.
 */

import { useGame } from '../GameContext';
import { getClub, squadOf, staffOf, IndividualFocus, TrainingState } from '../../engine/gamestate';
import { ageOf } from '../../engine/players';
import { setIndividualFocus, setTrainingIntensity, setTrainingSchedule } from '../../game/actions';
import { Attr, Bar, Field, OptionGroup, Panel } from '../components';

const SCHEDULES: { value: TrainingState['schedule']; label: string; hint: string }[] = [
  { value: 'Balanced', label: 'Balanced', hint: 'No emphasis. Steady all-round development.' },
  { value: 'Fitness', label: 'Fitness', hint: 'Stamina and strength. Good for pre-season.' },
  { value: 'Attacking', label: 'Attacking', hint: 'Finishing, movement and creativity.' },
  { value: 'Defending', label: 'Defending', hint: 'Tackling, marking and concentration.' },
  { value: 'Tactical', label: 'Tactical', hint: 'Decisions, teamwork and positioning.' },
  { value: 'Technical', label: 'Technical', hint: 'Passing, technique and dribbling.' },
  { value: 'Light', label: 'Light', hint: 'Recovery. Use it in a congested fixture list.' },
];

const FOCUS_OPTIONS: IndividualFocus[] = [
  'None', 'Finishing', 'Passing', 'Tackling', 'Fitness', 'Strength', 'Pace', 'Technique',
  'Heading', 'Positioning', 'Goalkeeping',
];

export function TrainingScreen() {
  const { state, refresh, inspectPlayer } = useGame();
  const club = getClub(state, state.manager.clubId);
  const squad = squadOf(state, club.id).filter((p) => !p.loan);
  const staff = staffOf(state, club.id);

  const coaches = staff.filter((s) =>
    s.role === 'Coach' || s.role === 'Assistant Manager' || s.role === 'Fitness Coach' ||
    s.role === 'Goalkeeping Coach');

  const best = (key: keyof (typeof coaches)[number]['attributes']) =>
    coaches.length ? Math.max(...coaches.map((c) => c.attributes[key])) : 0;

  return (
    <>
      <div className="grid grid--2">
        <Panel title="Squad training">
          <Field label="Schedule">
            <OptionGroup
              options={SCHEDULES}
              value={state.training.schedule}
              onChange={(value) => { setTrainingSchedule(state, value); refresh(); }}
            />
          </Field>
          <div style={{ marginTop: 12 }}>
            <Field label={`Intensity — ${['', 'Very light', 'Light', 'Normal', 'High', 'Very high'][state.training.intensity]}`}>
              <input
                type="range" min={1} max={5} value={state.training.intensity}
                onChange={(event) => { setTrainingIntensity(state, Number(event.target.value)); refresh(); }}
              />
            </Field>
          </div>
          <p className="faint small">
            Higher intensity develops players faster but drains condition and raises the risk of
            training-ground injuries. Drop it during a run of midweek fixtures.
          </p>
        </Panel>

        <Panel title="Coaching quality">
          <table className="data">
            <tbody>
              <tr><td>Training ground</td><td className="num"><Attr value={club.facilities.trainingGround} /></td></tr>
              <tr><td>Youth academy</td><td className="num"><Attr value={club.facilities.youthAcademy} /></td></tr>
              <tr><td>Medical facilities</td><td className="num"><Attr value={club.facilities.medical} /></td></tr>
              <tr><td>Best attacking coach</td><td className="num"><Attr value={best('attacking')} /></td></tr>
              <tr><td>Best defending coach</td><td className="num"><Attr value={best('defending')} /></td></tr>
              <tr><td>Best technical coach</td><td className="num"><Attr value={best('technical')} /></td></tr>
              <tr><td>Best tactical coach</td><td className="num"><Attr value={best('tactical')} /></td></tr>
              <tr><td>Best fitness coach</td><td className="num"><Attr value={best('fitness')} /></td></tr>
              <tr><td>Best goalkeeping coach</td><td className="num"><Attr value={best('goalkeeping')} /></td></tr>
            </tbody>
          </table>
          <p className="faint small" style={{ marginBottom: 0 }}>
            Better coaches and facilities raise the ceiling on how much your players improve. Both
            can be upgraded through the board.
          </p>
        </Panel>
      </div>

      <Panel title="Individual focus" flush>
        <table className="data">
          <thead>
            <tr>
              <th>Player</th><th>Pos</th><th className="num">Age</th>
              <th className="num">Ability</th><th className="num">Potential</th>
              <th className="num">Condition</th><th>Focus</th>
            </tr>
          </thead>
          <tbody>
            {squad
              .slice()
              .sort((a, b) => b.potentialAbility - b.currentAbility - (a.potentialAbility - a.currentAbility))
              .map((player) => {
                const headroom = player.potentialAbility - player.currentAbility;
                return (
                  <tr key={player.id}>
                    <td className="clickable" onClick={() => inspectPlayer(player.id)}>{player.shortName}</td>
                    <td className="pos">{player.naturalPosition}</td>
                    <td className="num">{ageOf(player, state.date)}</td>
                    <td className="num">{player.currentAbility}</td>
                    <td className="num">
                      <span className={headroom > 25 ? 'pos strong' : headroom > 8 ? '' : 'faint'}>
                        {player.potentialAbility}
                      </span>
                      {headroom > 0 && <span className="faint small"> (+{headroom})</span>}
                    </td>
                    <td className="num"><Bar value={player.condition} /></td>
                    <td>
                      <select
                        value={state.training.individual[player.id] ?? 'None'}
                        onChange={(event) => {
                          setIndividualFocus(state, player.id, event.target.value as IndividualFocus);
                          refresh();
                        }}
                      >
                        {FOCUS_OPTIONS.map((focus) => <option key={focus} value={focus}>{focus}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
