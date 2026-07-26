/**
 * Scouting: assignments and the reports they produce.
 */

import { useGame } from '../GameContext';
import { getClub, staffOf } from '../../engine/gamestate';
import { assignScoutTo, recallScout } from '../../game/actions';
import { ageOf } from '../../engine/players';
import { NAME_POOLS } from '../../data/names';
import { Attr, Kit, Panel, stars } from '../components';

export function ScoutingScreen() {
  const { state, refresh, inspectPlayer, showToast } = useGame();
  const club = getClub(state, state.manager.clubId);
  const scouts = staffOf(state, club.id).filter((s) => s.role === 'Scout');
  const nations = Object.keys(NAME_POOLS);
  const leagues = Object.values(state.competitions).filter((c) => c.kind === 'league');

  return (
    <>
      <Panel title="Scouting network" flush>
        <table className="data">
          <thead>
            <tr>
              <th>Scout</th><th className="num">Judging ability</th><th className="num">Judging potential</th>
              <th>Assignment</th><th className="num">Days</th><th />
            </tr>
          </thead>
          <tbody>
            {scouts.map((scout) => (
              <tr key={scout.id}>
                <td>{scout.firstName} {scout.lastName}</td>
                <td className="num"><Attr value={scout.attributes.judgingAbility} /></td>
                <td className="num"><Attr value={scout.attributes.judgingPotential} /></td>
                <td>
                  <select
                    value={scout.assignment ? `${scout.assignment.kind}:${scout.assignment.target}` : ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) recallScout(state, scout.id);
                      else {
                        const [kind, target] = value.split(':');
                        assignScoutTo(state, scout.id, kind as 'region' | 'competition', target);
                      }
                      refresh();
                    }}
                  >
                    <option value="">— unassigned —</option>
                    <optgroup label="Divisions">
                      {leagues.map((league) => (
                        <option key={league.id} value={`competition:${league.id}`}>{league.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Regions">
                      {nations.map((nation) => (
                        <option key={nation} value={`region:${nation}`}>{nation}</option>
                      ))}
                    </optgroup>
                  </select>
                </td>
                <td className="num">{scout.assignment?.daysElapsed ?? '—'}</td>
                <td className="num">
                  {scout.assignment && (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => { recallScout(state, scout.id); refresh(); showToast(`${scout.shortName} recalled.`); }}
                    >
                      Recall
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {scouts.length === 0 && (
              <tr><td colSpan={6} className="muted">You have no scouts. Hire some from the Staff screen.</td></tr>
            )}
          </tbody>
        </table>
        <p className="faint small" style={{ padding: '8px 11px', margin: 0 }}>
          A scout's report is only as good as their judgement. A poor scout doesn't just give you a
          vaguer estimate — they give you a wrong one. Leaving a scout on an assignment for longer
          narrows the range.
        </p>
      </Panel>

      <Panel title="Scout reports" flush>
        <table className="data">
          <thead>
            <tr>
              <th>Player</th><th>Club</th><th>Pos</th><th className="num">Age</th>
              <th className="num">Ability</th><th className="num">Potential</th>
              <th className="num">Confidence</th><th>Verdict</th><th className="num">Filed</th>
            </tr>
          </thead>
          <tbody>
            {[...state.scoutReports]
              .sort((a, b) => b.potentialStars - a.potentialStars)
              .slice(0, 100)
              .map((report) => {
                const player = state.players[report.playerId];
                if (!player) return null;
                const playerClub = player.clubId ? state.clubs[player.clubId] : null;
                return (
                  <tr key={report.playerId} className="clickable" onClick={() => inspectPlayer(player.id)}>
                    <td>{player.firstName} {player.lastName}</td>
                    <td>
                      {playerClub
                        ? <span className="row" style={{ gap: 5 }}><Kit club={playerClub} />{playerClub.shortName}</span>
                        : <span className="faint">Free agent</span>}
                    </td>
                    <td className="pos">{player.naturalPosition}</td>
                    <td className="num">{ageOf(player, state.date)}</td>
                    <td className="num warn">{stars(report.stars)}</td>
                    <td className="num warn">{stars(report.potentialStars)}</td>
                    <td className="num">{Math.round(report.accuracy * 100)}%</td>
                    <td className="muted small" style={{ whiteSpace: 'normal', maxWidth: 380 }}>
                      {report.verdict}
                    </td>
                    <td className="num faint mono small">{report.date}</td>
                  </tr>
                );
              })}
            {state.scoutReports.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No reports yet. Assign a scout to a division or a region and they will start
                  finding players.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
