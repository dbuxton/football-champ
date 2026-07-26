/**
 * Home: the inbox, plus an at-a-glance summary of where the club stands.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, squadOf } from '../../engine/gamestate';
import { NewsItem, PressAnswer, PressQuestion } from '../../engine/types';
import { formatDate } from '../../engine/date';
import { tableFor, positionOf, zoneFor } from '../../engine/table';
import { squadMorale } from '../../engine/progression';
import { jobSecurityLabel, ordinal, squadWarnings } from '../../engine/board';
import {
  answerPressConference, readNews, respondToIncomingBid, respondToTransferRequest,
} from '../../game/actions';
import { markAllRead } from '../../engine/news';
import { Bar, FormGuide, Kit, Modal, Panel, money } from '../components';
import { nextHumanFixture, daysUntilNextFixture } from '../../game/loop';

export function HomeScreen() {
  const { state, refresh, setScreen, showToast, inspectPlayer } = useGame();
  const [open, setOpen] = useState<NewsItem | null>(null);
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
  const warnings = squadWarnings(state, club.id);
  const squad = squadOf(state, club.id);

  const openItem = (item: NewsItem) => {
    setOpen(item);
    readNews(state, item.id);
    refresh();
  };

  return (
    <>
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
          <div className="scroll-y" style={{ maxHeight: 520 }}>
            {state.news.length === 0 && <p className="muted" style={{ padding: 12 }}>Nothing yet.</p>}
            {state.news.slice(0, 120).map((item) => (
              <div
                key={item.id}
                className={`news-item${item.read ? '' : ' news-item--unread'}`}
                onClick={() => openItem(item)}
              >
                <span className="news-item__date">{formatDate(item.date).slice(0, 12)}</span>
                <span className="news-item__body">
                  <span className="news-item__subject">
                    {item.important && <span className="warn">! </span>}
                    {item.subject}
                  </span>
                  <span className="news-item__preview">{item.body}</span>
                </span>
                {item.action && item.action.kind !== 'acknowledge' && (
                  <span className="pill pill--good">Action</span>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <div>
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
                <span className="muted">Board expects</span>
                <span>{club.board.expectation}</span>
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
                  <button type="button" className="btn btn--small" onClick={() => setScreen('tactics')}>
                    Pick your side
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setScreen('fixtures')}>
                    All fixtures
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {warnings.length > 0 && (
            <Panel title="Warnings">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {warnings.map((warning) => (
                  <li key={warning} className="warn">{warning}</li>
                ))}
              </ul>
            </Panel>
          )}

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
        />
      )}
    </>
  );
}

function NewsModal({
  item,
  onClose,
  onAction,
  onInspect,
}: {
  item: NewsItem;
  onClose: () => void;
  onAction: (message: string, error?: boolean) => void;
  onInspect: (id: string | null) => void;
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
    </Modal>
  );
}
