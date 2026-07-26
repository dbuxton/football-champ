/**
 * Shared presentational building blocks: panels, tables, kit swatches, modals and the small
 * formatting helpers every screen needs.
 */

import React, { useMemo, useState } from 'react';
import { Club, Player, Position } from '../engine/types';
import { GameState } from '../engine/gamestate';
import { ageOf, averageForm, totalStats } from '../engine/players';
import { knowledgeOf, ownPlayerStars } from '../engine/scouting';
import { developmentDelta } from '../engine/progression';

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

export function money(value: number, options: { compact?: boolean; sign?: boolean } = {}): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? '-£' : options.sign && value > 0 ? '+£' : '£';
  if (options.compact !== false) {
    if (abs >= 1_000_000_000) return `${prefix}${(abs / 1_000_000_000).toFixed(2)}bn`;
    if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}m`;
    if (abs >= 1_000) return `${prefix}${Math.round(abs / 1_000)}k`;
  }
  return `${prefix}${Math.round(abs).toLocaleString()}`;
}

export function exactMoney(value: number): string {
  return `${value < 0 ? '-£' : '£'}${Math.round(Math.abs(value)).toLocaleString()}`;
}

/** Colour band for an attribute on the 1-20 scale. */
export function attrClass(value: number): string {
  return `attr attr-${Math.max(1, Math.min(8, Math.ceil(value / 2.5)))}`;
}

export function Attr({ value, colour = true }: { value: number; colour?: boolean }) {
  return <span className={colour ? attrClass(value) : 'attr'}>{value}</span>;
}

export function stars(count: number | null): string {
  if (count === null) return '—';
  const full = Math.floor(count);
  const half = count % 1 >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
}

/** Morale as a coloured dot with the number in the tooltip — legible at a glance. */
export function MoraleDot({ value }: { value: number }) {
  const label = value >= 80 ? 'Delighted' : value >= 62 ? 'Content' : value >= 45 ? 'Okay'
    : value >= 28 ? 'Unhappy' : 'Furious';
  const cls = value >= 62 ? 'pos' : value >= 45 ? '' : value >= 28 ? 'warn' : 'neg';
  return <span className={cls} title={`Morale ${Math.round(value)} — ${label}`}>●</span>;
}

/** Development since the season-start snapshot, as an arrow with the detail in the tooltip. */
export function DevArrow({ state, playerId }: { state: GameState; playerId: string }) {
  const delta = developmentDelta(state, playerId);
  if (!delta) return <span className="faint">–</span>;
  const { caDelta, changes } = delta;
  const glyph = caDelta >= 6 ? '▲▲' : caDelta >= 2 ? '▲' : caDelta <= -6 ? '▼▼' : caDelta <= -2 ? '▼' : '–';
  const cls = caDelta >= 2 ? 'pos' : caDelta <= -2 ? 'neg' : 'faint';
  const detail = changes.slice(0, 5)
    .map((c) => `${c.label} ${c.delta > 0 ? '+' : ''}${c.delta}`)
    .join(', ');
  const title = caDelta === 0
    ? 'No change since the season started'
    : `Ability ${caDelta > 0 ? '+' : ''}${caDelta} since the season started${detail ? ` — ${detail}` : ''}`;
  return <span className={cls} title={title}>{glyph}</span>;
}

// ---------------------------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------------------------

export function Kit({ club }: { club: Club | undefined }) {
  if (!club) return <span className="kit" style={{ background: '#333' }} />;
  return (
    <span
      className="kit"
      title={club.name}
      style={{
        background: `linear-gradient(135deg, ${club.colors.primary} 0 55%, ${club.colors.secondary} 55% 100%)`,
      }}
    />
  );
}

export function Panel({
  title,
  actions,
  children,
  flush,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="panel">
      {title && (
        <header className="panel__head">
          <span>{title}</span>
          <span className="spacer" />
          {actions}
        </header>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab${tab.id === active ? ' tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge ? <span className="nav__badge" style={{ marginLeft: 6 }}>{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <header className="modal__head">
          <span>{title}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn--small" onClick={onClose}>Close</button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Bar({
  value,
  max = 100,
  tone,
  showValue,
}: {
  value: number;
  max?: number;
  tone?: string;
  /** Print the number alongside the bar. Worth it wherever the exact figure matters. */
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colour = tone ?? (pct > 66 ? 'var(--accent-dim)' : pct > 33 ? 'var(--amber)' : 'var(--red)');
  const bar = (
    <span className="bar" title={`${Math.round(value)}`}>
      <span className="bar__fill" style={{ width: `${pct}%`, background: colour }} />
    </span>
  );
  if (!showValue) return bar;
  return (
    <span className="row" style={{ gap: 6 }}>
      {bar}
      <span className="mono" style={{ minWidth: 26, textAlign: 'right' }}>{Math.round(value)}%</span>
    </span>
  );
}

export function FormGuide({ form }: { form: string[] }) {
  if (form.length === 0) return <span className="faint">—</span>;
  return (
    <span>
      {form.map((result, index) => (
        <span key={index} className={`form-badge form-${result}`}>{result}</span>
      ))}
    </span>
  );
}

export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="option-row">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`option${option.value === value ? ' option--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.hint && <span className="option__hint">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sortable table
// ---------------------------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  label: string;
  numeric?: boolean;
  /** Value used for sorting; falls back to the rendered content. */
  sort?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
  title?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  defaultSort,
  rowClass,
  emptyMessage = 'Nothing to show.',
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  defaultSort?: { key: string; desc?: boolean };
  rowClass?: (row: T, index: number) => string | undefined;
  emptyMessage?: string;
  maxHeight?: number;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sort) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = column.sort!(a);
      const vb = column.sort!(b);
      const result = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sort.desc ? -result : result;
    });
    return copy;
  }, [rows, sort, columns]);

  const toggle = (key: string) => {
    const column = columns.find((c) => c.key === key);
    if (!column?.sort) return;
    setSort((current) =>
      current?.key === key ? { key, desc: !current.desc } : { key, desc: true });
  };

  if (rows.length === 0) {
    return <p className="muted" style={{ padding: 11, margin: 0 }}>{emptyMessage}</p>;
  }

  return (
    <div className="scroll-x" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="data">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.numeric ? 'num' : undefined}
                onClick={() => toggle(column.key)}
                title={column.title}
              >
                {column.label}
                {sort?.key === column.key ? (sort.desc ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={rowKey(row)}
              className={[onRowClick ? 'clickable' : '', rowClass?.(row, index) ?? ''].filter(Boolean).join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? 'num' : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Player table — used by the squad, transfer, scouting and shortlist screens
// ---------------------------------------------------------------------------------------------

export function playerStatusIcon(player: Player): React.ReactNode {
  if (player.injury) {
    return <span className="neg" title={`${player.injury.type} — ${player.injury.daysRemaining} days`}>✚</span>;
  }
  if (player.suspensionMatches > 0) {
    return <span className="warn" title={`Suspended for ${player.suspensionMatches} match(es)`}>■</span>;
  }
  if (player.loan) return <span className="muted" title="On loan">L</span>;
  if (player.transferListed) return <span className="warn" title="Transfer listed">T</span>;
  return null;
}

export function squadColumns(
  state: GameState,
  options: { showClub?: boolean; showValue?: boolean; showWage?: boolean; showKnowledge?: boolean } = {},
): Column<Player>[] {
  const columns: Column<Player>[] = [
    {
      key: 'no', label: '#', numeric: true,
      sort: (p) => p.squadNumber || 99,
      render: (p) => <span className="faint">{p.squadNumber || '—'}</span>,
    },
    {
      key: 'name', label: 'Name',
      sort: (p) => p.lastName,
      render: (p) => (
        <span className="row" style={{ gap: 5 }}>
          {playerStatusIcon(p)}
          <span>{p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName}</span>
        </span>
      ),
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
    {
      key: 'nat', label: 'Nat',
      sort: (p) => p.nationality,
      render: (p) => <span className="small muted">{abbreviateNation(p.nationality)}</span>,
    },
  ];

  if (options.showClub) {
    columns.push({
      key: 'club', label: 'Club',
      sort: (p) => state.clubs[p.clubId ?? '']?.name ?? 'zzz',
      render: (p) => {
        const club = state.clubs[p.clubId ?? ''];
        return club
          ? <span className="row" style={{ gap: 5 }}><Kit club={club} />{club.shortName}</span>
          : <span className="faint">Free agent</span>;
      },
    });
  }

  if (options.showKnowledge) {
    columns.push({
      key: 'stars', label: 'Ability', numeric: true,
      sort: (p) => knowledgeOf(state, p).stars ?? -1,
      title: 'What your scouts know. Send a scout to find out more.',
      render: (p) => {
        const knowledge = knowledgeOf(state, p);
        return <span className="gold small">{stars(knowledge.stars)}</span>;
      },
    });
    columns.push({
      key: 'potential', label: 'Potential', numeric: true,
      sort: (p) => knowledgeOf(state, p).potentialStars ?? -1,
      render: (p) => <span className="small faint">{stars(knowledgeOf(state, p).potentialStars)}</span>,
    });
  } else {
    // Your own players get stars relative to the division: three stars is par for your level.
    const leagueName = state.competitions[state.clubs[state.manager.clubId]?.leagueId ?? '']?.name ?? 'the division';
    columns.push({
      key: 'ca', label: 'Ability', numeric: true,
      sort: (p) => p.currentAbility,
      title: `Relative to ${leagueName} — three stars is par for the level`,
      render: (p) => (
        <span
          className="gold small"
          title={`Ability ${p.currentAbility}/200 — relative to ${leagueName}`}
        >
          {stars(ownPlayerStars(state, p).stars)}
        </span>
      ),
    });
    columns.push({
      key: 'pa', label: 'Potential', numeric: true,
      sort: (p) => p.potentialAbility,
      title: `How good he could become, relative to ${leagueName}`,
      render: (p) => (
        <span
          className="small faint"
          title={`Potential ${p.potentialAbility}/200 — relative to ${leagueName}`}
        >
          {stars(ownPlayerStars(state, p).potentialStars)}
        </span>
      ),
    });
  }

  columns.push(
    {
      key: 'cond', label: 'Cond', numeric: true,
      sort: (p) => p.condition,
      render: (p) => <Bar value={p.condition} />,
    },
    {
      key: 'morale', label: 'Mor', numeric: true,
      sort: (p) => p.morale,
      render: (p) => <Bar value={p.morale} />,
    },
    {
      key: 'apps', label: 'Apps', numeric: true,
      sort: (p) => totalStats(p).appearances + totalStats(p).substituteAppearances,
      render: (p) => {
        const s = totalStats(p);
        return s.substituteAppearances
          ? `${s.appearances} (${s.substituteAppearances})`
          : `${s.appearances}`;
      },
    },
    {
      key: 'goals', label: 'Gls', numeric: true,
      sort: (p) => totalStats(p).goals,
      render: (p) => totalStats(p).goals || <span className="faint">0</span>,
    },
    {
      key: 'assists', label: 'Ast', numeric: true,
      sort: (p) => totalStats(p).assists,
      render: (p) => totalStats(p).assists || <span className="faint">0</span>,
    },
    {
      key: 'rating', label: 'Av R', numeric: true,
      sort: (p) => {
        const s = totalStats(p);
        return s.appearances ? s.ratingSum / s.appearances : 0;
      },
      render: (p) => {
        const s = totalStats(p);
        const apps = s.appearances + s.substituteAppearances;
        if (!apps) return <span className="faint">—</span>;
        const average = s.ratingSum / apps;
        return <span className={average >= 7 ? 'pos strong' : average < 6.3 ? 'neg' : ''}>{average.toFixed(2)}</span>;
      },
    },
  );

  if (options.showValue !== false) {
    columns.push({
      key: 'value', label: 'Value', numeric: true,
      sort: (p) => p.value,
      render: (p) => money(p.value),
    });
  }
  if (options.showWage !== false) {
    columns.push({
      key: 'wage', label: 'Wage', numeric: true,
      sort: (p) => p.contract?.wage ?? 0,
      render: (p) => (p.contract ? `${money(p.contract.wage, { compact: false })}/w` : <span className="faint">—</span>),
    });
  }

  return columns;
}

const NATION_ABBREVIATIONS: Record<string, string> = {
  England: 'ENG', Scotland: 'SCO', Wales: 'WAL', 'Republic of Ireland': 'IRL',
  'Northern Ireland': 'NIR', France: 'FRA', Spain: 'ESP', Portugal: 'POR', Brazil: 'BRA',
  Netherlands: 'NED', Germany: 'GER', Italy: 'ITA', Denmark: 'DEN', Sweden: 'SWE',
  Norway: 'NOR', Nigeria: 'NGA', Ghana: 'GHA', Senegal: 'SEN', Jamaica: 'JAM',
  Argentina: 'ARG', Japan: 'JPN', Poland: 'POL', Belgium: 'BEL', 'United States': 'USA',
  'Ivory Coast': 'CIV', Croatia: 'CRO', Serbia: 'SRB', Switzerland: 'SUI', Turkey: 'TUR',
  Morocco: 'MAR', Egypt: 'EGY', Cameroon: 'CMR', Uruguay: 'URU', Colombia: 'COL',
  Mexico: 'MEX', Australia: 'AUS', 'South Korea': 'KOR', Greece: 'GRE', Austria: 'AUT',
  Ukraine: 'UKR', Hungary: 'HUN', Slovenia: 'SVN', Slovakia: 'SVK', 'Czech Republic': 'CZE',
  Iceland: 'ISL', Finland: 'FIN', Chile: 'CHI', Ecuador: 'ECU', Paraguay: 'PAR', Mali: 'MLI',
  'Burkina Faso': 'BFA', Gambia: 'GAM', Zimbabwe: 'ZIM', 'DR Congo': 'COD', Algeria: 'ALG',
  Tunisia: 'TUN', Panama: 'PAN', Georgia: 'GEO', Romania: 'ROU', Bulgaria: 'BUL',
  'Bosnia and Herzegovina': 'BIH', Montenegro: 'MNE', Albania: 'ALB', 'New Zealand': 'NZL',
  'Guinea-Bissau': 'GNB', Zambia: 'ZAM', 'Sierra Leone': 'SLE', Mozambique: 'MOZ',
  Uzbekistan: 'UZB', 'South Africa': 'RSA', Bermuda: 'BER', Namibia: 'NAM', Canada: 'CAN',
  Indonesia: 'IDN', Bangladesh: 'BAN', Israel: 'ISR', Kosovo: 'KOS', 'Cape Verde': 'CPV',
};

export function abbreviateNation(nation: string): string {
  return NATION_ABBREVIATIONS[nation] ?? nation.slice(0, 3).toUpperCase();
}

export function formLabel(player: Player): string {
  const average = averageForm(player);
  return average ? average.toFixed(2) : '—';
}

export function positionLabel(position: Position): string {
  return position;
}

/** A confirm dialog for irreversible decisions — part of the forgiving-mistakes remit. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
