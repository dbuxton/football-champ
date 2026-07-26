/**
 * Backroom staff: who you have, what they're good at, and getting rid of the ones who aren't.
 */

import { useState } from 'react';
import { useGame } from '../GameContext';
import { getClub, staffOf } from '../../engine/gamestate';
import { Staff, StaffRole } from '../../engine/types';
import { yearsBetween } from '../../engine/date';
import { sackStaff } from '../../game/actions';
import { Attr, ConfirmDialog, Panel, exactMoney } from '../components';

/** Which attributes matter for each role, so the table shows the ones that count. */
const RELEVANT: Record<StaffRole, (keyof Staff['attributes'])[]> = {
  'Assistant Manager': ['tactical', 'manManagement', 'motivating', 'judgingAbility'],
  Coach: ['attacking', 'defending', 'technical', 'tactical'],
  'Goalkeeping Coach': ['goalkeeping', 'technical', 'motivating'],
  'Fitness Coach': ['fitness', 'motivating', 'discipline'],
  Physio: ['physiotherapy', 'fitness'],
  Scout: ['judgingAbility', 'judgingPotential'],
  'Head of Youth': ['youth', 'judgingPotential', 'manManagement'],
};

export function StaffScreen() {
  const { state, refresh, showToast } = useGame();
  const club = getClub(state, state.manager.clubId);
  const staff = staffOf(state, club.id);
  const [sacking, setSacking] = useState<Staff | null>(null);

  const grouped = staff.reduce<Record<string, Staff[]>>((acc, member) => {
    (acc[member.role] ??= []).push(member);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(grouped).map(([role, members]) => (
        <Panel key={role} title={role} flush>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th><th className="num">Age</th><th>Nationality</th>
                {RELEVANT[role as StaffRole].map((key) => (
                  <th key={key} className="num">{formatAttributeName(key)}</th>
                ))}
                <th className="num">Wage</th><th>Contract</th><th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.firstName} {member.lastName}</td>
                  <td className="num">{yearsBetween(member.birthDate, state.date)}</td>
                  <td className="muted">{member.nationality}</td>
                  {RELEVANT[role as StaffRole].map((key) => (
                    <td key={key} className="num"><Attr value={member.attributes[key]} /></td>
                  ))}
                  <td className="num">{exactMoney(member.wage)}/w</td>
                  <td className="mono faint small">{member.contractExpires}</td>
                  <td className="num">
                    <button
                      type="button"
                      className="btn btn--small btn--danger"
                      onClick={() => setSacking(member)}
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}

      <Panel title="How your staff affect the club">
        <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Coaches drive how quickly players improve in training. The best one in each discipline matters most, but depth helps.</li>
          <li>Physios shorten injury layoffs, alongside your medical facilities.</li>
          <li>Scouts decide how accurate your reports on other clubs' players are — a bad scout gives you confidently wrong numbers.</li>
          <li>Your Head of Youth shapes both the quality of the annual intake and how reliably it is assessed.</li>
          <li>The assistant manager picks the side and manages the bench when you hand it over.</li>
        </ul>
      </Panel>

      {sacking && (
        <ConfirmDialog
          title={`Dismiss ${sacking.shortName}?`}
          danger
          confirmLabel="Dismiss"
          body={
            <p>
              You will have to pay up a share of the remaining contract, and the role will sit
              vacant until it is filled — which will hurt training, recovery or scouting depending
              on the job.
            </p>
          }
          onCancel={() => setSacking(null)}
          onConfirm={() => {
            const result = sackStaff(state, sacking.id);
            refresh();
            showToast(result.message, !result.ok);
            setSacking(null);
          }}
        />
      )}
    </>
  );
}

function formatAttributeName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace('Judging ', 'Judge ');
}
