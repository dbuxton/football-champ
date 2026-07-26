/**
 * Fixtures and results — yours, and the wider division.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, clubFixtures } from '../../engine/gamestate';
import { formatDate } from '../../engine/date';
import { Fixture } from '../../engine/types';
import { Kit, Modal, Panel, Tabs } from '../components';

export function FixturesScreen() {
  const { state, setScreen } = useGame();
  const club = getClub(state, state.manager.clubId);
  const [tab, setTab] = useState<'club' | 'division'>('club');
  const [openResult, setOpenResult] = useState<Fixture | null>(null);

  const ours = clubFixtures(state, club.id);
  const league = state.competitions[club.leagueId];

  const divisionFixtures = state.fixtures
    .filter((f) => f.competitionId === club.leagueId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = divisionFixtures.filter((f) => !f.played).slice(0, 40);
  const recent = divisionFixtures.filter((f) => f.played).slice(-40).reverse();

  return (
    <>
      <Panel title="Fixtures and results" flush>
        <Tabs
          tabs={[
            { id: 'club', label: club.shortName },
            { id: 'division', label: league?.name ?? 'Division' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'club' ? (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th><th>Competition</th><th>Venue</th><th>Opponent</th>
                <th className="num">Result</th><th className="num">Att.</th><th>Scorers</th>
              </tr>
            </thead>
            <tbody>
              {ours.map((fixture) => {
                const isHome = fixture.homeClubId === club.id;
                const opponent = state.clubs[isHome ? fixture.awayClubId : fixture.homeClubId];
                const result = fixture.result;
                const us = result ? (isHome ? result.homeGoals : result.awayGoals) : null;
                const them = result ? (isHome ? result.awayGoals : result.homeGoals) : null;
                const outcome = us === null ? '' : us > them! ? 'pos' : us === them ? '' : 'neg';
                const scorers = result?.events
                  .filter((e) => (e.type === 'goal' || e.type === 'penalty-goal') &&
                    e.side === (isHome ? 'home' : 'away'))
                  .map((e) => state.players[e.playerId ?? '']?.shortName)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <tr
                    key={fixture.id}
                    className={fixture.played ? 'clickable' : fixture.date === state.date ? 'highlight' : ''}
                    onClick={fixture.played ? () => setOpenResult(fixture) : undefined}
                  >
                    <td className="mono">{formatDate(fixture.date)}</td>
                    <td className="muted small">
                      {state.competitions[fixture.competitionId]?.shortName}
                      {fixture.roundName ? ` · ${fixture.roundName}` : ''}
                    </td>
                    <td className="faint">{fixture.neutralVenue ? 'N' : isHome ? 'H' : 'A'}</td>
                    <td><Kit club={opponent} /> {opponent?.name}</td>
                    <td className={`num strong ${outcome}`}>
                      {result ? `${us}-${them}` : fixture.date === state.date ? 'Today' : '—'}
                      {result?.penalties ? ` (p ${result.penalties.home}-${result.penalties.away})` : ''}
                    </td>
                    <td className="num muted">{fixture.attendance?.toLocaleString() ?? ''}</td>
                    <td className="muted small">{scorers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="grid grid--2" style={{ padding: 11 }}>
            <div>
              <div className="panel__head">Recent results</div>
              <table className="data">
                <tbody>
                  {recent.map((fixture) => (
                    <tr key={fixture.id} className="clickable" onClick={() => setOpenResult(fixture)}>
                      <td className="mono faint small">{fixture.date.slice(5)}</td>
                      <td className="right">{state.clubs[fixture.homeClubId]?.shortName}</td>
                      <td className="num strong">
                        {fixture.result?.homeGoals}-{fixture.result?.awayGoals}
                      </td>
                      <td>{state.clubs[fixture.awayClubId]?.shortName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="panel__head">Coming up</div>
              <table className="data">
                <tbody>
                  {upcoming.map((fixture) => (
                    <tr key={fixture.id}>
                      <td className="mono faint small">{fixture.date.slice(5)}</td>
                      <td className="right">{state.clubs[fixture.homeClubId]?.shortName}</td>
                      <td className="faint">v</td>
                      <td>{state.clubs[fixture.awayClubId]?.shortName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {openResult?.result && (
        <ResultModal fixture={openResult} onClose={() => setOpenResult(null)} onScreen={setScreen} />
      )}
    </>
  );
}

function ResultModal({
  fixture,
  onClose,
}: {
  fixture: Fixture;
  onClose: () => void;
  onScreen: (screen: 'squad') => void;
}) {
  const { state, inspectPlayer } = useGame();
  const result = fixture.result!;
  const home = state.clubs[fixture.homeClubId];
  const away = state.clubs[fixture.awayClubId];

  return (
    <Modal
      title={`${home?.name} ${result.homeGoals} - ${result.awayGoals} ${away?.name}`}
      onClose={onClose}
    >
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
                .filter((e) => ['goal', 'penalty-goal', 'own-goal', 'yellow', 'red', 'second-yellow', 'substitution', 'injury'].includes(e.type))
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
    </Modal>
  );
}
