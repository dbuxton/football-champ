/**
 * Club history and honours.
 */

import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { Kit, Panel } from '../components';

export function ClubScreen() {
  const { state } = useGame();
  const club = getClub(state, state.manager.clubId);

  return (
    <>
      <div className="grid grid--2">
        <Panel title={club.name}>
          <table className="data">
            <tbody>
              <tr><td>Nickname</td><td className="num">{club.nickname}</td></tr>
              <tr><td>Founded</td><td className="num">{club.founded}</td></tr>
              <tr><td>City</td><td className="num">{club.city}</td></tr>
              <tr><td>Stadium</td><td className="num">{club.stadiumName} ({club.stadiumCapacity.toLocaleString()})</td></tr>
              <tr><td>Division</td><td className="num">{state.competitions[club.leagueId]?.name}</td></tr>
              <tr><td>Reputation</td><td className="num">{Math.round(club.reputation)}/100</td></tr>
              <tr><td>Fanbase</td><td className="num">{club.fanbase.toLocaleString()}</td></tr>
              <tr>
                <td>Rivals</td>
                <td className="num">
                  {club.rivalIds.map((id) => state.clubs[id]?.shortName).filter(Boolean).join(', ') || '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Honours" flush>
          {club.honours.length === 0 ? (
            <p className="muted" style={{ padding: 11, margin: 0 }}>
              No honours won during your tenure. That is what you are here to change.
            </p>
          ) : (
            <table className="data">
              <tbody>
                {[...club.honours].reverse().map((honour, index) => (
                  <tr key={index}>
                    <td className="warn">🏆 {honour.competitionName}</td>
                    <td className="num mono">{honour.season}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Season by season" flush>
        {club.history.length === 0 ? (
          <p className="muted" style={{ padding: 11, margin: 0 }}>No completed seasons yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Season</th><th>Division</th><th className="num">Pos</th>
                <th className="num">P</th><th className="num">W</th><th className="num">D</th><th className="num">L</th>
                <th className="num">F</th><th className="num">A</th><th className="num">Pts</th>
                <th className="num">Avg att.</th><th>Manager</th>
              </tr>
            </thead>
            <tbody>
              {[...club.history].reverse().map((entry, index) => (
                <tr key={index}>
                  <td className="mono">{entry.season}</td>
                  <td>{entry.competitionName}</td>
                  <td className="num strong">{entry.position}</td>
                  <td className="num">{entry.played}</td>
                  <td className="num">{entry.won}</td>
                  <td className="num">{entry.drawn}</td>
                  <td className="num">{entry.lost}</td>
                  <td className="num">{entry.goalsFor}</td>
                  <td className="num">{entry.goalsAgainst}</td>
                  <td className="num strong">{entry.points}</td>
                  <td className="num muted">{entry.averageAttendance.toLocaleString()}</td>
                  <td className="muted small">{entry.managerName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {state.history.length > 0 && (
        <Panel title="The wider game" flush>
          <table className="data">
            <thead>
              <tr>
                <th>Season</th>
                {['premier-league', 'championship', 'league-one', 'league-two'].map((id) => (
                  <th key={id}>{state.competitions[id]?.shortName}</th>
                ))}
                <th>FA Cup</th><th>EFL Cup</th>
              </tr>
            </thead>
            <tbody>
              {[...state.history].reverse().map((season) => (
                <tr key={season.season}>
                  <td className="mono">{season.season}</td>
                  {['premier-league', 'championship', 'league-one', 'league-two'].map((id) => {
                    const winner = state.clubs[season.finalTables[id]?.[0] ?? ''];
                    return (
                      <td key={id}>
                        {winner ? (
                          <span className="row" style={{ gap: 5 }}><Kit club={winner} />{winner.shortName}</span>
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td>{state.clubs[season.cupWinners['fa-cup'] ?? '']?.shortName ?? '—'}</td>
                  <td>{state.clubs[season.cupWinners['efl-cup'] ?? '']?.shortName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
