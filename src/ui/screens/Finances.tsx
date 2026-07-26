/**
 * Finances: profit and loss, the balance sheet, sponsorships, loans and the P&S position.
 */

import { useMemo } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { FinanceCategory } from '../../engine/types';
import {
  projectBalance, rollingLoss, staffWageBill, wageBill,
} from '../../engine/finance';
import { seasonLabel } from '../../engine/date';
import { PS_ALLOWABLE_LOSS_3_YEARS, PARACHUTE_PAYMENTS } from '../../data/competitions';
import { Panel, exactMoney, money } from '../components';

export function FinancesScreen() {
  const { state } = useGame();
  const club = getClub(state, state.manager.clubId);
  const finances = club.finances;

  const thisSeason = useMemo(
    () => finances.ledger.filter((e) => seasonLabel(e.date) === state.season),
    [finances.ledger, state.season],
  );

  const byCategory = useMemo(() => {
    const totals = new Map<FinanceCategory, number>();
    for (const entry of thisSeason) {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [thisSeason]);

  const income = byCategory.filter(([, amount]) => amount > 0);
  const expenditure = byCategory.filter(([, amount]) => amount < 0);
  const totalIncome = income.reduce((sum, [, amount]) => sum + amount, 0);
  const totalExpenditure = expenditure.reduce((sum, [, amount]) => sum + amount, 0);
  const loss = rollingLoss(club);
  const parachute = state.parachuteYears[club.id];

  return (
    <>
      <div className="grid grid--3">
        <Panel title="Position">
          <table className="data">
            <tbody>
              <tr>
                <td>Balance</td>
                <td className={`num strong ${finances.balance < 0 ? 'neg' : 'pos'}`}>
                  {exactMoney(finances.balance)}
                </td>
              </tr>
              <tr>
                <td>Projected end of season</td>
                <td className={`num ${projectBalance(state, club.id) < 0 ? 'neg' : ''}`}>
                  {exactMoney(projectBalance(state, club.id))}
                </td>
              </tr>
              <tr><td>Transfer budget</td><td className="num">{exactMoney(finances.transferBudget)}</td></tr>
              <tr>
                <td>Wage budget</td>
                <td className="num">{exactMoney(finances.wageBudget)}/w</td>
              </tr>
              <tr>
                <td>Player wage bill</td>
                <td className={`num ${wageBill(state, club.id) > finances.wageBudget ? 'neg strong' : ''}`}>
                  {exactMoney(wageBill(state, club.id))}/w
                </td>
              </tr>
              <tr><td>Staff wage bill</td><td className="num">{exactMoney(staffWageBill(state, club.id))}/w</td></tr>
              {finances.administration && (
                <tr><td className="neg strong">In administration</td><td /></tr>
              )}
              {finances.embargoUntil && finances.embargoUntil > state.date && (
                <tr>
                  <td className="warn">Transfer embargo</td>
                  <td className="num warn">until {finances.embargoUntil}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <Panel title="Income this season" flush>
          <table className="data">
            <tbody>
              {income.map(([category, amount]) => (
                <tr key={category}>
                  <td>{category}</td>
                  <td className="num pos">{exactMoney(amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">Total</td>
                <td className="num strong pos">{exactMoney(totalIncome)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Expenditure this season" flush>
          <table className="data">
            <tbody>
              {expenditure.map(([category, amount]) => (
                <tr key={category}>
                  <td>{category}</td>
                  <td className="num neg">{exactMoney(amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">Total</td>
                <td className="num strong neg">{exactMoney(totalExpenditure)}</td>
              </tr>
              <tr>
                <td className="strong">Net</td>
                <td className={`num strong ${totalIncome + totalExpenditure < 0 ? 'neg' : 'pos'}`}>
                  {exactMoney(totalIncome + totalExpenditure)}
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid grid--2">
        <Panel title="Profitability & Sustainability">
          <p className="muted" style={{ marginTop: 0 }}>
            The EFL permits losses of {money(PS_ALLOWABLE_LOSS_3_YEARS)} across three seasons.
            Exceeding it means a transfer embargo, and a serious breach means a points deduction.
          </p>
          <table className="data">
            <tbody>
              {finances.seasonProfits.slice(-3).map((entry) => (
                <tr key={entry.season}>
                  <td>{entry.season}</td>
                  <td className={`num ${entry.profit < 0 ? 'neg' : 'pos'}`}>{exactMoney(entry.profit)}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">Rolling three-year loss</td>
                <td className={`num strong ${loss > PS_ALLOWABLE_LOSS_3_YEARS ? 'neg' : loss > PS_ALLOWABLE_LOSS_3_YEARS * 0.7 ? 'warn' : 'pos'}`}>
                  {exactMoney(loss)}
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Commercial and debt">
          <table className="data">
            <thead>
              <tr><th>Deal</th><th>Sponsor</th><th className="num">Annual</th><th className="num">Seasons left</th></tr>
            </thead>
            <tbody>
              {finances.sponsorships.map((sponsorship, index) => (
                <tr key={index}>
                  <td>{sponsorship.kind}</td>
                  <td>{sponsorship.sponsor}</td>
                  <td className="num">{money(sponsorship.annualValue)}</td>
                  <td className="num">{sponsorship.seasonsRemaining}</td>
                </tr>
              ))}
              {parachute && (
                <tr>
                  <td>Parachute payment</td>
                  <td className="muted">Year {parachute} of {PARACHUTE_PAYMENTS.length}</td>
                  <td className="num pos">{money(PARACHUTE_PAYMENTS[parachute - 1] ?? 0)}</td>
                  <td className="num">{PARACHUTE_PAYMENTS.length - parachute + 1}</td>
                </tr>
              )}
              {finances.loans.map((loan, index) => (
                <tr key={`loan-${index}`}>
                  <td className="neg">Bank loan</td>
                  <td className="muted">{(loan.rate * 100).toFixed(1)}% · {loan.weeksRemaining} weeks left</td>
                  <td className="num neg">{exactMoney(loan.weeklyPayment)}/w</td>
                  <td className="num">{money(loan.principal)}</td>
                </tr>
              ))}
              {finances.instalments.length > 0 && (
                <tr>
                  <td>Transfer instalments</td>
                  <td className="muted">{finances.instalments.length} outstanding</td>
                  <td className={`num ${finances.instalments.reduce((s, i) => s + i.amount, 0) < 0 ? 'neg' : 'pos'}`}>
                    {exactMoney(finances.instalments.reduce((s, i) => s + i.amount, 0))}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Recent transactions" flush>
        <div className="scroll-y" style={{ maxHeight: 400 }}>
          <table className="data">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {[...finances.ledger].reverse().slice(0, 250).map((entry, index) => (
                <tr key={index}>
                  <td className="mono faint small">{entry.date}</td>
                  <td className="muted">{entry.category}</td>
                  <td>{entry.description}</td>
                  <td className={`num ${entry.amount < 0 ? 'neg' : 'pos'}`}>{exactMoney(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
