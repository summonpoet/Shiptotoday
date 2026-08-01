(function initBrowserPlatform(global) {
  'use strict';

  const memoryStore = new Map();
  let notificationRegistration = null;
  const isTauri = Boolean(global.__TAURI_INTERNALS__ || global.__TAURI__);
  const isCapacitor = Boolean(
    global.Capacitor &&
    typeof global.Capacitor.isNativePlatform === 'function' &&
    global.Capacitor.isNativePlatform()
  );
  const capacitorPlugins = global.Capacitor && global.Capacitor.Plugins
    ? global.Capacitor.Plugins
    : {};
  const localNotifications = capacitorPlugins.LocalNotifications;
  const capacitorApp = capacitorPlugins.App;
  const focusLiveActivity = capacitorPlugins.FocusLiveActivity;
  const isLocalWindowsPreview =
    /^(localhost|127\.0\.0\.1)$/.test(global.location.hostname) &&
    new URLSearchParams(global.location.search).get('platform') === 'windows';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  const storage = {
    readJSON(key, fallback) {
      if (memoryStore.has(key)) return clone(memoryStore.get(key));
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value == null ? clone(fallback) : value;
      } catch(e) {
        return clone(fallback);
      }
    },
    writeJSON(key, value) {
      memoryStore.set(key, clone(value));
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch(e) {
        return false;
      }
    },
  };

  function createPulse(onPulse) {
    if (!global.Worker) {
      const intervalId = setInterval(onPulse, 1000);
      return { stop:() => clearInterval(intervalId) };
    }
    try {
      const source = `let pulse=null;onmessage=e=>{
        if(e.data==='start'){clearInterval(pulse);pulse=setInterval(()=>postMessage('pulse'),1000);}
        else if(e.data==='stop'){clearInterval(pulse);close();}
      };`;
      const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = onPulse;
      worker.postMessage('start');
      return { stop:() => worker.terminate() };
    } catch(e) {
      const intervalId = setInterval(onPulse, 1000);
      return { stop:() => clearInterval(intervalId) };
    }
  }

  async function ensureNotificationServiceWorker() {
    if (isTauri) return null;
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return null;
    if (notificationRegistration) return notificationRegistration;
    try {
      notificationRegistration = await navigator.serviceWorker.register('./dingding_notifications_sw.js');
      return notificationRegistration;
    } catch(e) {
      return null;
    }
  }

  const notifications = {
    async requestPermission() {
      if (isCapacitor && localNotifications) {
        try {
          const current = await localNotifications.checkPermissions();
          if (current.display === 'granted') return 'granted';
          const result = await localNotifications.requestPermissions();
          return result.display;
        } catch(e) {
          return 'denied';
        }
      }
      if (isTauri) return 'granted';
      if (!('Notification' in global)) return 'unsupported';
      if (Notification.permission === 'granted') {
        await ensureNotificationServiceWorker();
        return 'granted';
      }
      if (Notification.permission !== 'default') return Notification.permission;
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') await ensureNotificationServiceWorker();
        return permission;
      } catch(e) {
        return 'denied';
      }
    },
    async showCheckIn() {
      if (isCapacitor && localNotifications) {
        try {
          await localNotifications.schedule({
            notifications:[{
              id:74101,
              title:'Check-in Time',
              body:'How is your brain right now?',
              schedule:{at:new Date(Date.now() + 100)},
              extra:{route:'checkin'},
            }],
          });
          return true;
        } catch(e) {
          console.warn('native notification:', e);
          return false;
        }
      }
      if (isTauri) {
        try {
          await global.__TAURI__.core.invoke('show_checkin_notification');
          return true;
        } catch(e) {
          console.warn('native notification:', e);
          return false;
        }
      }
      if (!('Notification' in global) || Notification.permission !== 'granted') return false;
      const options = {
        body:'How is your brain right now?', tag:'ddz-checkin', renotify:true,
        requireInteraction:true, data:{url:location.href},
      };
      try {
        const registration = await ensureNotificationServiceWorker();
        if (registration) {
          await registration.showNotification('Check-in Time', options);
          return true;
        }
        const note = new Notification('Check-in Time', options);
        note.onclick = () => { global.focus(); note.close(); };
        return true;
      } catch(e) {
        return false;
      }
    },
    async scheduleSessionEvent({kind, at, taskName}) {
      if (!isCapacitor || !localNotifications) return false;
      const notificationId = kind === 'finish' ? 74102 : 74101;
      try {
        await this.cancelSessionEvents();
        await localNotifications.schedule({
          notifications:[{
            id:notificationId,
            title:kind === 'finish' ? 'Focus session complete' : 'Check-in Time',
            body:kind === 'finish'
              ? `${taskName || 'Your task'} is ready to wrap up.`
              : `How is your brain during ${taskName || 'this task'}?`,
            schedule:{at:new Date(at)},
            extra:{route:kind === 'finish' ? 'timer' : 'checkin', kind},
          }],
        });
        return true;
      } catch(e) {
        console.warn('schedule native notification:', e);
        return false;
      }
    },
    async cancelSessionEvents() {
      if (!isCapacitor || !localNotifications) return false;
      try {
        await localNotifications.cancel({
          notifications:[{id:74101}, {id:74102}],
        });
        return true;
      } catch(e) {
        return false;
      }
    },
  };

  const liveActivity = {
    async start(state) {
      if (!isCapacitor || !focusLiveActivity) return false;
      try {
        const result = await focusLiveActivity.start(state);
        return result && result.enabled !== false;
      } catch(e) {
        console.warn('start Live Activity:', e);
        return false;
      }
    },
    async update(state) {
      if (!isCapacitor || !focusLiveActivity) return false;
      try {
        const result = await focusLiveActivity.update(state);
        return Boolean(result && result.updated);
      } catch(e) {
        console.warn('update Live Activity:', e);
        return false;
      }
    },
    async end(taskID) {
      if (!isCapacitor || !focusLiveActivity) return false;
      try {
        await focusLiveActivity.end(taskID ? {taskID} : {});
        return true;
      } catch(e) {
        console.warn('end Live Activity:', e);
        return false;
      }
    },
  };

  const resumeCallbacks = new Set();
  const pauseCallbacks = new Set();
  const openUrlCallbacks = new Set();
  const lifecycle = {
    onResume(callback) {
      resumeCallbacks.add(callback);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) callback();
      });
      global.addEventListener('focus', callback);
    },
    onPause(callback) {
      pauseCallbacks.add(callback);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) callback();
      });
      global.addEventListener('blur', callback);
    },
    onOpenUrl(callback) {
      openUrlCallbacks.add(callback);
    },
  };

  const activity = {
    watch({idleMs, onIdle, onActive}) {
      let lastActivityAt = Date.now();
      let timeoutId = null;
      let nativePollId = null;
      let nativeWasIdle = false;
      let suspended = false;
      let stopped = false;
      const events = ['pointermove', 'pointerdown', 'keydown', 'touchstart'];

      const arm = () => {
        clearTimeout(timeoutId);
        if (stopped || suspended) return;
        const delay = Math.max(0, lastActivityAt + idleMs - Date.now());
        timeoutId = setTimeout(checkIdle, delay);
      };
      const checkIdle = () => {
        if (stopped) return;
        const idleAt = lastActivityAt + idleMs;
        if (Date.now() < idleAt) { arm(); return; }
        if (onIdle) onIdle(idleAt);
      };
      const noteActivity = () => {
        if (stopped) return;
        lastActivityAt = Date.now();
        if (onActive) onActive(lastActivityAt);
        arm();
      };

      const pollSystemActivity = async () => {
        if (stopped || !isTauri) return;
        try {
          const systemIdleMs = await global.__TAURI__.core.invoke('system_idle_ms');
          const now = Date.now();
          lastActivityAt = now - Math.max(0, Number(systemIdleMs) || 0);
          const isIdle = systemIdleMs >= idleMs;
          if (isIdle) {
            nativeWasIdle = true;
            if (onIdle) onIdle(lastActivityAt + idleMs);
          } else {
            if (nativeWasIdle && onActive) onActive(now);
            nativeWasIdle = false;
            arm();
          }
        } catch(e) {
          // The page-level watcher below remains the safe fallback.
        }
        if (!stopped) nativePollId = setTimeout(pollSystemActivity, 1000);
      };

      events.forEach(eventName =>
        document.addEventListener(eventName, noteActivity, {passive:true})
      );
      const handleVisibility = () => {
        if (!isCapacitor) return;
        suspended = document.hidden;
        clearTimeout(timeoutId);
        if (!suspended) noteActivity();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      arm();
      if (isTauri) pollSystemActivity();
      return {
        // iOS background time is handled by the session wall clock and must not
        // be mistaken for two minutes of foreground inactivity on resume.
        idleAt:() => suspended ? Infinity : lastActivityAt + idleMs,
        stop() {
          stopped = true;
          clearTimeout(timeoutId);
          clearTimeout(nativePollId);
          events.forEach(eventName =>
            document.removeEventListener(eventName, noteActivity)
          );
          document.removeEventListener('visibilitychange', handleVisibility);
        },
      };
    },
  };

  async function init() {
    document.documentElement.classList.toggle('tauri-desktop', isTauri || isLocalWindowsPreview);
    document.documentElement.classList.toggle('capacitor-ios', isCapacitor);
    if (isCapacitor && capacitorApp) {
      await capacitorApp.addListener('appStateChange', ({isActive}) => {
        const callbacks = isActive ? resumeCallbacks : pauseCallbacks;
        callbacks.forEach(callback => callback());
      });
      if (localNotifications) {
        await localNotifications.addListener('localNotificationActionPerformed', () => {
          resumeCallbacks.forEach(callback => callback());
        });
      }
      await capacitorApp.addListener('appUrlOpen', ({url}) => {
        openUrlCallbacks.forEach(callback => callback(url));
      });
      try {
        const launch = await capacitorApp.getLaunchUrl();
        if (launch && launch.url) {
          openUrlCallbacks.forEach(callback => callback(launch.url));
        }
      } catch(e) {}
      return;
    }
    if (isTauri) return;
    if ('Notification' in global && Notification.permission === 'granted') {
      await ensureNotificationServiceWorker();
    }
  }

  global.DDZPlatform = Object.freeze({
    runtime:isCapacitor ? 'capacitor-ios' : (isTauri ? 'tauri' : 'browser'),
    storage, timers:{createPulse}, notifications, liveActivity, lifecycle, activity, init,
  });
})(globalThis);
