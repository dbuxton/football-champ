/**
 * The full match report — key events, statistics, ratings and commentary. Shared by the
 * fixtures screen, the post-match review and the advance digest, so a result always looks the
 * same wherever it's opened from.
 */

import { useGame } from './GameContext';
import { formatDate } from '../engine/date';
import { Fixture } from '../engine/types';
import { Modal, Panel } from './components';

export function ResultDetails({ fixture }: { fixture: Fixture }) {
  const { state, inspectPlayer } = useGame();
  const result = fixture.result;
  if (!result) return null;
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        {state.competitions[fixture.competitionId]?.name}
        {fixture.roundName ? ` · ${fixture.roundName}` : ''} · {formatDate(fixture.date)}
        {fixture.attendance ? ` · attendance ${fixture.attendance.toLocaleString()}` : ''}
        {fixture.weather ? ` · ${fixture.weather}` : ''}
      </p>

      <div className="grid grid--2">
        <Panel title="Key events" flush>
          <table className="data">
            <tbody>
              {result.events
                .filter((e) => ['goal', 'penalty-goal', 'penalty-miss', 'own-goal', 'yellow', 'red', 'second-yellow', 'substitution', 'injury'].includes(e.type))
                .map((event, index) => (
                  <tr key={index}>
                    <td className="mono faint">{event.minute}'</td>
                    <td className="faint small">{event.side === 'home' ? home?.shortName : event.side === 'away' ? away?.shortName : ''}</td>
                    <td>{event.text}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Statistics" flush>
          <table className="data">
            <thead>
              <tr><th className="num">{home?.shortName}</th><th /><th className="num">{away?.shortName}</th></tr>
            </thead>
            <tbody>
              {([
                ['Possession', `${result.stats.home.possession}%`, `${result.stats.away.possession}%`],
                ['Shots', result.stats.home.shots, result.stats.away.shots],
                ['On target', result.stats.home.shotsOnTarget, result.stats.away.shotsOnTarget],
                ['Expected goals', result.stats.home.xg.toFixed(2), result.stats.away.xg.toFixed(2)],
                ['Corners', result.stats.home.corners, result.stats.away.corners],
                ['Fouls', result.stats.home.fouls, result.stats.away.fouls],
                ['Offsides', result.stats.home.offsides, result.stats.away.offsides],
                ['Yellow cards', result.stats.home.yellowCards, result.stats.away.yellowCards],
                ['Red cards', result.stats.home.redCards, result.stats.away.redCards],
                ['Saves', result.stats.home.saves, result.stats.away.saves],
              ] as const).map(([label, h, a]) => (
                <tr key={label}>
                  <td className="num strong">{h}</td>
                  <td className="center muted small">{label}</td>
                  <td className="num strong">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {Object.keys(result.ratings).length > 0 && (
        <Panel title="Player ratings" flush>
          <table className="data">
            <tbody>
              {Object.entries(result.ratings)
                .sort(([, a], [, b]) => b - a)
                .map(([playerId, rating]) => {
                  const player = state.players[playerId];
                  if (!player) return null;
                  return (
                    <tr key={playerId} className="clickable" onClick={() => inspectPlayer(playerId)}>
                      <td>{player.shortName}</td>
                      <td className="faint small">{state.clubs[player.clubId ?? '']?.shortName}</td>
                      <td className="num mono">
                        <span className={rating >= 8 ? 'pos strong' : rating < 5.5 ? 'neg' : ''}>
                          {rating.toFixed(1)}
                        </span>
                        {result.motmPlayerId === playerId && <span className="warn"> ★</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Panel>
      )}

      {result.commentary.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: 'pointer', padding: '6px 0' }}>
            Full commentary
          </summary>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {result.commentary.map((line, index) => (
              <div key={index} className={`commentary__line${line.important ? ' commentary__line--important' : ''}`}>
                <span className="commentary__minute">{line.minute}'</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

/** The report in a modal, for anywhere a result is opened from a list. */
export function ResultModal({ fixture, onClose }: { fixture: Fixture; onClose: () => void }) {
  const { state } = useGame();
  const result = fixture.result;
  if (!result) return null;
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];
  return (
    <Modal
      title={`${home?.name} ${result.homeGoals} - ${result.awayGoals} ${away?.name}`}
      onClose={onClose}
    >
      <ResultDetails fixture={fixture} />
    </Modal>
  );
}
