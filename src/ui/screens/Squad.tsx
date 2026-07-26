/**
 * Squad: the attribute grid, with views for the senior squad, the under-21s and loanees.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, squadOf } from '../../engine/gamestate';
import { ageOf, totalStats } from '../../engine/players';
import { Player } from '../../engine/types';
import { squadMorale } from '../../engine/progression';
import { wageBill } from '../../engine/finance';
import { setTransferStatus } from '../../game/actions';
import { pickTeamAutomatically } from '../../game/actions';
import {
  Attr, DataTable, Panel, Tabs, money, squadColumns, Column, exactMoney,
} from '../components';
import {
  TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS, ATTRIBUTE_LABELS,
} from '../../engine/types';

type View = 'general' | 'technical' | 'mental' | 'physical' | 'goalkeeping' | 'contracts';
type Filter = 'senior' | 'u21' | 'loan' | 'injured';

export function SquadScreen() {
  const { state, refresh, inspectPlayer, showToast } = useGame();
  const [view, setView] = useState<View>('general');
  const [filter, setFilter] = useState<Filter>('senior');
  const club = getClub(state, state.manager.clubId);

  const squad = squadOf(state, club.id);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'u21': return squad.filter((p) => ageOf(p, state.date) <= 21);
      case 'loan': return squad.filter((p) => p.loan);
      case 'injured': return squad.filter((p) => p.injury || p.suspensionMatches > 0);
      default: return squad.filter((p) => !p.loan);
    }
  }, [squad, filter, state.date]);

  const columns = useMemo<Column<Player>[]>(() => {
    const identity: Column<Player>[] = [
      {
        key: 'name', label: 'Name',
        sort: (p) => p.lastName,
        render: (p) => `${p.firstName} ${p.lastName}`.trim(),
      },
      {
        key: 'pos', label: 'Pos',
        sort: (p) => p.naturalPosition,
        render: (p) => <span className="pos strong">{p.naturalPosition}</span>,
      },
      {
        key: 'age', label: 'Age', numeric: true,
        sort: (p) => ageOf(p, state.date),
        render: (p) => ageOf(p, state.date),
      },
    ];

    const attributeColumns = (keys: readonly string[]): Column<Player>[] =>
      keys.map((key) => ({
        key,
        label: ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS].split(' ')
          .map((word) => word.slice(0, 3)).join(' '),
        numeric: true,
        title: ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS],
        sort: (p: Player) => p.attributes[key as keyof Player['attributes']],
        render: (p: Player) => <Attr value={p.attributes[key as keyof Player['attributes']]} />,
      }));

    switch (view) {
      case 'technical': return [...identity, ...attributeColumns(TECHNICAL_KEYS)];
      case 'mental': return [...identity, ...attributeColumns(MENTAL_KEYS)];
      case 'physical': return [...identity, ...attributeColumns(PHYSICAL_KEYS)];
      case 'goalkeeping': return [...identity, ...attributeColumns(GOALKEEPING_KEYS)];
      case 'contracts':
        return [
          ...identity,
          {
            key: 'status', label: 'Status',
            sort: (p) => p.contract?.squadStatus ?? '',
            render: (p) => p.contract?.squadStatus ?? <span className="faint">No contract</span>,
          },
          {
            key: 'wage', label: 'Wage', numeric: true,
            sort: (p) => p.contract?.wage ?? 0,
            render: (p) => (p.contract ? `${exactMoney(p.contract.wage)}/w` : '—'),
          },
          {
            key: 'expires', label: 'Expires',
            sort: (p) => p.contract?.expires ?? '',
            render: (p) => {
              if (!p.contract) return <span className="faint">—</span>;
              const months = (new Date(p.contract.expires).getTime() - new Date(state.date).getTime()) /
                (86_400_000 * 30.44);
              return (
                <span className={months < 6 ? 'neg strong' : months < 12 ? 'warn' : ''}>
                  {p.contract.expires}
                </span>
              );
            },
          },
          {
            key: 'clause', label: 'Release', numeric: true,
            sort: (p) => p.contract?.releaseClause ?? 0,
            render: (p) => (p.contract?.releaseClause ? money(p.contract.releaseClause) : <span className="faint">—</span>),
          },
          {
            key: 'value', label: 'Value', numeric: true,
            sort: (p) => p.value,
            render: (p) => money(p.value),
          },
          {
            key: 'listed', label: 'Listed',
            render: (p) => (
              <span className="row" style={{ gap: 4 }}>
                <button
                  type="button"
                  className={`btn btn--small${p.transferListed ? ' btn--danger' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTransferStatus(state, p.id, { transferListed: !p.transferListed });
                    refresh();
                    showToast(p.transferListed
                      ? `${p.shortName} removed from the transfer list.`
                      : `${p.shortName} has been transfer listed.`);
                  }}
                >
                  {p.transferListed ? 'Listed' : 'List'}
                </button>
                <button
                  type="button"
                  className={`btn btn--small${p.loanListed ? ' btn--danger' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTransferStatus(state, p.id, { loanListed: !p.loanListed });
                    refresh();
                  }}
                >
                  Loan
                </button>
              </span>
            ),
          },
        ];
      default:
        return squadColumns(state, { showValue: true, showWage: true });
    }
  }, [view, state, refresh, showToast]);

  const bill = wageBill(state, club.id);

  return (
    <>
      <Panel
        title={`${club.name} squad`}
        actions={
          <div className="row">
            <span className="muted small">
              Wage bill {exactMoney(bill)}/w of {exactMoney(club.finances.wageBudget)}
              {bill > club.finances.wageBudget && <span className="neg strong"> — over budget</span>}
            </span>
            <span className="muted small">Morale {squadMorale(state, club.id)}</span>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => { pickTeamAutomatically(state); refresh(); showToast('Strongest available side selected.'); }}
            >
              Pick strongest side
            </button>
          </div>
        }
        flush
      >
        <Tabs
          tabs={[
            { id: 'senior', label: `Senior (${squad.filter((p) => !p.loan).length})` },
            { id: 'u21', label: `Under 21 (${squad.filter((p) => ageOf(p, state.date) <= 21).length})` },
            { id: 'loan', label: `Out on loan (${squad.filter((p) => p.loan).length})` },
            { id: 'injured', label: `Unavailable (${squad.filter((p) => p.injury || p.suspensionMatches > 0).length})` },
          ]}
          active={filter}
          onChange={setFilter}
        />
        <Tabs
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'technical', label: 'Technical' },
            { id: 'mental', label: 'Mental' },
            { id: 'physical', label: 'Physical' },
            { id: 'goalkeeping', label: 'Goalkeeping' },
            { id: 'contracts', label: 'Contracts' },
          ]}
          active={view}
          onChange={setView}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.id}
          onRowClick={(p) => inspectPlayer(p.id)}
          defaultSort={{ key: view === 'general' ? 'ca' : 'name', desc: view === 'general' }}
          maxHeight={560}
          emptyMessage="No players in this view."
        />
      </Panel>

      {filter === 'injured' && filtered.length > 0 && (
        <Panel title="Treatment room">
          <table className="data">
            <thead>
              <tr><th>Player</th><th>Problem</th><th className="num">Days left</th><th>Expected back</th></tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr key={player.id}>
                  <td>{player.shortName}</td>
                  <td>{player.injury?.type ?? `Suspended (${player.suspensionMatches} match)`}</td>
                  <td className="num">{player.injury?.daysRemaining ?? '—'}</td>
                  <td className="muted">
                    {player.injury
                      ? new Date(new Date(state.date).getTime() + player.injury.daysRemaining * 86_400_000)
                        .toISOString().slice(0, 10)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Top performers this season">
        <DataTable
          columns={[
            { key: 'name', label: 'Player', sort: (p: Player) => p.lastName, render: (p: Player) => p.shortName },
            { key: 'pos', label: 'Pos', render: (p: Player) => p.naturalPosition },
            {
              key: 'apps', label: 'Apps', numeric: true,
              sort: (p: Player) => totalStats(p).appearances,
              render: (p: Player) => totalStats(p).appearances + totalStats(p).substituteAppearances,
            },
            {
              key: 'goals', label: 'Goals', numeric: true,
              sort: (p: Player) => totalStats(p).goals,
              render: (p: Player) => totalStats(p).goals,
            },
            {
              key: 'assists', label: 'Assists', numeric: true,
              sort: (p: Player) => totalStats(p).assists,
              render: (p: Player) => totalStats(p).assists,
            },
            {
              key: 'rating', label: 'Average rating', numeric: true,
              sort: (p: Player) => {
                const s = totalStats(p);
                const apps = s.appearances + s.substituteAppearances;
                return apps ? s.ratingSum / apps : 0;
              },
              render: (p: Player) => {
                const s = totalStats(p);
                const apps = s.appearances + s.substituteAppearances;
                return apps ? (s.ratingSum / apps).toFixed(2) : '—';
              },
            },
          ]}
          rows={squad.filter((p) => totalStats(p).appearances > 0)}
          rowKey={(p) => p.id}
          onRowClick={(p) => inspectPlayer(p.id)}
          defaultSort={{ key: 'rating', desc: true }}
          emptyMessage="No games played yet this season."
          maxHeight={300}
        />
      </Panel>
    </>
  );
}
