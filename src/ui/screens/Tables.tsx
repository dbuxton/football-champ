/**
 * League tables for all four divisions, plus cup progress and the play-offs.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { tableFor, zoneFor, effectivePoints } from '../../engine/table';
import { cupProgressLabel } from '../../engine/cups';
import { FormGuide, Kit, Panel, Tabs } from '../components';

const LEAGUE_IDS = ['premier-league', 'championship', 'league-one', 'league-two'];

export function TablesScreen() {
  const { state } = useGame();
  const club = getClub(state, state.manager.clubId);
  const [tab, setTab] = useState<string>(club.leagueId);

  const isLeague = LEAGUE_IDS.includes(tab);

  return (
    <>
      <Panel flush>
        <Tabs
          tabs={[
            ...LEAGUE_IDS.map((id) => ({ id, label: state.competitions[id]?.name ?? id })),
            { id: 'cups', label: 'Cups' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {isLeague ? <LeagueTable competitionId={tab} highlightClubId={club.id} /> : <CupProgress />}
      </Panel>

      {isLeague && (
        <div className="row row--wrap small muted" style={{ gap: 16, padding: '0 4px' }}>
          <span><span className="form-badge" style={{ background: 'var(--accent)' }} /> Promotion</span>
          <span><span className="form-badge" style={{ background: 'var(--blue)' }} /> Play-offs</span>
          <span><span className="form-badge" style={{ background: 'var(--red)' }} /> Relegation</span>
        </div>
      )}
    </>
  );
}

function LeagueTable({
  competitionId,
  highlightClubId,
}: {
  competitionId: string;
  highlightClubId: string;
}) {
  const { state } = useGame();
  const table = tableFor(state, competitionId);
  const comp = state.competitions[competitionId];

  return (
    <div className="scroll-x">
      <table className="data">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Club</th>
            <th className="num">P</th>
            <th className="num">W</th>
            <th className="num">D</th>
            <th className="num">L</th>
            <th className="num">F</th>
            <th className="num">A</th>
            <th className="num">GD</th>
            <th className="num">Pts</th>
            <th>Form</th>
            <th className="num" title="Home record">Home</th>
            <th className="num" title="Away record">Away</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, index) => {
            const rowClub = state.clubs[row.clubId];
            const zone = zoneFor(state, competitionId, index);
            return (
              <tr
                key={row.clubId}
                className={[
                  zone !== 'none' ? `zone-${zone}` : '',
                  row.clubId === highlightClubId ? 'highlight' : '',
                ].filter(Boolean).join(' ')}
              >
                <td className="num faint">{index + 1}</td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <Kit club={rowClub} />
                    {rowClub?.name}
                    {row.pointsDeduction > 0 && (
                      <span className="pill pill--bad" title="Points deduction">−{row.pointsDeduction}</span>
                    )}
                  </span>
                </td>
                <td className="num">{row.played}</td>
                <td className="num">{row.won}</td>
                <td className="num">{row.drawn}</td>
                <td className="num">{row.lost}</td>
                <td className="num">{row.goalsFor}</td>
                <td className="num">{row.goalsAgainst}</td>
                <td className="num">
                  {row.goalsFor - row.goalsAgainst > 0 ? '+' : ''}{row.goalsFor - row.goalsAgainst}
                </td>
                <td className="num strong">{effectivePoints(row)}</td>
                <td><FormGuide form={row.form} /></td>
                <td className="num faint small">
                  {row.homeRecord.w}-{row.homeRecord.d}-{row.homeRecord.l}
                </td>
                <td className="num faint small">
                  {row.awayRecord.w}-{row.awayRecord.d}-{row.awayRecord.l}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {comp && (
        <p className="faint small" style={{ padding: '8px 11px', margin: 0 }}>
          {comp.promotionSpots ? `${comp.promotionSpots} automatic promotion places. ` : ''}
          {comp.playoffSpots ? `${comp.playoffSpots} play-off places. ` : ''}
          {comp.relegationSpots ? `${comp.relegationSpots} relegation places.` : ''}
        </p>
      )}
    </div>
  );
}

function CupProgress() {
  const { state } = useGame();
  const club = getClub(state, state.manager.clubId);

  return (
    <div className="panel__body col">
      {Object.values(state.cups).map((cup) => {
        const comp = state.competitions[cup.competitionId];
        const stillIn = cup.remainingClubIds.includes(club.id);
        const winner = cup.winnerClubId ? state.clubs[cup.winnerClubId] : null;
        const fixtures = state.fixtures
          .filter((f) => f.competitionId === cup.competitionId && f.round === cup.currentRound + 1)
          .slice(0, 40);

        return (
          <div key={cup.competitionId} className="panel" style={{ margin: 0 }}>
            <div className="panel__head">
              {comp?.name}
              <span className="spacer" />
              <span className={stillIn ? 'pos' : 'faint'}>
                {winner ? `Won by ${winner.name}`
                  : stillIn ? `You are in the ${cupProgressLabel(cup).toLowerCase()}`
                    : 'Eliminated'}
              </span>
            </div>
            <table className="data">
              <tbody>
                {fixtures.map((fixture) => (
                  <tr
                    key={fixture.id}
                    className={fixture.homeClubId === club.id || fixture.awayClubId === club.id ? 'highlight' : ''}
                  >
                    <td className="mono faint small">{fixture.date.slice(5)}</td>
                    <td className="right">{state.clubs[fixture.homeClubId]?.shortName}</td>
                    <td className="num strong">
                      {fixture.result ? `${fixture.result.homeGoals}-${fixture.result.awayGoals}` : 'v'}
                    </td>
                    <td>{state.clubs[fixture.awayClubId]?.shortName}</td>
                  </tr>
                ))}
                {fixtures.length === 0 && (
                  <tr><td className="muted">No fixtures scheduled in this round.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      {Object.values(state.playoffs).map((playoff) => (
        <div key={playoff.competitionId} className="panel" style={{ margin: 0 }}>
          <div className="panel__head">
            {state.competitions[playoff.competitionId]?.name}
            <span className="spacer" />
            <span className="muted">{playoff.stage}</span>
          </div>
          <table className="data">
            <tbody>
              {state.fixtures
                .filter((f) => f.competitionId === playoff.competitionId)
                .map((fixture) => (
                  <tr key={fixture.id}>
                    <td className="mono faint small">{fixture.date.slice(5)}</td>
                    <td className="faint small">{fixture.roundName}</td>
                    <td className="right">{state.clubs[fixture.homeClubId]?.shortName}</td>
                    <td className="num strong">
                      {fixture.result ? `${fixture.result.homeGoals}-${fixture.result.awayGoals}` : 'v'}
                    </td>
                    <td>{state.clubs[fixture.awayClubId]?.shortName}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
