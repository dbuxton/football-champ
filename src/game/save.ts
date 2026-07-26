/**
 * Saving and loading.
 *
 * Saves live in localStorage, compressed, with an IndexedDB fallback for the rare case where a
 * long career outgrows the quota. Every save can also be exported to a file, because a browser
 * clearing its storage should never cost somebody a ten-season dynasty.
 */

import { GameState, SAVE_VERSION, captureDevSnapshots } from '../engine/gamestate';
import { deriveObjectivesFromExpectation } from '../engine/board';
import { compress, decompress, byteSize } from './compress';

const INDEX_KEY = 'football-champ:saves';
const SLOT_PREFIX = 'football-champ:save:';
const SETTINGS_KEY = 'football-champ:settings';
const DB_NAME = 'football-champ';
const DB_STORE = 'saves';

export interface SaveSlotMeta {
  id: string;
  name: string;
  managerName: string;
  clubName: string;
  season: string;
  date: string;
  savedAt: string;
  /** Where the payload actually lives. */
  storage: 'local' | 'indexeddb';
  sizeBytes: number;
}

export interface UiSettings {
  matchSpeed: 'slow' | 'normal' | 'fast';
  showAttributeColours: boolean;
  confirmRiskyActions: boolean;
  theme: 'classic' | 'dark';
}

export const DEFAULT_SETTINGS: UiSettings = {
  matchSpeed: 'normal',
  showAttributeColours: true,
  confirmRiskyActions: true,
  theme: 'classic',
};

// ---------------------------------------------------------------------------------------------
// Slot index
// ---------------------------------------------------------------------------------------------

export function listSaves(): SaveSlotMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveSlotMeta[];
    return parsed.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

function writeIndex(slots: SaveSlotMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(slots));
}

function upsertSlot(meta: SaveSlotMeta): void {
  const slots = listSaves().filter((s) => s.id !== meta.id);
  slots.push(meta);
  writeIndex(slots);
}

// ---------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------

export async function saveGame(state: GameState, slotId: string, name: string): Promise<SaveSlotMeta> {
  const payload = compress(JSON.stringify(state));
  const meta: SaveSlotMeta = {
    id: slotId,
    name,
    managerName: `${state.manager.firstName} ${state.manager.lastName}`,
    clubName: state.clubs[state.manager.clubId]?.name ?? 'Unknown',
    season: state.season,
    date: state.date,
    savedAt: new Date().toISOString(),
    storage: 'local',
    sizeBytes: byteSize(payload),
  };

  try {
    localStorage.setItem(SLOT_PREFIX + slotId, payload);
  } catch {
    // Quota exceeded — fall back to IndexedDB, which has far more room.
    await idbPut(slotId, payload);
    localStorage.removeItem(SLOT_PREFIX + slotId);
    meta.storage = 'indexeddb';
  }

  upsertSlot(meta);
  return meta;
}

export async function loadGame(slotId: string): Promise<GameState | null> {
  const meta = listSaves().find((s) => s.id === slotId);
  let payload: string | null = null;

  if (!meta || meta.storage === 'local') {
    payload = localStorage.getItem(SLOT_PREFIX + slotId);
  }
  if (payload === null) {
    payload = await idbGet(slotId);
  }
  if (payload === null) return null;

  try {
    const json = decompress(payload);
    return migrate(JSON.parse(json) as GameState);
  } catch (error) {
    console.error('Failed to load save', error);
    return null;
  }
}

export async function deleteSave(slotId: string): Promise<void> {
  localStorage.removeItem(SLOT_PREFIX + slotId);
  await idbDelete(slotId);
  writeIndex(listSaves().filter((s) => s.id !== slotId));
}

/** Autosave, always to the same reserved slot. */
export async function autosave(state: GameState): Promise<void> {
  await saveGame(state, 'autosave', 'Autosave');
}

// ---------------------------------------------------------------------------------------------
// Export and import
// ---------------------------------------------------------------------------------------------

export function exportSaveFile(state: GameState): void {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `football-champ-${state.clubs[state.manager.clubId]?.shortName ?? 'save'}-${state.season.replace('/', '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function importSaveFile(file: File): Promise<GameState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as GameState;
  if (typeof parsed.version !== 'number' || !parsed.manager) {
    throw new Error('That does not look like a Football Champ save file.');
  }
  return migrate(parsed);
}

// ---------------------------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------------------------

/** Upgrade older saves. Migrations chain, each bumping `version`, so no career is orphaned. */
export function migrate(state: GameState): GameState {
  let migrated = state;

  if (migrated.version < 2) {
    // v2: development snapshots, the training-report baseline, and season objectives.
    migrated = { ...migrated, version: 2 };
    migrated.attributeSnapshots = {};
    migrated.lastTrainingReportCA = null;
    captureDevSnapshots(migrated);
    const club = migrated.clubs[migrated.manager.clubId];
    if (club && !club.board.objectives) {
      club.board.objectives = deriveObjectivesFromExpectation(migrated);
    }
  }

  if (migrated.version < SAVE_VERSION) {
    migrated = { ...migrated, version: SAVE_VERSION };
  }

  // Defensive defaults for fields that might be missing from an older save.
  migrated.shortlist ??= [];
  migrated.scoutReports ??= [];
  migrated.boardRequests ??= [];
  migrated.parachuteYears ??= {};
  migrated.processedToday ??= [];
  migrated.playoffs ??= {};
  migrated.training ??= { schedule: 'Balanced', intensity: 3, individual: {} };
  migrated.pendingStop ??= { kind: 'none' };
  migrated.lastUndo ??= null;
  migrated.attributeSnapshots ??= {};
  migrated.lastTrainingReportCA ??= null;

  return migrated;
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export function loadSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UiSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------------------------
// IndexedDB fallback
// ---------------------------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve((request.result as string) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Nothing to clean up.
  }
}

/** Snapshot for the undo guardrail. Kept in memory, not persisted. */
export function snapshot(state: GameState): string {
  return JSON.stringify(state);
}

export function restore(snapshotJson: string): GameState {
  return migrate(JSON.parse(snapshotJson) as GameState);
}
