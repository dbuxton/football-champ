/**
 * Home: the manager's desk. What needs you, what just happened, the next match, and the inbox —
 * in that order of importance.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, squadOf } from '../../engine/gamestate';
import { NewsCategory, NewsItem, PressAnswer, PressQuestion } from '../../engine/types';
import { formatDate } from '../../engine/date';
import { tableFor, positionOf, zoneFor } from '../../engine/table';
import { squadMorale } from '../../engine/progression';
import { jobSecurityLabel, ordinal } from '../../engine/board';
import { attentionItems, AttentionItem } from '../../engine/attention';
import {
  answerPressConference, readNews, respondToIncomingBid, respondToTransferRequest,
} from '../../game/actions';
import { markAllRead } from '../../engine/news';
import { Bar, FormGuide, Kit, Modal, Panel, Tabs, money } from '../components';
import { nextHumanFixture, daysUntilNextFixture } from '../../game/loop';
import { ResultModal } from '../ResultDetails';
import { ContractDialog } from './TransferDialogs';

const CATEGORY_META: Record<NewsCategory, { glyph: string; cls: string }> = {
  board: { glyph: '◆', cls: 'cat--board' },
  transfer: { glyph: '⇄', cls: 'cat--transfer' },
  match: { glyph: '⚽', cls: 'cat--match' },
  injury: { glyph: '✚', cls: 'cat--injury' },
  media: { glyph: '☏', cls: 'cat--media' },
  squad: { glyph: '▣', cls: 'cat--squad' },
  finance: { glyph: '£', cls: 'cat--finance' },
  youth: { glyph: '✿', cls: 'cat--youth' },
  competition: { glyph: '★', cls: 'cat--competition' },
  staff: { glyph: '⚙', cls: 'cat--staff' },
  award: { glyph: '✪', cls: 'cat--award' },
  general: { glyph: '·', cls: 'cat--general' },
};

function hasAction(item: NewsItem): boolean {
  return Boolean(item.action && item.action.kind !== 'acknowledge');
}

export function HomeScreen() {
  const {
    state, refresh, setScreen, showToast, inspectPlayer, focusNewsIds, digest, setDigest,
  } = useGame();
  const [open, setOpen] = useState<NewsItem | null>(null);
  const [contractFor, setContractFor] = useState<string | null>(null);
  const [openResultId, setOpenResultId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'action'>('all');

  const club = getClub(state, state.manager.clubId);
  const league = state.competitions[club.leagueId];
  const table = league ? tableFor(state, league.id) : [];
  const position = league ? positionOf(state, league.id, club.id) : 0;
  const row = table.find((r) => r.clubId === club.id);
  const next = nextHumanFixture(state);
  const daysAway = daysUntilNextFixture(state);
  const opponent = next
    ? state.clubs[next.homeClubId === club.id ? next.awayClubId : next.homeClubId]
    : null;
  const squad = squadOf(state, club.id);
  const attention = attentionItems(state);
  const objectives = club.board.objectives ?? [];

  const openItem = (item: NewsItem) => {
    setOpen(item);
    readNews(state, item.id);
    refresh();
  };

  // When the clock stopped for exactly one decision, open it — don't make the manager hunt.
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNewsIds || focusNewsIds.length === 0) return;
    const key = focusNewsIds.join('|');
    if (autoOpened.current === key) return;
    autoOpened.current = key;
    const actionable = focusNewsIds
      .map((id) => state.news.find((n) => n.id === id))
      .filter((n): n is NewsItem => Boolean(n && hasAction(n)));
    if (actionable.length === 1) openItem(actionable[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNewsIds]);

  const onAttention = (item: AttentionItem) => {
    if (item.newsId) {
      const news = state.news.find((n) => n.id === item.newsId);
      if (news) openItem(news);
      return;
    }
    setScreen(item.target);
    if (item.playerId) inspectPlayer(item.playerId);
  };

  // Decisions float to the top of the inbox; the filters cut the rest down.
  const matchesFilter = (item: NewsItem) =>
    filter === 'unread' ? !item.read : filter === 'action' ? hasAction(item) : true;
  const pinned = state.news.filter((n) => hasAction(n) && !n.read && matchesFilter(n));
  const pinnedIds = new Set(pinned.map((n) => n.id));
  const rest = state.news.filter((n) => matchesFilter(n) && !pinnedIds.has(n.id)).slice(0, 120);
  const inboxList = [...pinned, ...rest];

  const digestFixtures = (digest?.ourFixtureIds ?? [])
    .map((id) => state.fixtures.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f?.result));
  const openResult = openResultId ? state.fixtures.find((f) => f.id === openResultId) : null;

  return (
    <>
      {digest && (
        <div className="digest">
          <span className="digest__lead">
            {digest.days === 1 ? 'A day passed.' : `${digest.days} days passed.`}
          </span>
          {digest.positionAfter > 0 && digest.positionBefore > 0 &&
            digest.positionAfter !== digest.positionBefore && (
            <span className={digest.positionAfter < digest.positionBefore ? 'pos' : 'neg'}>
              {ordinal(digest.positionBefore)} → {ordinal(digest.positionAfter)}
            </span>
          )}
          {digestFixtures.map((fixture) => {
            const isHome = fixture.homeClubId === club.id;
            const other = state.clubs[isHome ? fixture.awayClubId : fixture.homeClubId];
            const us = isHome ? fixture.result!.homeGoals : fixture.result!.awayGoals;
            const them = isHome ? fixture.result!.awayGoals : fixture.result!.homeGoals;
            return (
              <button
                key={fixture.id}
                type="button"
                className={`btn btn--small ${us > them ? 'pos' : us < them ? 'neg' : ''}`}
                onClick={() => setOpenResultId(fixture.id)}
              >
                {other?.shortName} {us}-{them} ({isHome ? 'H' : 'A'})
              </button>
            );
          })}
          {digest.importantNews.length > 0 && (
            <span className="muted small">
              {digest.importantNews.length} important item{digest.importantNews.length > 1 ? 's' : ''} in the inbox
            </span>
          )}
          <span className="spacer" style={{ flex: 1 }} />
          <button type="button" className="btn btn--small" onClick={() => setDigest(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid--2">
        <Panel
          title="Inbox"
          flush
          actions={
            <button
              type="button"
              className="btn btn--small"
              onClick={() => { markAllRead(state); refresh(); }}
            >
              Mark all read
            </button>
          }
        >
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread', badge: state.news.filter((n) => !n.read).length || undefined },
              { id: 'action', label: 'Needs a decision', badge: state.news.filter((n) => hasAction(n) && !n.read).length || undefined },
            ]}
            active={filter}
            onChange={setFilter}
          />
          <div className="scroll-y" style={{ maxHeight: 520 }}>
            {inboxList.length === 0 && <p className="muted" style={{ padding: 12 }}>Nothing here.</p>}
            {inboxList.map((item) => {
              const meta = CATEGORY_META[item.category] ?? CATEGORY_META.general;
              const flash = focusNewsIds?.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={[
                    'news-item',
                    item.read ? '' : 'news-item--unread',
                    flash ? 'news-item--flash' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => openItem(item)}
                >
                  <span className={`news-item__cat ${meta.cls}`} title={item.category}>{meta.glyph}</span>
                  <span className="news-item__date">{formatDate(item.date).slice(0, 12)}</span>
                  <span className="news-item__body">
                    <span className="news-item__subject">
                      {item.important && <span className="warn">! </span>}
                      {item.subject}
                    </span>
                    <span className="news-item__preview">{item.body}</span>
                  </span>
                  {hasAction(item) && <span className="pill pill--good">Decision</span>}
                </div>
              );
            })}
          </div>
        </Panel>

        <div>
          {attention.filter((a) => !a.newsId).length > 0 && (
            <Panel title="Needs your attention" flush>
              <div className="col" style={{ gap: 0 }}>
                {attention.filter((a) => !a.newsId).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`attention-item attention-item--${item.severity}`}
                    onClick={() => onAttention(item)}
                  >
                    <span className="attention-item__label">{item.label}</span>
                    {item.detail && <span className="attention-item__detail">{item.detail}</span>}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {next && opponent && (
            <Panel title="Next fixture">
              <div className="col">
                <div className="row" style={{ gap: 10 }}>
                  <Kit club={opponent} />
                  <span className="strong big">{opponent.name}</span>
                </div>
                <div className="muted">
                  {next.homeClubId === club.id ? 'Home' : 'Away'} ·{' '}
                  {state.competitions[next.competitionId]?.name}
                  {next.roundName ? ` · ${next.roundName}` : ''}
                </div>
                <div className="mono">
                  {formatDate(next.date)}
                  {daysAway !== null && daysAway > 0 ? ` — in ${daysAway} day${daysAway > 1 ? 's' : ''}` : ' — today'}
                </div>
                {club.rivalIds.includes(opponent.id) && (
                  <span className="pill pill--warn" style={{ alignSelf: 'flex-start' }}>Local derby</span>
                )}
                <div className="row">
                  <button type="button" className="btn btn--small btn--primary" onClick={() => setScreen('tactics')}>
                    Pick your side
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setScreen('fixtures')}>
                    All fixtures
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {objectives.length > 0 && (
            <Panel title="Season objectives" flush>
              <table className="data">
                <tbody>
                  {objectives.map((objective) => (
                    <tr key={objective.label}>
                      <td>
                        <span className={`pill pill--objective-${objective.status}`}>
                          {objective.status === 'on-track' ? 'On track'
                            : objective.status === 'behind' ? 'Behind'
                            : objective.status === 'met' ? 'Achieved' : 'Missed'}
                        </span>
                      </td>
                      <td>{objective.label}</td>
                      <td className="muted small right">
                        {objectiveProgress(objective, position, state, club.id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel title="Club summary">
            <div className="col">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">League position</span>
                <span className="strong">
                  {position ? `${ordinal(position)} in the ${league?.shortName}` : league?.name}
                </span>
              </div>
              {row && (
                <>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Record</span>
                    <span className="mono">
                      {row.played} pld · {row.won}-{row.drawn}-{row.lost} · {row.points - row.pointsDeduction} pts
                      {row.pointsDeduction ? <span className="neg"> (−{row.pointsDeduction})</span> : null}
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Form</span>
                    <FormGuide form={row.form} />
                  </div>
                </>
              )}
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Board confidence</span>
                <span className="row">
                  <Bar value={club.board.confidence} showValue />
                  <span>{jobSecurityLabel(club.board.confidence)}</span>
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Squad morale</span>
                <span className="row"><Bar value={squadMorale(state, club.id)} showValue /></span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Supporters</span>
                <span className="row"><Bar value={club.fanHappiness} showValue /></span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Balance</span>
                <span className={club.finances.balance < 0 ? 'neg strong' : 'strong'}>
                  {money(club.finances.balance)}
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Squad</span>
                <span>
                  {squad.length} players ·{' '}
                  {squad.filter((p) => p.injury).length} injured ·{' '}
                  {squad.filter((p) => p.suspensionMatches > 0).length} suspended
                </span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Transfer window</span>
                <span className={state.transferWindowOpen ? 'pos' : 'faint'}>
                  {state.deadlineDay ? 'DEADLINE DAY' : state.transferWindowOpen ? 'Open' : 'Closed'}
                </span>
              </div>
            </div>
          </Panel>

          <Panel title={`${league?.shortName ?? 'League'} — around you`} flush>
            <table className="data">
              <tbody>
                {table
                  .map((r, index) => ({ r, index }))
                  .filter(({ index }) => Math.abs(index - (position - 1)) <= 3)
                  .map(({ r, index }) => {
                    const c = state.clubs[r.clubId];
                    const zone = league ? zoneFor(state, league.id, index) : 'none';
                    return (
                      <tr
                        key={r.clubId}
                        className={`${zone !== 'none' ? `zone-${zone}` : ''}${r.clubId === club.id ? ' highlight' : ''}`}
                      >
                        <td className="num faint">{index + 1}</td>
                        <td><Kit club={c} /> {c?.shortName}</td>
                        <td className="num">{r.played}</td>
                        <td className="num">{r.goalsFor - r.goalsAgainst > 0 ? '+' : ''}{r.goalsFor - r.goalsAgainst}</td>
                        <td className="num strong">{r.points - r.pointsDeduction}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>

      {open && (
        <NewsModal
          item={open}
          onClose={() => { setOpen(null); refresh(); }}
          onAction={(message, error) => showToast(message, error)}
          onInspect={inspectPlayer}
          onOpenContract={(playerId) => { setOpen(null); setContractFor(playerId); }}
        />
      )}

      {contractFor && (
        <ContractDialog playerId={contractFor} onClose={() => { setContractFor(null); refresh(); }} />
      )}

      {openResult?.result && (
        <ResultModal fixture={openResult} onClose={() => setOpenResultId(null)} />
      )}
    </>
  );
}

function objectiveProgress(
  objective: NonNullable<ReturnType<typeof getClub>['board']['objectives']>[number],
  position: number,
  state: ReturnType<typeof useGame>['state'],
  clubId: string,
): string {
  if (objective.kind === 'league' && objective.targetPosition) {
    return position > 0 ? `${ordinal(position)} · target ${ordinal(objective.targetPosition)}` : '';
  }
  if (objective.kind === 'cup' && objective.competitionId) {
    const cup = state.cups[objective.competitionId];
    if (!cup) return '';
    if (cup.winnerClubId === clubId) return 'Winners';
    const out = cup.eliminatedInRound[clubId];
    if (out !== undefined) return `Out at the ${(cup.roundNames[out] ?? 'early rounds').toLowerCase()}`;
    if (cup.remainingClubIds.includes(clubId)) {
      return `In the ${(cup.roundNames[cup.currentRound] ?? 'draw').toLowerCase()}`;
    }
    return 'Awaiting entry';
  }
  return '';
}

function NewsModal({
  item,
  onClose,
  onAction,
  onInspect,
  onOpenContract,
}: {
  item: NewsItem;
  onClose: () => void;
  onAction: (message: string, error?: boolean) => void;
  onInspect: (id: string | null) => void;
  onOpenContract: (playerId: string) => void;
}) {
  const { state, refresh } = useGame();
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const action = item.action;

  const footer = (() => {
    if (!action) return null;

    if (action.kind === 'press-conference') {
      const questions = action.questions;
      const allAnswered = questions.every((_, index) => answers[index] !== undefined);
      return (
        <button
          type="button"
          className="btn btn--primary"
          disabled={!allAnswered}
          onClick={() => {
            const chosen: PressAnswer[] = questions.map((q, index) => q.options[answers[index]]);
            answerPressConference(state, item.id, chosen);
            refresh();
            onAction('You faced the press.');
            onClose();
          }}
        >
          Finish the press conference
        </button>
      );
    }

    if (action.kind === 'transfer-offer') {
      const offer = state.transferOffers.find((o) => o.id === action.offerId);
      if (!offer) return <span className="muted">This offer has lapsed.</span>;
      const isIncoming = offer.toClubId === state.manager.clubId;
      if (!isIncoming || offer.status !== 'pending') return null;
      return (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const result = respondToIncomingBid(state, offer.id, false);
              refresh();
              onAction(result.message);
              onClose();
            }}
          >
            Reject
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const result = respondToIncomingBid(state, offer.id, true);
              refresh();
              onAction(result.message, !result.ok);
              onClose();
            }}
          >
            Accept the bid
          </button>
        </>
      );
    }

    if (action.kind === 'contract-response') {
      const offer = state.contractOffers.find((o) => o.id === action.offerId);
      const playerId = offer?.playerId ?? item.relatedPlayerId;
      if (!offer || !playerId || offer.status === 'expired' || offer.status === 'withdrawn' ||
        offer.status === 'completed') {
        return <span className="muted">These talks have concluded.</span>;
      }
      return (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onOpenContract(playerId)}
        >
          {offer.status === 'accepted' ? 'Complete the signing' : 'Open contract talks'}
        </button>
      );
    }

    if (action.kind === 'player-unhappy') {
      const playerId = action.playerId;
      return (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => {
              respondToTransferRequest(state, playerId, false);
              refresh();
              onAction('You have rejected the transfer request.');
              onClose();
            }}
          >
            Reject the request
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              respondToTransferRequest(state, playerId, true);
              refresh();
              onAction('The player has been transfer listed.');
              onClose();
            }}
          >
            Grant it and list him
          </button>
        </>
      );
    }

    return null;
  })();

  return (
    <Modal title={item.subject} onClose={onClose} width={620} footer={footer}>
      <p className="faint small" style={{ marginTop: 0 }}>{formatDate(item.date)}</p>
      <p>{item.body}</p>

      {item.relatedPlayerId && state.players[item.relatedPlayerId] && (
        <button
          type="button"
          className="btn btn--small"
          onClick={() => { onInspect(item.relatedPlayerId!); onClose(); }}
        >
          View {state.players[item.relatedPlayerId].shortName}
        </button>
      )}

      {action?.kind === 'press-conference' && (
        <div className="col" style={{ marginTop: 12 }}>
          {action.questions.map((question: PressQuestion, qIndex: number) => (
            <div key={qIndex} className="panel" style={{ margin: 0 }}>
              <div className="panel__head">{question.question}</div>
              <div className="panel__body col">
                {question.options.map((option, oIndex) => (
                  <button
                    key={oIndex}
                    type="button"
                    className={`option${answers[qIndex] === oIndex ? ' option--active' : ''}`}
                    onClick={() => setAnswers((current) => ({ ...current, [qIndex]: oIndex }))}
                  >
                    “{option.text}”
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {action?.kind === 'transfer-offer' && (() => {
        const offer = state.transferOffers.find((o) => o.id === action.offerId);
        if (!offer) return null;
        return (
          <table className="data" style={{ marginTop: 10 }}>
            <tbody>
              <tr><td>Fee</td><td className="num strong">{money(offer.fee)}</td></tr>
              {offer.instalments > 0 && (
                <tr><td>Instalments</td><td className="num">{offer.instalments + 1} payments</td></tr>
              )}
              {offer.sellOnPercent > 0 && (
                <tr><td>Sell-on clause</td><td className="num">{offer.sellOnPercent}%</td></tr>
              )}
              <tr><td>Status</td><td className="num">{offer.status}</td></tr>
            </tbody>
          </table>
        );
      })()}

      {action?.kind === 'contract-response' && (() => {
        const offer = state.contractOffers.find((o) => o.id === action.offerId);
        if (!offer?.demands) return null;
        return (
          <table className="data" style={{ marginTop: 10 }}>
            <tbody>
              <tr><td>He wants</td><td className="num strong">£{offer.demands.wage.toLocaleString()}/w</td></tr>
              <tr><td>Length</td><td className="num">{offer.demands.years} years</td></tr>
              <tr><td>Status</td><td className="num">{offer.demands.squadStatus}</td></tr>
              {offer.demands.signingOnFee > 0 && (
                <tr><td>Signing-on fee</td><td className="num">£{offer.demands.signingOnFee.toLocaleString()}</td></tr>
              )}
            </tbody>
          </table>
        );
      })()}
    </Modal>
  );
}
