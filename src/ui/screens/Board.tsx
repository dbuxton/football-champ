/**
 * The board: confidence, expectations, job security and the requests you can make.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { BoardRequest } from '../../engine/gamestate';
import { jobSecurityLabel, ordinal, suggestedRequestAmount, squadWarnings } from '../../engine/board';
import { positionOf, tableFor } from '../../engine/table';
import { makeBoardRequest } from '../../game/actions';
import { Bar, ConfirmDialog, Field, Panel, exactMoney, money } from '../components';

const REQUESTS: { kind: BoardRequest['kind']; label: string; blurb: string }[] = [
  { kind: 'transfer-budget', label: 'More transfer money', blurb: 'A one-off increase to the kitty for this window.' },
  { kind: 'wage-budget', label: 'More wage headroom', blurb: 'Raises the weekly ceiling so you can sign better players.' },
  { kind: 'feeder-club', label: 'A feeder club', blurb: 'Somewhere to send young players for real competitive minutes.' },
];

export function BoardScreen() {
  const { state, refresh, showToast } = useGame();
  const club = getClub(state, state.manager.clubId);
  const league = state.competitions[club.leagueId];
  const position = league ? positionOf(state, league.id, club.id) : 0;
  const table = league ? tableFor(state, league.id) : [];
  const [pending, setPending] = useState<{ kind: BoardRequest['kind']; amount: number } | null>(null);
  const [customAmount, setCustomAmount] = useState<number | null>(null);

  const warnings = squadWarnings(state, club.id);

  return (
    <>
      <div className="grid grid--2">
        <Panel title="Board confidence">
          <div className="col">
            <div className="row" style={{ gap: 12 }}>
              <span className="big">{jobSecurityLabel(club.board.confidence)}</span>
              <Bar value={club.board.confidence} />
            </div>
            <table className="data">
              <tbody>
                <tr><td>Their expectation</td><td className="num strong">{club.board.expectation}</td></tr>
                <tr>
                  <td>Where you are</td>
                  <td className="num">
                    {position ? `${ordinal(position)} of ${table.length}` : 'Season not started'}
                  </td>
                </tr>
                <tr><td>Days in charge</td><td className="num">{club.board.daysInCharge}</td></tr>
                <tr><td>Supporter happiness</td><td className="num"><Bar value={club.fanHappiness} /></td></tr>
                <tr><td>Club balance</td><td className={`num ${club.finances.balance < 0 ? 'neg' : ''}`}>{money(club.finances.balance)}</td></tr>
              </tbody>
            </table>
            <p className="faint small" style={{ margin: 0 }}>
              Confidence moves on results measured against expectation, on the club's financial
              health, and on how happy supporters are. It moves gradually — one bad week will not
              cost you your job, and one good one will not save it.
            </p>
          </div>
        </Panel>

        <Panel title="Season objectives">
          {(club.board.objectives ?? []).length > 0 ? (
            <table className="data">
              <tbody>
                {(club.board.objectives ?? []).map((objective) => (
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
                      {objective.kind === 'league' && objective.targetPosition && position
                        ? `${ordinal(position)} · target ${ordinal(objective.targetPosition)}`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Objectives are set when the season begins.
            </p>
          )}
          <div className="panel__head" style={{ marginTop: 12 }}>Standing instructions</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Keep the wage bill inside <b>{exactMoney(club.finances.wageBudget)}</b> per week.</li>
            <li>Give the supporters a team worth watching.</li>
          </ul>
          {warnings.length > 0 && (
            <>
              <div className="panel__head" style={{ marginTop: 12 }}>Concerns</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {warnings.map((warning) => <li key={warning} className="warn">{warning}</li>)}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Make a request">
        <div className="grid grid--3">
          {REQUESTS.map((request) => {
            const amount = suggestedRequestAmount(state, request.kind);
            return (
              <div key={request.kind} className="panel" style={{ margin: 0 }}>
                <div className="panel__head">{request.label}</div>
                <div className="panel__body col">
                  <p className="muted small" style={{ margin: 0 }}>{request.blurb}</p>
                  {amount > 0 && (
                    <Field label="Amount">
                      <input
                        type="number"
                        min={0}
                        step={request.kind === 'wage-budget' ? 500 : 250_000}
                        defaultValue={amount}
                        onChange={(e) => setCustomAmount(Number(e.target.value))}
                      />
                    </Field>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setPending({ kind: request.kind, amount: customAmount ?? amount })}
                  >
                    Put it to the board
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="faint small" style={{ marginBottom: 0 }}>
          Stadium and facility investment is requested from the Stadium screen.
        </p>
      </Panel>

      {state.boardRequests.length > 0 && (
        <Panel title="Request history" flush>
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Request</th><th className="num">Amount</th><th>Outcome</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {state.boardRequests.slice(0, 30).map((request) => (
                <tr key={request.id}>
                  <td className="mono faint small">{request.date}</td>
                  <td>{request.kind.replace(/-/g, ' ')}</td>
                  <td className="num">{request.amount ? money(request.amount) : '—'}</td>
                  <td>
                    <span className={`pill${request.status === 'approved' ? ' pill--good' : ' pill--bad'}`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="muted small">{request.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {pending && (
        <ConfirmDialog
          title="Put this to the board?"
          confirmLabel="Make the request"
          body={
            <p>
              Asking for <b>{pending.amount ? exactMoney(pending.amount) : 'a feeder club arrangement'}</b>.
              Board confidence is currently <b>{jobSecurityLabel(club.board.confidence).toLowerCase()}</b>.
              Repeated requests in a short period are more likely to be refused.
            </p>
          }
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const outcome = makeBoardRequest(state, pending.kind, pending.amount);
            refresh();
            showToast(outcome.reason, !outcome.approved);
            setPending(null);
          }}
        />
      )}
    </>
  );
}
