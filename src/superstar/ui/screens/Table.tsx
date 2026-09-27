import { CLUBS, getClub } from '../../data/clubs';
import { currentTable, type Career } from '../../engine/career';
import { CUP_AFTER, CUPS } from '../../engine/cup';
import { ROUNDS, type ScorerRow, type TableRow } from '../../engine/season';
import { TopBar } from '../components/Bits';

/** The Premier League table and the Golden Boot race, as they stand. */
export function Table({ career }: { career: Career }) {
  const { table, scorers } = currentTable(career);
  const played = Math.max(0, ...table.map((row) => row.played));
  return (
    <div className="ss-app ss-club-bg">
      <TopBar career={career} />
      <main className="ss-screen">
        <h1 className="ss-headline">Premier League</h1>
        <p className="ss-hello-sub" style={{ textAlign: 'center' }}>
          Season {career.season} · {played} of {ROUNDS} matches played
        </p>
        <div className="ss-table-layout">
          <LeagueTable table={table} highlight={career.clubId} />
          <div className="ss-hub-col">
            <GoldenBoot scorers={scorers} />
            <section className="ss-card">
              <h2>🏆 Cups</h2>
              <p style={{ margin: 0 }}>
                After {CUP_AFTER[0]} matches, the <b>top half</b> (the green line) go into the{' '}
                <b style={{ color: CUPS['fa-cup'].colour }}>FA Cup</b> and the <b>bottom half</b> into the{' '}
                <b style={{ color: CUPS['efl-cup'].colour }}>EFL Cup</b>.
              </p>
              {career.cup && (
                <p style={{ marginBottom: 0 }}>
                  This season you're in the <b style={{ color: CUPS[career.cup.cup].colour }}>{CUPS[career.cup.cup].name}</b>.
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export function LeagueTable({ table, highlight }: { table: TableRow[]; highlight: string }) {
  return (
    <section className="ss-card ss-table-card" aria-label="League table">
      <table className="ss-table">
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: 'left' }}>Club</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, i) => {
            const club = getClub(row.clubId);
            const gd = row.goalsFor - row.goalsAgainst;
            return (
              <tr
                key={row.clubId}
                className={`${row.clubId === highlight ? 'ss-row-you' : ''} ${i === CLUBS.length / 2 - 1 ? 'ss-row-half' : ''}`}
                data-club={row.clubId}
              >
                <td>{i + 1}</td>
                <td style={{ textAlign: 'left' }}>
                  <span className="ss-dot" style={{ background: club.colour, borderColor: club.colour2 }} /> {club.shortName}
                  {row.clubId === highlight && ' ⭐'}
                </td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{gd > 0 ? `+${gd}` : gd}</td>
                <td>
                  <b>{row.points}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function GoldenBoot({ scorers }: { scorers: ScorerRow[] }) {
  return (
    <section className="ss-card" aria-label="Top scorers">
      <h2>👢 Golden Boot race</h2>
      {scorers.length === 0 ? (
        <p className="ss-small">No goals yet!</p>
      ) : (
        <ol className="ss-scorers">
          {scorers.map((row) => {
            const club = getClub(row.clubId);
            return (
              <li key={`${row.name}-${row.clubId}`} className={row.kid ? 'ss-row-you' : ''}>
                <span className="ss-dot" style={{ background: club.colour }} />
                <span className="ss-scorer-name">
                  {row.kid ? '⭐ ' : ''}
                  {row.name}
                </span>
                <b>{row.goals}</b>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
