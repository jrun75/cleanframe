/* Your own wallpapers. Keeps uploaded photos on the TV (IndexedDB) and talks to the
   upload relay on your Mac. ES5, like the rest of the TV runtime. */
(function () {
  'use strict';

  var DB = 'cleanframe-uploads', STORE = 'wallpapers', KINDS = ['photo', 'thumb', 'panel', 'study-soft', 'field-clear', 'field-blur', 'field-frost'];
  var memory = [], dbPromise = null;
  var relay = String(window.CleanFrameRelay || '').replace(/\/+$/, '');

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (done, fail) {
      var req;
      try { req = window.indexedDB.open(DB, 1); } catch (e) { fail(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { done(req.result); };
      req.onerror = function () { fail(req.error || new Error('Storage unavailable')); };
      req.onblocked = function () { fail(new Error('Storage blocked')); };
    });
    return dbPromise;
  }
  function tx(mode, work) {
    return open().then(function (db) {
      return new Promise(function (done, fail) {
        var t = db.transaction(STORE, mode), result;
        result = work(t.objectStore(STORE));
        t.oncomplete = function () { done(result && result.result !== undefined ? result.result : result); };
        t.onerror = t.onabort = function () { fail(t.error || new Error('Storage failed')); };
      });
    });
  }

  /* Turn a stored record into the shape the wallpaper catalogue uses. */
  function toWall(record) {
    var m = record.meta || {}, urls = {};
    KINDS.forEach(function (k) { urls[k] = URL.createObjectURL(record.blobs[k]); });
    return {
      id: record.id, serverId: record.serverId || null, name: record.name, custom: true, created: record.created, urls: urls,
      tone: m.tone === 'light' ? 'light' : 'dark',
      ut: { tr: m.ut && m.ut.tr === 'mist' ? 'mist' : 'light', br: m.ut && m.ut.br === 'mist' ? 'mist' : 'light' },
      frostVeil: m.frostVeil === .2 ? .2 : .12, listColumn: 0, dockQuiet: false, clockMist: !!m.clockMist
    };
  }
  function release(w) { if (w && w.urls) KINDS.forEach(function (k) { try { URL.revokeObjectURL(w.urls[k]); } catch (e) {} }); }

  function load(done) {
    var finished = false;
    function finish(records) {
      if (finished) return; finished = true;
      records.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
      done(records.map(toWall));
    }
    setTimeout(function () { finish([]); }, 2500);
    tx('readonly', function (s) { return s.getAll(); }).then(function (r) { finish(r || []); }, function () { finish(memory.slice()); });
  }
  var seq = 0;
  function save(name, meta, blobs, serverId, created) {
    var record = { id: 'u' + Date.now().toString(36) + (seq++).toString(36), serverId: serverId || null, name: String(name || 'My photo').slice(0, 40), meta: meta || {}, created: created || new Date().toISOString(), blobs: blobs };
    return tx('readwrite', function (s) { s.put(record); }).then(function () { return toWall(record); }, function () { memory.push(record); return toWall(record); });
  }
  function remove(w) {
    memory = memory.filter(function (r) { return r.id !== w.id; });
    setTimeout(function () { release(w); }, 5000);
    if (relay && w.serverId) request('DELETE', relay + '/api/wallpapers/' + w.serverId, null, 6000).catch(function () {});
    return tx('readwrite', function (s) { s.delete(w.id); });
  }

  /* ---------- Relay on the Mac ---------- */
  function request(method, url, type, timeout) {
    return new Promise(function (done, fail) {
      var x = new XMLHttpRequest();
      x.open(method, url); x.timeout = timeout || 8000;
      if (type) x.responseType = type;
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) done(type ? x.response : JSON.parse(x.responseText || '{}'));
        else { var e = new Error('Relay replied ' + x.status); e.status = x.status; fail(e); }
      };
      x.onerror = x.ontimeout = function () { var e = new Error('Relay unreachable'); e.offline = true; fail(e); };
      x.send(method === 'POST' ? '{}' : null);
    });
  }
  function startSession() {
    if (!relay) { var e = new Error('No relay'); e.offline = true; e.unset = true; return Promise.reject(e); }
    return request('POST', relay + '/api/sessions');
  }
  function poll(code) { return request('GET', relay + '/api/sessions/' + code, null, 6000); }
  function download(info, progress) {
    var blobs = {}, i = 0;
    function next() {
      if (i >= KINDS.length) return Promise.resolve();
      var k = KINDS[i];
      return request('GET', relay + info.files[k], 'blob', 30000).then(function (b) { blobs[k] = b; i++; progress(i / KINDS.length); return next(); });
    }
    return next().then(function () { return save(info.name, info.meta, blobs, info.id, info.created); });
  }
  /* Bring back every photo saved on the Mac that this TV doesn't already have. */
  function restore(have, progress) {
    if (!relay) { var e = new Error('No relay'); e.offline = true; return Promise.reject(e); }
    return request('GET', relay + '/api/wallpapers', null, 8000).then(function (r) {
      var list = (r.wallpapers || []).filter(function (w) { return have.indexOf(w.id) < 0; }), added = [], i = 0;
      progress(0, list.length);
      function next() {
        if (i >= list.length) return Promise.resolve(added);
        return download(list[i], function () {}).then(function (w) { added.push(w); i++; progress(i, list.length); return next(); });
      }
      return next();
    });
  }

  /* ---------- Browser preview: pick a file on this computer ---------- */
  function fromFile(file, progress) {
    return new Promise(function (done, fail) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { done(img); };
      img.onerror = function () { fail(new Error('This file isn’t a photo the browser can open.')); };
      img.src = url;
    }).then(function (img) {
      var name = String(file.name || 'My photo').replace(/\.[^.]+$/, '');
      return window.CleanFramePrep.prepare(img, window.CleanFramePrep.centreCrop(img.naturalWidth, img.naturalHeight), progress)
        .then(function (out) { return save(name, out.meta, out.files); });
    });
  }

  window.CleanFrameUploads = {
    load: load, remove: remove, restore: restore, startSession: startSession, poll: poll, download: download, fromFile: fromFile,
    relay: relay, canPickFile: !window.tizen && !!window.CleanFramePrep
  };
})();
