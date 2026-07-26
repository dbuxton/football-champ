/**
 * The main shell: header, navigation, and whichever screen is active.
 */

import { useCallback, useEffect, useState } from 'react';
import { backgroundAutosave, Screen, useGame } from './GameContext';
import { formatDate } from '../engine/date';
import { getClub, unreadNews } from '../engine/gamestate';
import { advance, completeMatchDay, nextHumanFixture, rolloverSeason } from '../game/loop';
import { positionOf, tableFor } from '../engine/table';
import { squadWarnings, jobSecurityLabel, ordinal } from '../engine/board';
import { Kit, money, Modal } from './components';

import { HomeScreen } from './screens/Home';
import { SquadScreen } from './screens/Squad';
import { TacticsScreen } from './screens/Tactics';
import { TrainingScreen } from './screens/Training';
import { FixturesScreen } from './screens/Fixtures';
import { TablesScreen } from './screens/Tables';
import { TransfersScreen } from './screens/Transfers';
import { ScoutingScreen } from './screens/Scouting';
import { FinancesScreen } from './screens/Finances';
import { StadiumScreen } from './screens/Stadium';
import { StaffScreen } from './screens/Staff';
import { BoardScreen } from './screens/Board';
import { ClubScreen } from './screens/Club';
import { ManagerScreen } from './screens/Manager';
import { StatsScreen } from './screens/Stats';
import { SettingsScreen } from './screens/Settings';
import { MatchDayScreen } from './screens/MatchDay';
import { PlayerProfile } from './screens/PlayerProfile';

const NAV: { group: string; items: { id: Screen; label: string }[] }[] = [
  {
    group: 'Club',
    items: [
      { id: 'home', label: 'Home' },
      { id: 'squad', label: 'Squad' },
      { id: 'tactics', label: 'Tactics' },
      { id: 'training', label: 'Training' },
    ],
  },
  {
    group: 'Competition',
    items: [
      { id: 'fixtures', label: 'Fixtures' },
      { id: 'tables', label: 'Tables' },
      { id: 'stats', label: 'Statistics' },
    ],
  },
  {
    group: 'Recruitment',
    items: [
      { id: 'transfers', label: 'Transfers' },
      { id: 'scouting', label: 'Scouting' },
      { id: 'staff', label: 'Staff' },
    ],
  },
  {
    group: 'Boardroom',
    items: [
      { id: 'finances', label: 'Finances' },
      { id: 'stadium', label: 'Stadium' },
      { id: 'board', label: 'Board' },
    ],
  },
  {
    group: 'History',
    items: [
      { id: 'club', label: 'Club history' },
      { id: 'manager', label: 'Manager' },
      { id: 'settings', label: 'Settings' },
    ],
  },
];

export function App({ onQuit }: { onQuit: () => void }) {
  const game = useGame();
  const { state, refresh, screen, setScreen, showToast, inspectedPlayerId, inspectPlayer } = game;
  const [advancing, setAdvancing] = useState(false);
  const [seasonEnd, setSeasonEnd] = useState(false);
  const [sacked, setSacked] = useState(false);

  const club = getClub(state, state.manager.clubId);
  const unread = unreadNews(state).length;

  const handleStop = useCallback((stop: ReturnType<typeof advance>['stop']) => {
    switch (stop.kind) {
      case 'match':
        setScreen('match');
        break;
      case 'news':
        setScreen('home');
        break;
      case 'season-end':
        setSeasonEnd(true);
        break;
      case 'sacked':
        setSacked(true);
        break;
      default:
        break;
    }
  }, [setScreen]);

  const doAdvance = useCallback(() => {
    if (advancing) return;
    setAdvancing(true);
    // Yield so the button can show it's working before a long simulation run.
    setTimeout(() => {
      const result = advance(state);
      refresh();
      handleStop(result.stop);
      backgroundAutosave(state);
      setAdvancing(false);
    }, 10);
  }, [advancing, state, refresh, handleStop]);

  // Space bar advances, as it did in the originals.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.code === 'Space' && screen !== 'match' && !seasonEnd && !sacked) {
        event.preventDefault();
        doAdvance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doAdvance, screen, seasonEnd, sacked]);

  const finishMatchDay = useCallback(() => {
    const stop = completeMatchDay(state);
    refresh();
    setScreen('home');
    handleStop(stop);
    backgroundAutosave(state);
  }, [state, refresh, setScreen, handleStop]);

  const startNextSeason = useCallback(() => {
    rolloverSeason(state);
    setSeasonEnd(false);
    refresh();
    setScreen('home');
    backgroundAutosave(state);
    showToast(`Welcome to the ${state.season} season.`);
  }, [state, refresh, setScreen, showToast]);

  const league = state.competitions[club.leagueId];
  const position = league ? positionOf(state, league.id, club.id) : 0;
  const warnings = squadWarnings(state, club.id);
  const next = nextHumanFixture(state);

  return (
    <div className="app">
      <header className="header">
        <span className="header__club">
          <Kit club={club} />
          {club.name}
        </span>
        <span className="header__meta">
          <span>{league?.shortName}{position ? <> · <b>{ordinal(position)}</b></> : null}</span>
          <span>Balance <b>{money(club.finances.balance)}</b></span>
          <span>Transfer <b>{money(club.finances.transferBudget)}</b></span>
          <span>Board <b>{jobSecurityLabel(club.board.confidence)}</b></span>
        </span>
        <span className="header__spacer" />
        {warnings.length > 0 && (
          <span className="pill pill--warn" title={warnings.join('\n')}>
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="mono muted">{formatDate(state.date)}</span>
        {screen !== 'match' && (
          <button type="button" className="btn btn--primary" onClick={doAdvance} disabled={advancing}>
            {advancing ? 'Simulating…' : next && next.date === state.date ? 'Match day' : 'Continue ▸'}
          </button>
        )}
      </header>

      <nav className="nav">
        {NAV.map((group) => (
          <div key={group.group}>
            <div className="nav__group">{group.group}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav__item${screen === item.id ? ' nav__item--active' : ''}`}
                onClick={() => setScreen(item.id)}
              >
                {item.label}
                {item.id === 'home' && unread > 0 && <span className="nav__badge">{unread}</span>}
                {item.id === 'transfers' && pendingOfferCount(state) > 0 && (
                  <span className="nav__badge">{pendingOfferCount(state)}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="main">
        {screen === 'home' && <HomeScreen />}
        {screen === 'squad' && <SquadScreen />}
        {screen === 'tactics' && <TacticsScreen />}
        {screen === 'training' && <TrainingScreen />}
        {screen === 'fixtures' && <FixturesScreen />}
        {screen === 'tables' && <TablesScreen />}
        {screen === 'transfers' && <TransfersScreen />}
        {screen === 'scouting' && <ScoutingScreen />}
        {screen === 'finances' && <FinancesScreen />}
        {screen === 'stadium' && <StadiumScreen />}
        {screen === 'staff' && <StaffScreen />}
        {screen === 'board' && <BoardScreen />}
        {screen === 'club' && <ClubScreen />}
        {screen === 'manager' && <ManagerScreen />}
        {screen === 'stats' && <StatsScreen />}
        {screen === 'settings' && <SettingsScreen onQuit={onQuit} />}
        {screen === 'match' && <MatchDayScreen onFinish={finishMatchDay} />}
      </main>

      {inspectedPlayerId && (
        <PlayerProfile playerId={inspectedPlayerId} onClose={() => inspectPlayer(null)} />
      )}

      {seasonEnd && (
        <Modal
          title={`${state.season} — season complete`}
          onClose={startNextSeason}
          width={620}
          footer={
            <button type="button" className="btn btn--primary" onClick={startNextSeason}>
              Continue to the next season
            </button>
          }
        >
          <SeasonSummary />
        </Modal>
      )}

      {sacked && (
        <Modal
          title="Your time is up"
          onClose={onQuit}
          width={520}
          footer={<button type="button" className="btn btn--primary" onClick={onQuit}>Back to the start</button>}
        >
          <p>
            {club.name} have dismissed you. Across your career you managed{' '}
            {state.manager.totals.played} games, winning {state.manager.totals.won}.
          </p>
          {state.manager.honours.length > 0 && (
            <p>
              Honours: {state.manager.honours.map((h) => `${h.competitionName} (${h.season})`).join(', ')}
            </p>
          )}
          <p className="muted">Every manager gets sacked eventually. Start again and do it properly.</p>
        </Modal>
      )}

      {game.toast && (
        <div className={`toast${game.toast.error ? ' toast--error' : ''}`}>{game.toast.message}</div>
      )}
    </div>
  );
}

function pendingOfferCount(state: ReturnType<typeof useGame>['state']): number {
  const managed = state.manager.clubId;
  return state.transferOffers.filter(
    (o) => o.toClubId === managed && o.status === 'pending',
  ).length;
}

function SeasonSummary() {
  const { state } = useGame();
  const club = getClub(state, state.manager.clubId);
  const league = state.competitions[club.leagueId];
  const table = league ? tableFor(state, league.id) : [];
  const position = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[position - 1];

  return (
    <div className="col">
      <p className="big" style={{ margin: 0 }}>
        {ordinal(position)} in the {league?.name}
      </p>
      {row && (
        <p className="muted" style={{ margin: 0 }}>
          Played {row.played}, won {row.won}, drawn {row.drawn}, lost {row.lost}.
          Goals {row.goalsFor}–{row.goalsAgainst}. {row.points - row.pointsDeduction} points.
        </p>
      )}
      <div>
        <div className="panel__head" style={{ marginTop: 8 }}>Cup competitions</div>
        <table className="data">
          <tbody>
            {Object.values(state.cups).map((cup) => {
              const comp = state.competitions[cup.competitionId];
              const winner = cup.winnerClubId ? state.clubs[cup.winnerClubId] : null;
              const ourRound = cup.eliminatedInRound[club.id];
              return (
                <tr key={cup.competitionId}>
                  <td>{comp?.name}</td>
                  <td>{winner ? `Won by ${winner.shortName}` : 'Unfinished'}</td>
                  <td className="muted">
                    {cup.winnerClubId === club.id
                      ? 'You won it'
                      : ourRound !== undefined
                        ? `Out at the ${(cup.roundNames[ourRound] ?? 'early rounds').toLowerCase()}`
                        : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="faint small" style={{ margin: 0 }}>
        Contracts, budgets, retirements and the new fixture list will be sorted out when you
        continue.
      </p>
    </div>
  );
}
