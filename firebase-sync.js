// ─────────────────────────────────────────────────────
// TouchPath — Firebase Auth + Firestore Sync
// ─────────────────────────────────────────────────────
// Handles Google sign-in and automatic data persistence.
// All data is stored under /users/{uid}/state/main in Firestore.
// ─────────────────────────────────────────────────────

(function() {
  'use strict';

  // ── Firebase references (set after init) ──
  let auth, db, provider;
  let currentUser = null;
  let _saveTimeout = null;
  let _isSyncing = false;
  let _initialized = false;

  const SAVE_DELAY = 1500;           // ms debounce before writing
  const STATE_DOC = 'state/main';    // Firestore document path
  const META_DOC  = 'meta/profile';  // User profile metadata

  // ── Initialize Firebase ──
  function initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('[TouchPath] Firebase SDK not loaded — running in offline mode.');
      _updateAuthUI(null);
      return;
    }

    if (typeof firebaseConfig === 'undefined' || firebaseConfig.apiKey === 'REPLACE_ME') {
      console.warn('[TouchPath] Firebase not configured — running in offline mode. See firebase-config.example.js');
      _updateAuthUI(null);
      return;
    }

    try {
      // Prevent double-init
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

      auth = firebase.auth();
      db = firebase.firestore();
      provider = new firebase.auth.GoogleAuthProvider();

      // Enable offline persistence (Firestore caches locally)
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[TouchPath] Firestore persistence unavailable (multiple tabs open).');
        } else if (err.code === 'unimplemented') {
          console.warn('[TouchPath] Firestore persistence not supported in this browser.');
        }
      });

      // Listen for auth state changes
      auth.onAuthStateChanged(user => {
        currentUser = user;
        _updateAuthUI(user);
        if (user) {
          _loadFromFirestore(user.uid);
          _saveUserMeta(user);
        }
      });

      _initialized = true;
      console.log('[TouchPath] Firebase initialized.');
    } catch (e) {
      console.error('[TouchPath] Firebase init error:', e);
      _updateAuthUI(null);
    }
  }

  // ── Auth: Sign in with Google ──
  function signIn() {
    if (!auth) {
      _showToast('Firebase niet geconfigureerd — zie README voor setup', true);
      return;
    }
    auth.signInWithPopup(provider).catch(err => {
      console.error('[TouchPath] Sign-in error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        _showToast('Inloggen mislukt: ' + err.message, true);
      }
    });
  }

  // ── Auth: Sign out ──
  function signOut() {
    if (!auth) return;
    auth.signOut().then(() => {
      _showToast('Uitgelogd — data blijft lokaal bewaard');
    }).catch(err => {
      console.error('[TouchPath] Sign-out error:', err);
    });
  }

  // ── Load data from Firestore ──
  function _loadFromFirestore(uid) {
    if (!db) return;
    _isSyncing = true;

    const docRef = db.collection('users').doc(uid).collection('state').doc('main');

    docRef.get().then(snap => {
      if (snap.exists) {
        const data = snap.data();

        // Restore touchpoints (with Date objects)
        if (data.touchpoints && Array.isArray(data.touchpoints)) {
          // Clear existing
          window.touchpoints = data.touchpoints.map(tp => ({
            ...tp,
            ts: tp.ts && tp.ts.toDate ? tp.ts.toDate() : new Date(tp.ts)
          }));
        }

        // Restore accounts
        if (data.accounts && typeof data.accounts === 'object') {
          window.accounts = data.accounts;
        }

        // Restore CRM data
        if (data.crmData && typeof data.crmData === 'object') {
          window.crmData = {};
          Object.entries(data.crmData).forEach(([key, crm]) => {
            window.crmData[key] = {
              ...crm,
              notes: (crm.notes || []).map(n => ({
                ...n,
                ts: n.ts && n.ts.toDate ? n.ts.toDate() : new Date(n.ts)
              }))
            };
          });
        }

        // Re-render everything
        if (typeof renderAll === 'function') renderAll();
        _showToast('✓ Data geladen vanuit cloud');
        console.log(`[TouchPath] Loaded: ${window.touchpoints.length} touchpoints, ${Object.keys(window.accounts).length} accounts`);
      } else {
        console.log('[TouchPath] No cloud data found — starting fresh.');
      }

      _isSyncing = false;
    }).catch(err => {
      console.error('[TouchPath] Firestore load error:', err);
      _isSyncing = false;
      _showToast('⚠ Laden mislukt — werk offline door', true);
    });
  }

  // ── Save data to Firestore (debounced) ──
  function saveToFirestore() {
    if (!_initialized || !currentUser || !db || _isSyncing) return;

    clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
      _doSave();
    }, SAVE_DELAY);
  }

  function _doSave() {
    if (!currentUser || !db) return;

    const uid = currentUser.uid;
    const docRef = db.collection('users').doc(uid).collection('state').doc('main');

    // Serialize touchpoints (Firestore can handle Date objects via Timestamp)
    const tpData = (window.touchpoints || []).map(tp => ({
      ...tp,
      ts: tp.ts instanceof Date ? firebase.firestore.Timestamp.fromDate(tp.ts) : tp.ts
    }));

    // Serialize CRM notes timestamps
    const crmSerialized = {};
    Object.entries(window.crmData || {}).forEach(([key, crm]) => {
      crmSerialized[key] = {
        ...crm,
        notes: (crm.notes || []).map(n => ({
          ...n,
          ts: n.ts instanceof Date ? firebase.firestore.Timestamp.fromDate(n.ts) : n.ts
        }))
      };
    });

    const payload = {
      touchpoints: tpData,
      accounts:    window.accounts || {},
      crmData:     crmSerialized,
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    docRef.set(payload, { merge: true }).then(() => {
      _updateSyncIndicator('saved');
      console.log('[TouchPath] Saved to Firestore.');
    }).catch(err => {
      console.error('[TouchPath] Save error:', err);
      _updateSyncIndicator('error');
    });
  }

  // ── Save user profile metadata ──
  function _saveUserMeta(user) {
    if (!db || !user) return;
    const metaRef = db.collection('users').doc(user.uid).collection('meta').doc('profile');
    metaRef.set({
      displayName: user.displayName || '',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  }

  // ── UI: Update auth button / avatar ──
  function _updateAuthUI(user) {
    const container = document.getElementById('auth-container');
    if (!container) return;

    if (user) {
      const photoURL = user.photoURL || '';
      const initial = (user.displayName || user.email || '?')[0].toUpperCase();
      const name = (user.displayName || user.email || '').split(' ')[0];
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <div id="sync-indicator" style="width:6px;height:6px;border-radius:50%;background:#22C55E;flex-shrink:0;transition:background 0.3s" title="Gesynchroniseerd"></div>
          <span style="font-size:12px;color:var(--text-3);font-weight:500;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
          ${photoURL
            ? `<img src="${photoURL}" alt="" style="width:28px;height:28px;border-radius:50%;cursor:pointer;border:1px solid var(--border)" onclick="window._touchpathAuth.signOut()" title="Uitloggen" />`
            : `<div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:white;display:grid;place-items:center;font-size:12px;font-weight:700;cursor:pointer" onclick="window._touchpathAuth.signOut()" title="Uitloggen">${initial}</div>`
          }
        </div>`;
    } else {
      // Check if Firebase is configured
      const isConfigured = typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey !== 'REPLACE_ME';
      if (isConfigured) {
        container.innerHTML = `
          <button class="btn btn-secondary btn-sm" onclick="window._touchpathAuth.signIn()" style="gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Inloggen
          </button>`;
      } else {
        container.innerHTML = `
          <span style="font-size:11px;color:var(--text-3);padding:4px 8px;background:rgba(0,0,0,0.04);border-radius:6px" title="Configureer Firebase in js/firebase-config.js">Offline modus</span>`;
      }
    }
  }

  // ── UI: Sync indicator (green/yellow/red dot) ──
  function _updateSyncIndicator(status) {
    const dot = document.getElementById('sync-indicator');
    if (!dot) return;
    const colors = { saved: '#22C55E', saving: '#EAB308', error: '#EF4444' };
    const titles = { saved: 'Gesynchroniseerd', saving: 'Opslaan...', error: 'Synchronisatiefout' };
    dot.style.background = colors[status] || colors.saved;
    dot.title = titles[status] || '';
  }

  // ── Toast helper (reuse app toast if available) ──
  function _showToast(msg, isError) {
    if (typeof window.toast === 'function') {
      window.toast(msg, isError);
    } else {
      console.log('[TouchPath]', msg);
    }
  }

  // ── Hook into the app's renderAll to trigger auto-save ──
  function hookAutoSave() {
    // Wrap the original renderAll
    const _originalRenderAll = window.renderAll;
    if (typeof _originalRenderAll === 'function') {
      window.renderAll = function() {
        _originalRenderAll.apply(this, arguments);
        saveToFirestore();
      };
    }

    // Also hook CRM mutations that don't call renderAll
    const hooksNeeded = ['saveCrmField', 'addNote', 'deleteNote', 'addContact', 'deleteContact', 'addTask', 'toggleTask', 'deleteTask', 'setStatus'];
    hooksNeeded.forEach(fnName => {
      const original = window[fnName];
      if (typeof original === 'function') {
        window[fnName] = function() {
          const result = original.apply(this, arguments);
          saveToFirestore();
          return result;
        };
      }
    });

    console.log('[TouchPath] Auto-save hooks installed.');
  }

  // ── Expose public API ──
  window._touchpathAuth = { signIn, signOut, saveToFirestore };

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    // Hook auto-save after a short delay to ensure app is initialized
    setTimeout(hookAutoSave, 500);
  });

})();
