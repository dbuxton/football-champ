/**
 * Stadium and facilities: ticket pricing, construction projects and the infrastructure that
 * quietly decides how good your youth intake is three seasons from now.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub } from '../../engine/gamestate';
import { makeBoardRequest, setTicketPrices } from '../../game/actions';
import { suggestedRequestAmount } from '../../engine/board';
import { BoardRequest } from '../../engine/gamestate';
import { Attr, Bar, ConfirmDialog, Field, Panel, exactMoney, money } from '../components';

const PROJECT_KINDS: { kind: BoardRequest['kind']; label: string; blurb: string }[] = [
  {
    kind: 'stadium-expansion',
    label: 'Expand the stadium',
    blurb: 'More seats mean more gate receipts every home game, but the build takes the best part of a season.',
  },
  {
    kind: 'new-stadium',
    label: 'Build a new stadium',
    blurb: 'A generational commitment. Around three years of construction and an enormous outlay, for a ground that transforms the club.',
  },
  {
    kind: 'training-upgrade',
    label: 'Upgrade the training ground',
    blurb: 'Better facilities mean faster player development and fewer injuries.',
  },
  {
    kind: 'youth-upgrade',
    label: 'Invest in the academy',
    blurb: 'Improves the quality of your annual youth intake. The payoff is two or three seasons away.',
  },
];

export function StadiumScreen() {
  const { state, refresh, showToast } = useGame();
  const club = getClub(state, state.manager.clubId);
  const [pending, setPending] = useState<{ kind: BoardRequest['kind']; amount: number } | null>(null);
  const [prices, setPrices] = useState(club.ticketPricing);

  const expectedPrice = Math.round(12 + club.reputation * 0.42);

  return (
    <>
      <div className="grid grid--2">
        <Panel title={club.stadiumName}>
          <table className="data">
            <tbody>
              <tr><td>Capacity</td><td className="num strong">{club.stadiumCapacity.toLocaleString()}</td></tr>
              <tr><td>Corporate seats</td><td className="num">{club.corporateSeats.toLocaleString()}</td></tr>
              <tr><td>Average attendance</td><td className="num">{averageAttendance(state, club.id).toLocaleString()}</td></tr>
              <tr>
                <td>Supporter happiness</td>
                <td className="num"><Bar value={club.fanHappiness} /></td>
              </tr>
              <tr><td>Fanbase</td><td className="num">{club.fanbase.toLocaleString()}</td></tr>
              <tr><td>Pitch quality</td><td className="num"><Attr value={club.facilities.pitchQuality} /></td></tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Facilities">
          <table className="data">
            <tbody>
              <tr><td>Training ground</td><td className="num"><Attr value={club.facilities.trainingGround} /></td></tr>
              <tr><td>Youth academy</td><td className="num"><Attr value={club.facilities.youthAcademy} /></td></tr>
              <tr><td>Youth recruitment</td><td className="num"><Attr value={club.facilities.youthRecruitment} /></td></tr>
              <tr><td>Medical department</td><td className="num"><Attr value={club.facilities.medical} /></td></tr>
              <tr><td>Data analysis</td><td className="num"><Attr value={club.facilities.dataAnalysis} /></td></tr>
              <tr><td>Corporate facilities</td><td className="num"><Attr value={club.facilities.corporateFacilities} /></td></tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Ticket pricing">
        <div className="grid grid--3">
          <Field label={`General admission (fans expect around £${expectedPrice})`}>
            <input
              type="number" min={5} max={120} value={prices.general}
              onChange={(e) => setPrices({ ...prices, general: Number(e.target.value) })}
            />
          </Field>
          <Field label="Season ticket">
            <input
              type="number" min={50} max={2500} step={10} value={prices.season}
              onChange={(e) => setPrices({ ...prices, season: Number(e.target.value) })}
            />
          </Field>
          <Field label="Corporate / hospitality">
            <input
              type="number" min={20} max={800} step={10} value={prices.corporate}
              onChange={(e) => setPrices({ ...prices, corporate: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => { setTicketPrices(state, prices); refresh(); showToast('Ticket prices updated.'); }}
          >
            Apply prices
          </button>
          <span className={prices.general > expectedPrice * 1.3 ? 'warn' : 'muted'}>
            {prices.general > expectedPrice * 1.3
              ? 'Well above what supporters at this level expect — attendances and goodwill will fall.'
              : prices.general < expectedPrice * 0.75
                ? 'Cheap. You will fill the ground but leave money on the table.'
                : 'Broadly in line with what supporters expect.'}
          </span>
        </div>
      </Panel>

      {club.projects.length > 0 && (
        <Panel title="Work in progress" flush>
          <table className="data">
            <thead>
              <tr><th>Project</th><th className="num">Cost</th><th className="num">Days left</th><th>Progress</th></tr>
            </thead>
            <tbody>
              {club.projects.map((project, index) => (
                <tr key={index}>
                  <td>{project.description}</td>
                  <td className="num">{money(project.cost)}</td>
                  <td className="num">{project.daysRemaining}</td>
                  <td>
                    <Bar
                      value={(project.totalDays - project.daysRemaining) / project.totalDays * 100}
                      tone="var(--blue)"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Ask the board to invest">
        <div className="grid grid--2">
          {PROJECT_KINDS.map((project) => {
            const amount = suggestedRequestAmount(state, project.kind);
            return (
              <div key={project.kind} className="panel" style={{ margin: 0 }}>
                <div className="panel__head">{project.label}</div>
                <div className="panel__body col">
                  <p className="muted small" style={{ margin: 0 }}>{project.blurb}</p>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="strong">{money(amount)}</span>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => setPending({ kind: project.kind, amount })}
                    >
                      Request
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="faint small" style={{ marginBottom: 0 }}>
          The board weighs your request against the club's finances, your record and how recently
          you last asked. Asking repeatedly makes approval less likely.
        </p>
      </Panel>

      {pending && (
        <ConfirmDialog
          title="Put this to the board?"
          confirmLabel="Make the request"
          body={
            <p>
              You are asking for <b>{exactMoney(pending.amount)}</b>. The club currently holds{' '}
              <b>{exactMoney(club.finances.balance)}</b>. A rejected request makes the next one
              harder.
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

function averageAttendance(state: ReturnType<typeof useGame>['state'], clubId: string): number {
  const attendances = state.fixtures
    .filter((f) => f.homeClubId === clubId && f.played && f.attendance)
    .map((f) => f.attendance as number);
  if (attendances.length === 0) return 0;
  return Math.round(attendances.reduce((a, b) => a + b, 0) / attendances.length);
}
