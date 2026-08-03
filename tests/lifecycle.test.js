const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createTimerHarness() {
  let now = 1_800_000_000_000;
  let activeScreenId = 'screen-timer';
  let pulse = null;
  let pulseActive = false;
  let pulseCreations = 0;
  let staleWorkerStops = 0;
  const liveActivityUpdates = [];
  const scheduledEvents = [];
  const lifecycle = {};
  const elements = new Map();

  function element(id = '') {
    if (elements.has(id)) return elements.get(id);
    const classNames = new Set();
    const value = {
      id,
      textContent: '',
      innerHTML: '',
      value: 0,
      disabled: false,
      style: {},
      dataset: {},
      classList: {
        add(name) {
          classNames.add(name);
          if (name === 'active' && id.startsWith('screen-')) activeScreenId = id;
        },
        remove(name) { classNames.delete(name); },
        toggle(name, enabled) {
          if (enabled) classNames.add(name);
          else classNames.delete(name);
        },
        contains(name) { return classNames.has(name); },
      },
      addEventListener() {},
      querySelector() { return null; },
      closest() { return null; },
    };
    elements.set(id, value);
    return value;
  }

  const screenIds = ['screen-timer', 'screen-break', 'screen-checkin'];
  screenIds.forEach(element);

  class FakeDate extends Date {
    static now() { return now; }
  }

  const context = {
    console,
    Date: FakeDate,
    Math,
    JSON,
    Infinity,
    Promise,
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame(callback) { callback(); },
    navigator: {},
    window: {},
    document: {
      hidden: false,
      documentElement: {classList: {toggle() {}}},
      getElementById: element,
      querySelector(selector) {
        if (selector === '.screen.active') return element(activeScreenId);
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.screen') return screenIds.map(element);
        return [];
      },
      addEventListener() {},
    },
    DDZCore: {
      advanceSession(session, elapsed) {
        session.remSecs = Math.max(0, session.remSecs - elapsed);
        session.workSecs += elapsed;
        return {event: null, advancedSecs: elapsed};
      },
      recalculateCheckIns() {},
      calculateTodayPerformance() {
        return {totalOutputMin: 0, highQualityMin: 0, workloadMin: 0};
      },
    },
    DDZPlatform: {
      storage: {
        readJSON(_key, fallback) { return fallback; },
        writeJSON() { return true; },
      },
      timers: {
        createPulse(callback) {
          pulseCreations += 1;
          pulseActive = true;
          pulse = () => { if (pulseActive) callback(); };
          return {stop() { staleWorkerStops += 1; pulseActive = false; }};
        },
      },
      notifications: {
        requestPermission: async () => 'granted',
        showCheckIn: async () => true,
        scheduleSessionEvent: async event => { scheduledEvents.push(event); return true; },
        cancelSessionEvents: async () => true,
      },
      liveActivity: {
        start: async state => { liveActivityUpdates.push(state); return true; },
        update: async state => { liveActivityUpdates.push(state); return true; },
        end: async () => true,
      },
      lifecycle: {
        onResume(callback) { lifecycle.resume = callback; },
        onPause(callback) { lifecycle.pause = callback; },
        onOpenUrl(callback) { lifecycle.openUrl = callback; },
      },
      activity: {
        watch() { return {idleAt: () => Infinity, stop() {}}; },
      },
      // Keep initApp suspended so it cannot overwrite the explicit test state.
      init: () => new Promise(() => {}),
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/app.js', 'utf8'), context);

  return {
    context,
    lifecycle,
    element,
    get pulse() { return pulse; },
    get pulseCreations() { return pulseCreations; },
    get workerStops() { return staleWorkerStops; },
    get liveActivityUpdates() { return liveActivityUpdates; },
    get scheduledEvents() { return scheduledEvents; },
    advanceClock(ms) { now += ms; },
    evaluate(source) { return vm.runInContext(source, context); },
  };
}

test('iOS resume and a second Dynamic Island entry keep both countdowns live', () => {
  const harness = createTimerHarness();
  harness.evaluate(`
    task = {
      id:'task_resume', title:'Resume regression', mode:'countdown',
      isPaused:false, pauseKind:null, remSecs:120, workSecs:0, flowSecs:0,
      effectiveTotalSecs:120, lastTickAt:Date.now() - 5000,
      ciPoints:[60], ciIdx:0, checkIns:[], awaySecs:0,
      awayPeriods:[], breaks:[]
    };
    tickerWorker = { stop() { globalThis.__oldWorkerStopped = true; } };
  `);

  harness.lifecycle.resume();

  assert.equal(harness.evaluate('globalThis.__oldWorkerStopped'), true);
  assert.equal(harness.evaluate('task.remSecs'), 115, 'wall-clock gap is reconciled');
  assert.equal(harness.pulseCreations, 1, 'a fresh foreground pulse is created');
  assert.equal(harness.element('t-digits').textContent, '01:55');
  assert.equal(harness.liveActivityUpdates.at(-1).isRunning, true);
  assert.equal(harness.liveActivityUpdates.at(-1).seconds, 115);
  assert.equal(harness.liveActivityUpdates.at(-1).nextCheckInSeconds, 55);

  harness.advanceClock(2000);
  harness.pulse();
  assert.equal(harness.evaluate('task.remSecs'), 113, 'main timer continues after resume');

  harness.advanceClock(3000);
  harness.lifecycle.openUrl('shiptotoday://timer');
  assert.equal(harness.evaluate('task.remSecs'), 110, 'second entry reconciles elapsed time');
  assert.equal(harness.pulseCreations, 2, 'second entry replaces the foreground pulse');
  assert.equal(harness.liveActivityUpdates.at(-1).seconds, 110);

  harness.advanceClock(1000);
  harness.pulse();
  assert.equal(harness.evaluate('task.remSecs'), 109, 'timer does not freeze after re-entry');
  assert.equal(harness.element('t-digits').textContent, '01:49');
});

test('iOS pause stops page execution and resume reconciles without racing notifications', () => {
  const harness = createTimerHarness();
  harness.evaluate(`
    task = {
      id:'task_background', title:'Background notification', mode:'countdown',
      isPaused:false, pauseKind:null, remSecs:120, workSecs:0, flowSecs:0,
      effectiveTotalSecs:120, lastTickAt:Date.now(),
      ciPoints:[60], ciIdx:0, checkIns:[], awaySecs:0,
      awayPeriods:[], breaks:[]
    };
  `);

  harness.lifecycle.resume();
  const remainingBeforePause = harness.evaluate('task.remSecs');
  harness.lifecycle.pause();
  assert.equal(harness.workerStops, 1, 'foreground pulse is stopped on native pause');
  assert.equal(harness.scheduledEvents.at(-1).kind, 'checkin');

  harness.advanceClock(10_000);
  harness.pulse();
  assert.equal(
    harness.evaluate('task.remSecs'),
    remainingBeforePause,
    'background page code cannot consume or cancel the native check-in boundary'
  );

  harness.lifecycle.resume();
  assert.equal(harness.evaluate('task.remSecs'), remainingBeforePause - 10);
  assert.equal(harness.pulseCreations, 2, 'resume creates a new foreground pulse');
});

test('Live Activity projection never exposes a check-in longer than total time', () => {
  const harness = createTimerHarness();
  harness.evaluate(`
    task = {
      id:'task_clamp', title:'Clamp projection', mode:'countdown',
      isPaused:false, pauseKind:null, remSecs:30, workSecs:10, flowSecs:0,
      effectiveTotalSecs:120, lastTickAt:Date.now(),
      ciPoints:[100], ciIdx:0, checkIns:[], awaySecs:0,
      awayPeriods:[], breaks:[]
    };
  `);
  const payload = harness.evaluate('focusLiveActivityPayload()');
  assert.equal(payload.seconds, 30);
  assert.equal(payload.nextCheckInSeconds, 30);
  assert.equal(payload.timerDate - payload.referenceDate, 30_000);
  assert.ok(payload.nextCheckInDate <= payload.timerDate);
});

test('Repeat task preserves identity and returns to duration selection', () => {
  const harness = createTimerHarness();
  harness.evaluate(`
    summaryPlanId = 'plan_repeat';
    summarySession = {
      id:'finished_repeat', planId:'plan_repeat',
      title:'Repeat this work', plannedMin:25
    };
    repeatCompletedTask();
  `);
  assert.equal(harness.element('task-name').value, 'Repeat this work');
  assert.equal(harness.evaluate('selDur'), 25);
  assert.equal(harness.evaluate('pendingPlanId'), 'plan_repeat');
  assert.equal(harness.evaluate('summarySession'), null);
});
