import { LocalNote } from '@vinchi/shared';

export class IndexedDBNoteStorage {
  private dbName = 'VinchiWalletDB';
  private storeName = 'local_notes';
  private db: IDBDatabase | null = null;

  public async init(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) return;

    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'commitment' });
        }
      };
      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };
      request.onerror = (err) => reject(err);
    });
  }

  public async saveNote(note: LocalNote): Promise<void> {
    if (!this.db) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`vinchi_note_${note.commitment}`, JSON.stringify(note));
      }
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(note);
      tx.oncomplete = () => resolve();
      tx.onerror = (err) => reject(err);
    });
  }

  public async getNotes(): Promise<LocalNote[]> {
    if (!this.db) {
      if (typeof localStorage !== 'undefined') {
        const notes: LocalNote[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('vinchi_note_')) {
            try {
              notes.push(JSON.parse(localStorage.getItem(key)!));
            } catch {
              // ignore malformed keys
            }
          }
        }
        return notes;
      }
      return [];
    }
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (err) => reject(err);
    });
  }
}
