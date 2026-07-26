/**
 * Statistics: the league's leading scorers, creators and performers.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { Player } from '../../engine/types';
import { totalStats } from '../../engine/players';
import { DataTable, Kit, Panel, Tabs } from '../components';

const LEAGUE_IDS = ['premier-league', 'championship', 'league-one', 'league-two'];

export function StatsScreen() {
  const { state, inspectPlayer } = useGame();
  const club = getClub(state, state.manager.clubId);
  const [tab, setTab] = useState(club.leagueId);

  const players = useMemo(() => {
    const clubIds = new Set(state.competitions[tab]?.clubIds ?? []);
    return Object.values(state.players)
      .filter((p) => p.clubId && clubIds.has(p.clubId) && !p.retired)
      .filter((p) => totalStats(p).appearances + totalStats(p).substituteAppearances > 0);
  }, [state, tab]);

  const columns = (extra: 'goals' | 'assists' | 'rating' | 'cleanSheets') => [
    {
      key: 'name', label: 'Player',
      sort: (p: Player) => p.lastName,
      render: (p: Player) => `${p.firstName} ${p.lastName}`.trim(),
    },
    {
      key: 'club', label: 'Club',
      sort: (p: Player) => state.clubs[p.clubId ?? '']?.name ?? '',
      render: (p: Player) => (
        <span className="row" style={{ gap: 5 }}>
          <Kit club={state.clubs[p.clubId ?? '']} />
          {state.clubs[p.clubId ?? '']?.shortName}
        </span>
      ),
    },
    { key: 'pos', label: 'Pos', sort: (p: Player) => p.naturalPosition, render: (p: Player) => p.naturalPosition },
    {
      key: 'apps', label: 'Apps', numeric: true,
      sort: (p: Player) => totalStats(p).appearances,
      render: (p: Player) => {
        const s = totalStats(p);
        return s.substituteAppearances ? `${s.appearances} (${s.substituteAppearances})` : `${s.appearances}`;
      },
    },
    {
      key: extra, label: {
        goals: 'Goals', assists: 'Assists', rating: 'Average rating', cleanSheets: 'Clean sheets',
      }[extra],
      numeric: true,
      sort: (p: Player) => {
        const s = totalStats(p);
        if (extra === 'rating') {
          const apps = s.appearances + s.substituteAppearances;
          return apps >= 6 ? s.ratingSum / apps : 0;
        }
        return s[extra];
      },
      render: (p: Player) => {
        const s = totalStats(p);
        if (extra === 'rating') {
          const apps = s.appearances + s.substituteAppearances;
          return apps ? (s.ratingSum / apps).toFixed(2) : '—';
        }
        return <span className="strong">{s[extra]}</span>;
      },
    },
  ];

  return (
    <>
      <Panel flush>
        <Tabs
          tabs={LEAGUE_IDS.map((id) => ({ id, label: state.competitions[id]?.shortName ?? id }))}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      <div className="grid grid--2">
        <Panel title="Leading scorers" flush>
          <DataTable
            columns={columns('goals')}
            rows={players.filter((p) => totalStats(p).goals > 0)}
            rowKey={(p) => p.id}
            onRowClick={(p) => inspectPlayer(p.id)}
            defaultSort={{ key: 'goals', desc: true }}
            maxHeight={420}
            emptyMessage="No goals scored yet."
          />
        </Panel>

        <Panel title="Most assists" flush>
          <DataTable
            columns={columns('assists')}
            rows={players.filter((p) => totalStats(p).assists > 0)}
            rowKey={(p) => p.id}
            onRowClick={(p) => inspectPlayer(p.id)}
            defaultSort={{ key: 'assists', desc: true }}
            maxHeight={420}
            emptyMessage="No assists yet."
          />
        </Panel>

        <Panel title="Best average rating (6+ appearances)" flush>
          <DataTable
            columns={columns('rating')}
            rows={players.filter((p) => {
              const s = totalStats(p);
              return s.appearances + s.substituteAppearances >= 6;
            })}
            rowKey={(p) => p.id}
            onRowClick={(p) => inspectPlayer(p.id)}
            defaultSort={{ key: 'rating', desc: true }}
            maxHeight={420}
            emptyMessage="Not enough games played yet."
          />
        </Panel>

        <Panel title="Goalkeeper clean sheets" flush>
          <DataTable
            columns={columns('cleanSheets')}
            rows={players.filter((p) => p.naturalPosition === 'GK')}
            rowKey={(p) => p.id}
            onRowClick={(p) => inspectPlayer(p.id)}
            defaultSort={{ key: 'cleanSheets', desc: true }}
            maxHeight={420}
            emptyMessage="No clean sheets yet."
          />
        </Panel>
      </div>
    </>
  );
}
