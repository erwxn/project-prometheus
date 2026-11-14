const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const {createHash}=require('node:crypto');

function createArchiveService(filename = path.join(__dirname, 'data', 'vis-test.sqlite')) {
  if (!fs.existsSync(filename)) return null;
  const stat=fs.statSync(filename);
  const version=createHash('sha256').update(`${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0,24);
  let worker, failure, serial = 0;
  const pending = new Map(), shared = new Map();
  function finish(entry, error, result) {
    pending.delete(entry.id);
    if (shared.get(entry.key) === entry) shared.delete(entry.key);
    for (const listener of entry.listeners) {
      listener.signal?.removeEventListener('abort', listener.abort);
      error ? listener.reject(error) : listener.resolve(result);
    }
    if (!pending.size) worker.unref();
  }
  function start() {
    worker = new Worker(path.join(__dirname, 'archive-worker.js'), { workerData: { filename } });
    worker.unref();
    worker.on('message', message => {
      const entry = pending.get(message.id);
      if (entry) finish(entry, message.error ? Object.assign(Error(message.error), { status: message.status || 500 }) : null, message.result);
    });
    worker.on('error', error => {
      failure = error;
      for (const entry of pending.values()) finish(entry, error);
    });
  }
  return {
    version,
    query(kind, filters, signal) {
      if (failure) return Promise.reject(failure);
      if (signal?.aborted) return Promise.reject(Object.assign(Error('Archive request cancelled.'), { status: 499 }));
      if (!worker) start();
      const key = JSON.stringify([kind, filters]);
      let entry = shared.get(key);
      const fresh = !entry || Atomics.load(entry.cancel, 0);
      if (fresh) {
        entry = { id: ++serial, key, cancel: new Int32Array(new SharedArrayBuffer(4)), listeners: new Set() };
        pending.set(entry.id, entry);
        shared.set(key, entry);
      }
      const promise = new Promise((resolve, reject) => {
        const listener = { resolve, reject, signal, abort() {
          entry.listeners.delete(listener);
          reject(Object.assign(Error('Archive request cancelled.'), { status: 499 }));
          if (!entry.listeners.size) Atomics.store(entry.cancel, 0, 1);
        } };
        entry.listeners.add(listener);
        signal?.addEventListener('abort', listener.abort, { once: true });
      });
      worker.ref();
      if (fresh) worker.postMessage({ id: entry.id, kind, filters, cancel: entry.cancel });
      return promise;
    },
    close: () => worker?.terminate(),
  };
}
module.exports = { createArchiveService };
