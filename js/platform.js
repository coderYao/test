'use strict';
// ---------- portal adapter: the CrazyGames SDK when it is present, silent no-ops everywhere else ----------
// The SDK <script> is only added by tools/build_crazygames.py, so the plain web build never loads it.
const Platform = (() => {
  let sdk = null;        // window.CrazyGames.SDK, once initialised on a host that supports it
  let playing = false;   // last gameplay state reported, so start/stop are only sent on changes
  let onMute = null;

  const call = fn => { if (!sdk) return undefined; try { return fn(sdk); } catch (e) { console.warn('[platform]', e); return undefined; } };

  // never lets a slow or blocked SDK hold the game up
  async function init(timeoutMs = 3000) {
    const s = window.CrazyGames && window.CrazyGames.SDK;
    if (!s) return;
    try {
      await Promise.race([s.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timed out')), timeoutMs))]);
      if (s.environment !== 'disabled') sdk = s;
    } catch (e) { console.warn('[platform]', e); }
    call(k => k.game.addSettingsChangeListener(() => { if (onMute) onMute(muted()); }));
  }

  const muted = () => !!call(k => k.game.settings && k.game.settings.muteAudio);

  // report play / not-play (menus, pause, game over, ads); the portal uses this to time its own UI and ads
  function setPlaying(p) {
    if (p === playing) return;
    playing = p;
    call(k => p ? k.game.gameplayStart() : k.game.gameplayStop());
  }

  // a break ad between runs. Resolves when the ad is over, failed, was skipped for cooldown, or there is no SDK.
  function midgameAd(onStart, onEnd) {
    return new Promise(resolve => {
      if (!sdk) { resolve(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; if (onEnd) onEnd(); resolve(); };
      try {
        sdk.ad.requestAd('midgame', { adStarted: () => { if (onStart) onStart(); }, adFinished: finish, adError: finish });
      } catch (e) { console.warn('[platform]', e); finish(); }
    });
  }

  // progress: the SDK's data module (synced to the player's account) on the portal, localStorage elsewhere
  const storage = {
    get(key) { try { return sdk ? sdk.data.getItem(key) : localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { if (sdk) sdk.data.setItem(key, val); else localStorage.setItem(key, val); } catch (e) { /* private mode, quota */ } },
  };

  return {
    init, muted, setPlaying, midgameAd, storage,
    onMuteChange(cb) { onMute = cb; },
    loadingStart() { call(k => k.game.loadingStart()); },
    loadingStop() { call(k => k.game.loadingStop()); },
    happytime() { call(k => k.game.happytime()); },
    active: () => !!sdk,
  };
})();
