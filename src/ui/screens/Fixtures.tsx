/**
 * Fixtures and results — yours, and the wider division.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, clubFixtures } from '../../engine/gamestate';
import { formatDate } from '../../engine/date';
import { Fixture } from '../../engine/types';
import { ResultModal } from '../ResultDetails';
import { Kit, Panel, Tabs } from '../components';

export function FixturesScreen() {
  const { state } = useGame();
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
        <ResultModal fixture={openResult} onClose={() => setOpenResult(null)} />
      )}
    </>
  );
}
