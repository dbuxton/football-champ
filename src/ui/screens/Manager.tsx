/**
 * Manager profile: the career record you're building.
 */

import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { yearsBetween } from '../../engine/date';
import { Bar, Panel } from '../components';
import { jobSecurityLabel } from '../../engine/board';

export function ManagerScreen() {
  const { state } = useGame();
  const manager = state.manager;
  const club = getClub(state, manager.clubId);
  const current = manager.career[manager.career.length - 1];

  const winRate = manager.totals.played
    ? (manager.totals.won / manager.totals.played) * 100
    : 0;

  return (
    <>
      <div className="grid grid--2">
        <Panel title={`${manager.firstName} ${manager.lastName}`}>
          <table className="data">
            <tbody>
              <tr><td>Nationality</td><td className="num">{manager.nationality}</td></tr>
              <tr><td>Age</td><td className="num">{yearsBetween(manager.birthDate, state.date)}</td></tr>
              <tr><td>Background</td><td className="num">{manager.background}</td></tr>
              <tr><td>Current club</td><td className="num">{club.name}</td></tr>
              <tr><td>Difficulty</td><td className="num">{state.difficulty}</td></tr>
              <tr>
                <td>Reputation</td>
                <td className="num"><Bar value={manager.reputation} /></td>
              </tr>
              <tr><td>Job security</td><td className="num">{jobSecurityLabel(club.board.confidence)}</td></tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Career record">
          <table className="data">
            <tbody>
              <tr><td>Games managed</td><td className="num strong">{manager.totals.played}</td></tr>
              <tr><td>Won</td><td className="num pos">{manager.totals.won}</td></tr>
              <tr><td>Drawn</td><td className="num">{manager.totals.drawn}</td></tr>
              <tr><td>Lost</td><td className="num neg">{manager.totals.lost}</td></tr>
              <tr><td>Win rate</td><td className="num strong">{winRate.toFixed(1)}%</td></tr>
              <tr><td>Honours</td><td className="num">{manager.honours.length}</td></tr>
              {current && (
                <tr>
                  <td>At this club</td>
                  <td className="num">
                    {current.played} games, {current.won}W {current.drawn}D {current.lost}L
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Honours" flush>
        {manager.honours.length === 0 ? (
          <p className="muted" style={{ padding: 11, margin: 0 }}>
            Nothing in the cabinet yet.
          </p>
        ) : (
          <table className="data">
            <tbody>
              {[...manager.honours].reverse().map((honour, index) => (
                <tr key={index}>
                  <td className="warn">🏆 {honour.competitionName}</td>
                  <td>{honour.clubName}</td>
                  <td className="num mono">{honour.season}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Clubs managed" flush>
        <table className="data">
          <thead>
            <tr>
              <th>Club</th><th>From</th><th>To</th>
              <th className="num">P</th><th className="num">W</th><th className="num">D</th><th className="num">L</th>
              <th>Honours</th>
            </tr>
          </thead>
          <tbody>
            {[...manager.career].reverse().map((entry, index) => (
              <tr key={index}>
                <td>{entry.clubName}</td>
                <td className="mono faint">{entry.from}</td>
                <td className="mono faint">{entry.to ?? 'present'}</td>
                <td className="num">{entry.played}</td>
                <td className="num">{entry.won}</td>
                <td className="num">{entry.drawn}</td>
                <td className="num">{entry.lost}</td>
                <td className="muted small">{entry.honours.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
