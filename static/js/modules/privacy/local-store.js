/** Versioned device storage. No network, credentials, cloud grants or route-cache changes. */
(function (root) {
  'use strict';

  const DB_NAME = 'voyagr-private-local',
    VERSION = 1;
  const CATEGORIES = ['routes', 'destinations', 'favourites', 'history', 'preferences', 'apiPreferences', 'dashcamSettings', 'traces', 'localOptions', 'legacy'];
  const copy = value => JSON.parse(JSON.stringify(value));
  function validOwner(owner) {
    return typeof owner === 'string' && /^(guest|sb:[A-Za-z0-9_-]{1,100}|legacy:unassigned)$/.test(owner);
  }
  function create(idb, options = {}) {
    let opening = null,
      connection = null;
    function open() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        if (!idb) {
          reject(Error('Device storage unavailable'));
          return;
        }
        let settled = false,
          req,
          timer;
        const fail = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          opening = null;
          reject(Error('Device storage could not be opened'));
        };
        try {
          req = idb.open(options.name || DB_NAME, VERSION);
        } catch (_) {
          fail();
          return;
        }
        timer = setTimeout(fail, options.timeout || 3000);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', {
            keyPath: ['owner', 'category']
          });
          if (!db.objectStoreNames.contains('journal')) db.createObjectStore('journal', {
            keyPath: 'id'
          });
          if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips', {
            keyPath: ['owner', 'id']
          });
          if (!db.objectStoreNames.contains('chunks')) {
            const store = db.createObjectStore('chunks', {
              keyPath: ['owner', 'id', 'index']
            });
            store.createIndex('clip', ['owner', 'id']);
          }
        };
        req.onerror = fail;
        req.onblocked = () => {}; // timeout is explicit; never delete a blocking database
        req.onsuccess = () => {
          if (settled) {
            req.result.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          connection = req.result;
          connection.onversionchange = () => {
            connection.close();
            connection = null;
            opening = null;
          };
          resolve(connection);
        };
      });
      // A rejected open must be retryable even when the executor failed synchronously.
      opening.catch(() => {
        opening = null;
      });
      return opening;
    }
    function check(owner, category) {
      if (!validOwner(owner) || category && !CATEGORIES.includes(category)) throw Error('Invalid device record scope');
    }
    async function transaction(stores, mode, run, guard = () => true) {
      const db = await open();
      if (!guard()) throw Error('Device owner changed');
      return new Promise((resolve, reject) => {
        let result, tx;
        try {
          tx = db.transaction(stores, mode);
        } catch (_) {
          reject(Error('Device storage unavailable'));
          return;
        }
        tx.oncomplete = () => guard() ? resolve(result) : reject(Error('Device owner changed'));
        tx.onabort = () => reject(Error('Device storage transaction failed'));
        tx.onerror = () => {};
        try {
          run(tx, value => {
            result = value;
          }, () => {
            if (!guard()) {
              tx.abort();
              return false;
            }
            return true;
          });
        } catch (_) {
          tx.abort();
        }
      });
    }
    async function read(owner, category) {
      check(owner, category);
      return transaction(['data'], 'readonly', (tx, done) => {
        const r = tx.objectStore('data').get([owner, category]);
        r.onsuccess = () => done(r.result ? copy(r.result.value) : null);
      });
    }
    async function update(owner, category, mutate, guard) {
      check(owner, category);
      return transaction(['data'], 'readwrite', (tx, done, current) => {
        const store = tx.objectStore('data'),
          r = store.get([owner, category]);
        r.onsuccess = () => {
          if (!current()) return;
          try {
            const next = mutate(r.result ? copy(r.result.value) : null);
            if (next && typeof next.then === 'function') throw Error('Async mutation');
            if (JSON.stringify(next).length > 12 * 1024 * 1024) throw Error('Record too large');
            store.put({
              owner,
              category,
              version: 1,
              value: copy(next),
              updatedAt: Date.now()
            });
            done(copy(next));
          } catch (_) {
            tx.abort();
          }
        };
      }, guard);
    }
    async function recordWithPermission(owner,category,mutate,permitted,guard){
      check(owner,category);
      if(!['history','destinations'].includes(category))throw Error('Invalid recording category');
      return transaction(['data'],'readwrite',(tx,done,current)=>{
        const data=tx.objectStore('data'),options=data.get([owner,'localOptions']);
        options.onsuccess=()=>{if(!current())return;if(!permitted(options.result?.value)){done(false);return;}
          const target=data.get([owner,category]);target.onsuccess=()=>{if(!current())return;
            try{const next=mutate(target.result?copy(target.result.value):null);
              if(next&&typeof next.then==='function'||JSON.stringify(next).length>12*1024*1024)throw Error('Invalid recording');
              data.put({owner,category,version:1,value:copy(next),updatedAt:Date.now()});done(true);
            }catch(_){tx.abort();}
          };
        };
      },guard);
    }
    async function migrate(storage) {
      // Capture only application data keys, never SDK tokens or all localStorage.
      const keys = ['voyagr_profiles_v1', 'savedRoutes', 'voyagr_all_settings', 'voyagrLocalTrips', 'voyagrRecentDestinations'];
      const raw = {};
      for (const key of keys) {
        const value = storage.getItem(key);
        if (value !== null) raw[key] = value;
      }
      const records = [];
      let profiles = {};
      try {
        profiles = JSON.parse(raw.voyagr_profiles_v1 || '{}');
      } catch (_) {}
      if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) for (const [owner, p] of Object.entries(profiles)) {
        if (!validOwner(owner) || owner === 'legacy:unassigned' || !p || typeof p !== 'object') continue;
        try {
          const routes = JSON.parse(p.savedRoutes || '[]');
          if (Array.isArray(routes)) records.push({
            owner,
            category: 'routes',
            value: routes
          });
        } catch (_) {}
        try {
          const prefs = JSON.parse(p.voyagr_all_settings || '{}');
          if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) records.push({
            owner,
            category: 'preferences',
            value: prefs
          });
        } catch (_) {}
      }
      // Shared/unparseable source data remains recoverable and is never assigned on login.
      records.push({
        owner: 'legacy:unassigned',
        category: 'legacy',
        value: raw
      });
      return transaction(['data', 'journal'], 'readwrite', (tx, done) => {
        const journal = tx.objectStore('journal'),
          check = journal.get('legacy-v1');
        check.onsuccess = () => {
          if (check.result) {
            done(check.result);
            return;
          }
          const data = tx.objectStore('data');
          for (const record of records) {
            data.put({
              ...record,
              version: 1,
              updatedAt: Date.now()
            });
          }
          const receipt = {
            id: 'legacy-v1',
            version: 1,
            records: records.length,
            completedAt: Date.now()
          };
          journal.put(receipt);
          done(receipt);
        };
      });
    }
    async function importGuest(owner, guard) {
      check(owner);
      if (owner === 'guest' || owner === 'legacy:unassigned') throw Error('Invalid import owner');
      return transaction(['data'], 'readwrite', (tx, done, current) => {
        const data = tx.objectStore('data');
        let remaining = 3;
        for (const category of ['routes', 'preferences', 'favourites']) {
          const target = data.get([owner, category]);
          target.onsuccess = () => {
            if (!current()) return;
            if (target.result && Object.keys(target.result.value || {}).length) {
              tx.abort();
              return;
            }
            const source = data.get(['guest', category]);
            source.onsuccess = () => {
              if (!current()) return;
              if (source.result) data.put({
                ...source.result,
                owner,
                updatedAt: Date.now()
              });
              if (! --remaining) done(true);
            };
          };
        }
      }, guard);
    }
    async function claimLegacy(owner, guard) {
      check(owner);
      if (owner === 'legacy:unassigned') throw Error('Invalid recovery owner');
      return transaction(['data', 'journal'], 'readwrite', (tx, done, current) => {
        const data = tx.objectStore('data'),
          journal = tx.objectStore('journal'),
          id = 'claim-v1:' + owner;
        const receipt = journal.get(id);
        receipt.onsuccess = () => {
          if (!current()) return;
          if (receipt.result) {
            done(false);
            return;
          }
          const source = data.get(['legacy:unassigned', 'legacy']);
          source.onsuccess = () => {
            if (!current()) return;
            try {
              const raw = source.result?.value || {},
                records = [];
              for (const [key, category] of [['savedRoutes', 'routes'], ['voyagrLocalTrips', 'history'], ['voyagrRecentDestinations', 'destinations']]) {
                if (!raw[key]) continue;
                let values = JSON.parse(raw[key]);
                if (!Array.isArray(values)) throw Error('Invalid recovery data');
                if (category === 'history') values = values.map((value, i) => ({
                  ...value,
                  localId: Date.now() * 1000 + i,
                  serverId: null
                }));
                records.push({
                  category,
                  values
                });
              }
              for (const {
                category,
                values
              } of records) {
                const r = data.get([owner, category]);
                r.onsuccess = () => {
                  if (!current()) return;
                  data.put({
                    owner,
                    category,
                    version: 1,
                    value: [...(r.result?.value || []), ...values],
                    updatedAt: Date.now()
                  });
                };
              }
              journal.put({
                id,
                completedAt: Date.now(),
                version: 1
              });
              done(true);
            } catch (_) {
              tx.abort();
            }
          };
        };
      }, guard);
    }
    async function listClips(owner) {
      check(owner);
      return transaction(['clips'], 'readonly', (tx, done) => {
        const r = tx.objectStore('clips').getAll();
        r.onsuccess = () => done(r.result.filter(x => x.owner === owner).map(copy));
      });
    }
    async function createClip(owner, mime) {
      check(owner);
      const id = 'clip-' + root.crypto.randomUUID();
      return transaction(['clips'], 'readwrite', (tx, done) => {
        const row = {
          owner,
          id,
          mime,
          status: 'recording',
          createdAt: Date.now(),
          bytes: 0,
          count: 0,
          points: [],
          version: 1
        };
        tx.objectStore('clips').add(row);
        done(copy(row));
      });
    }
    async function appendChunk(owner, id, blob) {
      check(owner);
      if (!blob || !blob.size) return;
      // Split unusually large MediaRecorder events; no complete-drive array in RAM.
      for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
        const part = blob.slice(offset, offset + 4 * 1024 * 1024, blob.type);
        await transaction(['clips', 'chunks'], 'readwrite', tx => {
          const clips = tx.objectStore('clips'),
            r = clips.get([owner, id]);
          r.onsuccess = () => {
            const row = r.result;
            if (!row || row.status !== 'recording') {
              tx.abort();
              return;
            }
            tx.objectStore('chunks').add({
              owner,
              id,
              index: row.count,
              blob: part
            });
            row.count++;
            row.bytes += part.size;
            clips.put(row);
          };
        });
      }
    }
    async function finishClip(owner, id, status = 'complete') {
      check(owner);
      return transaction(['clips'], 'readwrite', (tx, done) => {
        const s = tx.objectStore('clips'),
          r = s.get([owner, id]);
        r.onsuccess = () => {
          if (!r.result) {
            tx.abort();
            return;
          }
          const row = r.result;
          row.status = status === 'complete' && !row.bytes ? 'partial' : status;
          row.endedAt = Date.now();
          s.put(row);
          done(copy(row));
        };
      });
    }
    async function addPoint(owner, id, point) {
      check(owner);
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return;
      return transaction(['clips'], 'readwrite', tx => {
        const s = tx.objectStore('clips'),
          r = s.get([owner, id]);
        r.onsuccess = () => {
          const row = r.result;
          if (!row || row.status !== 'recording') return;
          if (row.points.length < 10000) {
            row.points.push(copy(point));
            s.put(row);
          }
        };
      });
    }
    async function clipBlob(owner, id) {
      check(owner);
      return transaction(['clips', 'chunks'], 'readonly', (tx, done) => {
        const r = tx.objectStore('clips').get([owner, id]);
        r.onsuccess = () => {
          if (!r.result) {
            tx.abort();
            return;
          }
          const mime = r.result.mime,
            parts = [];
          const cursor = tx.objectStore('chunks').index('clip').openCursor(root.IDBKeyRange.only([owner, id]));
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c) {
              parts.push(c.value.blob);
              c.continue();
            } else done(new Blob(parts, {
              type: mime
            }));
          };
        };
      });
    }
    async function deleteClip(owner, id) {
      check(owner);
      return transaction(['clips', 'chunks'], 'readwrite', tx => {
        tx.objectStore('clips').delete([owner, id]);
        const r = tx.objectStore('chunks').index('clip').openCursor(root.IDBKeyRange.only([owner, id]));
        r.onsuccess = () => {
          if (r.result) {
            r.result.delete();
            r.result.continue();
          }
        };
      });
    }
    async function clear(owner, category) {
      check(owner, category);
      return transaction(['data'], 'readwrite', tx => tx.objectStore('data').delete([owner, category]));
    }
    function close() {
      if (connection) connection.close();
      connection = null;
      opening = null;
    }
    return {
      open,
      read,
      update,
      migrate,
      recordWithPermission,
      claimLegacy,
      importGuest,
      listClips,
      createClip,
      appendChunk,
      finishClip,
      addPoint,
      clipBlob,
      deleteClip,
      clear,
      close
    };
  }
  const api = {
    create,
    DB_NAME,
    VERSION,
    CATEGORIES,
    validOwner
  };
  if (typeof module !== 'undefined') module.exports = api;
  root.VoyagrLocalStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
