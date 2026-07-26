/**
 * The bid and contract dialogs — where negotiations actually happen.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { SquadStatus } from '../../engine/types';
import {
  bidForPlayer, confirmSigning, improveBid, offerContract, pressForAnswer, suggestedBid,
  suggestedTerms,
} from '../../game/actions';
import { Field, Modal, money, exactMoney } from '../components';

const SQUAD_STATUSES: SquadStatus[] = [
  'Key Player', 'First Team', 'Rotation', 'Backup', 'Hot Prospect', 'Youngster',
];

export function BidDialog({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { state, refresh, showToast } = useGame();
  const player = state.players[playerId];
  const club = getClub(state, state.manager.clubId);
  const suggestion = suggestedBid(state, playerId);

  const existing = state.transferOffers.find(
    (o) => o.playerId === playerId && o.fromClubId === club.id &&
      (o.status === 'pending' || o.status === 'negotiating' || o.status === 'accepted' || o.status === 'rejected'),
  );

  const [isLoan, setIsLoan] = useState(false);
  const [fee, setFee] = useState(existing?.counterFee ?? suggestion);
  const [instalments, setInstalments] = useState(0);
  const [sellOn, setSellOn] = useState(0);
  const [wageShare, setWageShare] = useState(0.6);
  const [loanMonths, setLoanMonths] = useState(6);

  if (!player) return null;

  const upFront = instalments > 0 ? Math.round(fee / (instalments + 1)) : fee;
  const overBudget = !isLoan && upFront > club.finances.transferBudget;

  const submit = () => {
    const terms = {
      fee: isLoan ? 0 : fee,
      instalments: isLoan ? 0 : instalments,
      sellOnPercent: isLoan ? 0 : sellOn,
      isLoan,
      loanWageShare: wageShare,
      loanMonths,
    };
    const result = existing && existing.status !== 'accepted'
      ? improveBid(state, existing.id, terms)
      : bidForPlayer(state, playerId, terms);
    refresh();
    showToast(result.message, !result.ok);
    if (result.ok) onClose();
  };

  return (
    <Modal
      title={`Offer for ${player.firstName} ${player.lastName}`}
      onClose={onClose}
      width={540}
      footer={
        <>
          {existing && (existing.status === 'pending' || existing.status === 'negotiating') && (
            <button
              type="button"
              className="btn"
              onClick={() => { pressForAnswer(state, existing.id); refresh(); showToast('You pressed for an answer.'); }}
            >
              Press for an answer
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={submit} disabled={overBudget}>
            {existing && existing.status !== 'accepted' ? 'Improve the offer' : 'Submit the offer'}
          </button>
        </>
      }
    >
      <div className="col">
        <p className="muted" style={{ marginTop: 0 }}>
          {state.clubs[player.clubId ?? '']?.name} value him at around{' '}
          <b>{money(suggestion)}</b>. Your transfer budget is{' '}
          <b>{money(club.finances.transferBudget)}</b>.
        </p>

        {existing?.responseText && (
          <div className={`panel`} style={{ margin: 0 }}>
            <div className="panel__head">Their response</div>
            <div className="panel__body">{existing.responseText}</div>
          </div>
        )}

        <div className="row">
          <label className="row" style={{ gap: 5 }}>
            <input type="checkbox" checked={isLoan} onChange={(e) => setIsLoan(e.target.checked)} />
            Loan enquiry instead of a permanent transfer
          </label>
        </div>

        {isLoan ? (
          <div className="row row--wrap" style={{ gap: 12 }}>
            <Field label="Wage contribution">
              <input
                type="range" min={0} max={100} step={5}
                value={Math.round(wageShare * 100)}
                onChange={(e) => setWageShare(Number(e.target.value) / 100)}
              />
              <span className="mono">{Math.round(wageShare * 100)}%</span>
            </Field>
            <Field label="Length">
              <select value={loanMonths} onChange={(e) => setLoanMonths(Number(e.target.value))}>
                <option value={1}>1 month</option>
                <option value={3}>3 months</option>
                <option value={6}>Half a season</option>
                <option value={11}>Season-long</option>
              </select>
            </Field>
          </div>
        ) : (
          <>
            <Field label="Transfer fee">
              <input
                type="number" min={0} step={25_000} value={fee}
                onChange={(e) => setFee(Math.max(0, Number(e.target.value)))}
              />
              <input
                type="range"
                min={0}
                max={Math.max(suggestion * 2, club.finances.transferBudget)}
                step={25_000}
                value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
              />
              <span className="mono">{exactMoney(fee)}</span>
            </Field>

            <div className="row row--wrap" style={{ gap: 12 }}>
              <Field label="Pay over instalments">
                <select value={instalments} onChange={(e) => setInstalments(Number(e.target.value))}>
                  <option value={0}>All up front</option>
                  <option value={1}>2 payments</option>
                  <option value={2}>3 payments</option>
                  <option value={3}>4 payments</option>
                </select>
              </Field>
              <Field label="Sell-on clause">
                <select value={sellOn} onChange={(e) => setSellOn(Number(e.target.value))}>
                  {[0, 5, 10, 15, 20, 25].map((n) => (
                    <option key={n} value={n}>{n === 0 ? 'None' : `${n}%`}</option>
                  ))}
                </select>
              </Field>
            </div>

            <p className={overBudget ? 'neg' : 'muted'} style={{ margin: 0 }}>
              Up front: <b>{exactMoney(upFront)}</b>
              {overBudget && ' — that exceeds your transfer budget.'}
            </p>
            {instalments > 0 && (
              <p className="faint small" style={{ margin: 0 }}>
                Instalments reduce the immediate hit but the selling club discounts them, so you
                will need to offer more overall.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ContractDialog({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { state, refresh, showToast } = useGame();
  const player = state.players[playerId];
  const club = getClub(state, state.manager.clubId);
  const demands = suggestedTerms(state, playerId);

  const existing = state.contractOffers.find(
    (o) => o.playerId === playerId && o.clubId === club.id &&
      o.status !== 'completed' && o.status !== 'expired' && o.status !== 'withdrawn',
  );

  const [wage, setWage] = useState(existing?.wage ?? demands?.wage ?? 5_000);
  const [years, setYears] = useState(existing?.years ?? demands?.years ?? 3);
  const [signingOn, setSigningOn] = useState(existing?.signingOnFee ?? demands?.signingOnFee ?? 0);
  const [status, setStatus] = useState<SquadStatus>(existing?.squadStatus ?? demands?.squadStatus ?? 'Rotation');
  const [releaseClause, setReleaseClause] = useState(existing?.releaseClause ?? 0);

  if (!player || !demands) return null;

  const revealed = existing?.demands;
  const isOurs = player.clubId === club.id;
  const canConfirm = existing?.status === 'accepted';

  return (
    <Modal
      title={`${isOurs ? 'New contract for' : 'Personal terms with'} ${player.firstName} ${player.lastName}`}
      onClose={onClose}
      width={540}
      footer={
        <>
          {existing && (existing.status === 'pending' || existing.status === 'negotiating') && (
            <button
              type="button"
              className="btn"
              onClick={() => { pressForAnswer(state, existing.id); refresh(); }}
            >
              Press for an answer
            </button>
          )}
          {canConfirm ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const result = confirmSigning(state, existing!.id);
                refresh();
                showToast(result.message, !result.ok);
                if (result.ok) onClose();
              }}
            >
              {isOurs ? 'Sign the new deal' : 'Complete the signing'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const result = offerContract(state, playerId, {
                  wage, years, signingOnFee: signingOn, releaseClause,
                  loyaltyBonus: Math.round(wage * 4),
                  appearanceFee: Math.round(wage * 0.08),
                  goalBonus: Math.round(wage * 0.12),
                  squadStatus: status,
                });
                refresh();
                showToast(result.message, !result.ok);
                if (result.ok) onClose();
              }}
            >
              Offer these terms
            </button>
          )}
        </>
      }
    >
      <div className="col">
        {existing?.responseText && (
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel__head">His response</div>
            <div className="panel__body">{existing.responseText}</div>
          </div>
        )}

        <p className="muted" style={{ margin: 0 }}>
          {revealed
            ? <>He wants <b>{exactMoney(revealed.wage)}/w</b> over <b>{revealed.years} years</b> as a <b>{revealed.squadStatus}</b>.</>
            : <>Your scouts estimate he will want around <b>{exactMoney(demands.wage)}/w</b>. Open talks to find out for certain.</>}
        </p>

        <Field label="Weekly wage">
          <input
            type="number" min={500} step={250} value={wage}
            onChange={(e) => setWage(Math.max(500, Number(e.target.value)))}
          />
          <input
            type="range" min={500} max={Math.max(demands.wage * 2.5, 20_000)} step={250}
            value={wage} onChange={(e) => setWage(Number(e.target.value))}
          />
          <span className="mono">{exactMoney(wage)} per week</span>
        </Field>

        <div className="row row--wrap" style={{ gap: 12 }}>
          <Field label="Length">
            <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} year{n > 1 ? 's' : ''}</option>)}
            </select>
          </Field>
          <Field label="Squad status">
            <select value={status} onChange={(e) => setStatus(e.target.value as SquadStatus)}>
              {SQUAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Signing-on fee">
            <input
              type="number" min={0} step={5_000} value={signingOn}
              onChange={(e) => setSigningOn(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <Field label="Release clause">
            <input
              type="number" min={0} step={250_000} value={releaseClause}
              onChange={(e) => setReleaseClause(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>

        <p className="faint small" style={{ margin: 0 }}>
          Promising a squad status you cannot honour will make him unhappy later. A release clause
          makes him more likely to sign, and more likely to leave.
        </p>
      </div>
    </Modal>
  );
}
