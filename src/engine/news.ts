/**
 * The news inbox — the spine of the game's pacing. Everything that happens to the manager
 * arrives here, and some items carry an interactive decision.
 */

import { NewsAction, NewsCategory, NewsItem } from './types';
import { GameState } from './gamestate';
import { nextId } from './players';

export interface NewsDraft {
  category: NewsCategory;
  subject: string;
  body: string;
  important?: boolean;
  action?: NewsAction;
  relatedClubId?: string;
  relatedPlayerId?: string;
  /** Override the date; defaults to today. */
  date?: string;
}

export function addNews(state: GameState, draft: NewsDraft): NewsItem {
  const item: NewsItem = {
    id: nextId('n'),
    date: draft.date ?? state.date,
    category: draft.category,
    subject: draft.subject,
    body: draft.body,
    read: false,
    important: draft.important ?? false,
    action: draft.action,
    relatedClubId: draft.relatedClubId,
    relatedPlayerId: draft.relatedPlayerId,
  };
  state.news.unshift(item);
  // The inbox is unbounded in principle but a long career would bloat the save; keep it to a
  // generous but finite window.
  if (state.news.length > 500) state.news.length = 500;
  return item;
}

export function markRead(state: GameState, id: string): void {
  const item = state.news.find((n) => n.id === id);
  if (item) item.read = true;
}

export function markAllRead(state: GameState): void {
  for (const item of state.news) item.read = true;
}

export function newsRequiringAction(state: GameState): NewsItem[] {
  return state.news.filter(
    (n) => !n.read && n.action && n.action.kind !== 'acknowledge',
  );
}

/** Items that should halt the day-advance loop. */
export function stoppingNews(state: GameState, since: string): NewsItem[] {
  return state.news.filter((n) => n.date >= since && !n.read && (n.important || Boolean(n.action)));
}
