// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const SCORES = { drift:{ex:2,ef:2}, cruise:{ex:3,ef:8}, grind:{ex:8,ef:3}, flow:{ex:8,ef:8} };
const COLORS = { flow:'#F5A623', cruise:'#27AE60', grind:'#E53935', drift:'#78909C', away:'#5F6B7A', neutral:'#8B95A7' };
const AWAY_IDLE_MS = 2 * 60 * 1000;
const ACTIVE_SESSION_KEY = 'ddz_active_session_v1';
// Check-in points are dynamic: 1/4, 1/2, 3/4 of effectiveTotalSecs
// recalculated after every time adjustment

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let selDur = 45;
let task   = null;
let tickerWorker = null;
let breakerWorker = null;
let breakEndAt = null;
let pendingSrc  = null;
let breakSecs   = 300;
let breakRecord = null;
let sChart  = null;
let hCharts = {};
let endPending      = false;   // two-tap end confirmation (replaces confirm())
let homeZoneChart   = null;    // Chart.js donut on home screen
let earlyPending = false;   // two-tap early-finish confirmation
let ciDragResult = null;    // {zone, ex, ef} derived from the two check-in sliders
let ciSliderTouched = { efficiency:false, effort:false };
let plannerDur   = 25;      // selected duration on planner screen
let plannerPriority = 5;
let pendingPlanId = null;
let ciAutoWorker = null;
let ciAutoDeadline = null;
let summaryPlanId = null;
let dashboardCharts = { day:null, week:null };
let swipeStart = null;
let awayMonitor = null;

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function nav(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  if (id === 'home')     refreshHome();
  if (id === 'history')  renderHistory();
  if (id === 'tasklist') renderTaskList();
  if (id === 'dashboard') requestAnimationFrame(renderDashboard);
  if (id === 'planner')  {
    document.getElementById('plan-name').value = '';
    plannerDur  = 25;
    plannerPriority = 5;
    document.getElementById('plan-priority').value = 5;
    document.getElementById('plan-priority-value').textContent = '5';
    document.querySelectorAll('#plan-dur-row .dur-btn').forEach(b =>
      b.classList.toggle('selected', +b.dataset.min === plannerDur));
    renderPlannerUnfinished();
  }
}
function goHome() { task = null; summaryPlanId = null; nav('home'); }

// ─────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────
function refreshHome() {
  const now = new Date();
  document.getElementById('home-date').textContent =
    now.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});
  renderTodayPerformance(now);

  // Today's planned tasks
  const rawPlans  = todayPlans().filter(plan => !plan.done);
  const plans = rawPlans.slice().sort((a, b) =>
    (b.priority || 5) - (a.priority || 5) || (a.createdAt || '').localeCompare(b.createdAt || '')
  );
  const htEl = document.getElementById('h-tasks');
  htEl.innerHTML = `<div class="h-tasks-section">
    <div class="h-tasks-head"><span>Tasks</span><span>${plans.length}</span></div>
    ${plans.length ? plans.map(p => `
      <div class="h-task-item" data-plan-id="${p.id}">
        <div class="h-task-info">
          <div class="h-task-name">${esc(p.title)}</div>
        </div>
        <button class="h-task-go" onclick="startPlan('${p.id}')">Start</button>
        <button class="h-task-done" onclick="completeHomePlan('${p.id}', this)" aria-label="Mark task done"></button>
      </div>`).join('') : '<div class="h-tasks-empty">No tasks planned yet.<br>Add one when you are ready.</div>'}
  </div>`;
}

function metricMinutes(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderTodayPerformance(day) {
  const metrics = DDZCore.calculateTodayPerformance(loadTasks(), day);
  const qualityPct = metrics.totalOutputMin > 0
    ? Math.min(100, metrics.highQualityMin / metrics.totalOutputMin * 100)
    : 0;
  const restPct = metrics.totalOutputMin > 0 ? 100 - qualityPct : 0;
  const workloadScale = Math.max(metrics.totalOutputMin, metrics.workloadMin, 1);
  const workloadPct = Math.min(100, metrics.workloadMin / workloadScale * 100);

  document.getElementById('h-performance').innerHTML = `<div class="performance-card glass-panel">
    <div class="performance-title">Today's performance</div>
    <div class="metric-block">
      <div class="metric-head">
        <span class="metric-name">Today's output</span>
        <span class="metric-value">${metricMinutes(metrics.totalOutputMin)} min</span>
      </div>
      <div class="metric-track" aria-label="Today's output: ${metricMinutes(metrics.highQualityMin)} high quality minutes out of ${metricMinutes(metrics.totalOutputMin)} total minutes">
        <span class="metric-fill metric-fill-quality" style="width:${qualityPct}%"></span>
        <span class="metric-fill metric-fill-output" style="width:${restPct}%"></span>
      </div>
      <div class="metric-legend">
        <span class="metric-legend-item"><i class="metric-key metric-key-quality"></i>High quality ${metricMinutes(metrics.highQualityMin)}m</span>
        <span class="metric-legend-item"><i class="metric-key metric-key-output"></i>Total ${metricMinutes(metrics.totalOutputMin)}m</span>
      </div>
    </div>
    <div class="metric-block">
      <div class="metric-head">
        <span class="metric-name">Today's workload</span>
        <span class="metric-value">${metricMinutes(metrics.workloadMin)} min</span>
      </div>
      <div class="metric-track" aria-label="Today's weighted high-effort workload: ${metricMinutes(metrics.workloadMin)} minutes">
        <span class="metric-fill metric-fill-workload" style="width:${workloadPct}%"></span>
      </div>
    </div>
  </div>`;
}

function completeHomePlan(planId, button) {
  const row = button && button.closest('.h-task-item');
  if (!row) { completePlan(planId, 'all'); return; }
  button.disabled = true;
  row.classList.add('completing');
  setTimeout(() => completePlan(planId, 'all'), 340);
}

// ─────────────────────────────────────────────
// START TASK
// ─────────────────────────────────────────────
function pickDur(min) {
  selDur = min;
  document.querySelectorAll('.dur-btn').forEach(b =>
    b.classList.toggle('selected', +b.dataset.min === min));
}

function startInstantTask() {
  pendingPlanId = null;
  document.getElementById('task-name').value = '';
  nav('startTask');
}

function beginTask() {
  const name = document.getElementById('task-name').value.trim() || 'Focus Session';
  requestNotificationPermission().then(() => scheduleNextSessionEvent());
  task = {
    id: 'task_' + Date.now(),
    planId: pendingPlanId,
    title: name,
    plannedMin: selDur,
    effectiveTotalSecs: selDur * 60,   // updated on time adjustments
    remSecs:   selDur * 60,
    workSecs:  0,
    flowSecs:  0,
    awaySecs:  0,
    awayStartedAt: null,
    awayPeriods: [],
    pauseKind: null,
    status:    'running',
    mode:      'countdown',
    isPaused:  false,
    startedAt: new Date().toISOString(),
    endedAt:   null,
    checkIns:  [],
    breaks:    [],
    driftCnt:  0,
    grindCnt:  0,
    ciPoints:  [],
    ciIdx:     0,
  };
  recalcCheckIns();
  document.getElementById('task-name').value = '';
  pendingPlanId = null;
  nav('timer');
  drawTimer();
  startTicker();
}

// ─────────────────────────────────────────────
// DYNAMIC CHECK-IN RECALCULATION  ← Change #2
// Check-ins always at ¼ · ½ · ¾ of effectiveTotalSecs.
// Called on task start and after every time adjustment.
// ─────────────────────────────────────────────
function recalcCheckIns() {
  DDZCore.recalculateCheckIns(task);
}

// ─────────────────────────────────────────────
// TIMER CORE
// ─────────────────────────────────────────────
function stopTicker() {
  if (tickerWorker) {
    tickerWorker.stop();
    tickerWorker = null;
  }
}

function stopAwayDetection() {
  if (awayMonitor) {
    awayMonitor.stop();
    awayMonitor = null;
  }
}

function startAwayDetection() {
  stopAwayDetection();
  if (!task) return;
  if (task.isPaused) {
    if (task.pauseKind !== 'auto') return;
    awayMonitor = DDZPlatform.activity.watch({
      idleMs:AWAY_IDLE_MS,
      onActive:activeAt => {
        if (task && task.isPaused && task.pauseKind === 'auto') leaveAway(activeAt);
      },
    });
    return;
  }
  awayMonitor = DDZPlatform.activity.watch({
    idleMs: AWAY_IDLE_MS,
    onIdle: idleAt => {
      const event = advanceTimerTo(idleAt);
      if (!event) enterAway('auto', idleAt);
    },
    onActive: activeAt => {
      if (task && task.isPaused && task.pauseKind === 'auto') leaveAway(activeAt);
    },
  });
}

function startTicker() {
  stopTicker();
  if (!task || task.isPaused) return;
  // All elapsed time is derived from the wall clock. The worker improves
  // background responsiveness; visibility/focus reconciliation is the fallback.
  task.lastTickAt = Date.now();
  if (!awayMonitor) startAwayDetection();
  tickerWorker = DDZPlatform.timers.createPulse(() => tick());
  persistActiveSession();
  scheduleNextSessionEvent();
}

function advanceTimerTo(targetMs) {
  if (!task || task.isPaused) return;
  if (!task.lastTickAt) task.lastTickAt = targetMs;
  const elapsed = Math.floor((targetMs - task.lastTickAt) / 1000);
  if (elapsed <= 0) return null;
  task.lastTickAt += elapsed * 1000;

  const result = DDZCore.advanceSession(task, elapsed);
  if (result.event === 'finish') {
    stopTicker();
    stopAwayDetection();
    finishTask();
    return result.event;
  }
  if (result.event === 'checkin') {
    stopTicker();
    openCheckin('scheduled');
    return result.event;
  }
  persistActiveSession();
  drawTimer();
  return null;
}

function tick() {
  if (!task || task.isPaused) return;
  const now = Date.now();
  const idleAt = awayMonitor ? awayMonitor.idleAt() : Infinity;
  const event = advanceTimerTo(Math.min(now, idleAt));
  if (!event && now >= idleAt) enterAway('auto', idleAt);
}

function enterAway(source, startedAtMs = Date.now()) {
  if (!task || task.isPaused) return;
  const effectiveStart = Math.max(startedAtMs, task.lastTickAt || startedAtMs);
  task.isPaused = true;
  task.pauseKind = source;
  task.awayStartedAt = effectiveStart;
  task.awayPeriods.push({
    startedAt: new Date(effectiveStart).toISOString(),
    endedAt: null,
    durationSecs: 0,
    source,
  });
  DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
  stopTicker();
  if (source === 'manual') stopAwayDetection();
  const activeScreen = document.querySelector('.screen.active');
  if (source === 'auto' && activeScreen && activeScreen.id !== 'screen-timer') {
    stopCheckinAutoSubmit();
    pendingSrc = null;
    nav('timer');
  }
  persistActiveSession();
  drawTimer();
}

function closeAway(endedAtMs = Date.now()) {
  if (!task || !task.isPaused || !task.awayStartedAt) return;
  const durationSecs = Math.max(0, (endedAtMs - task.awayStartedAt) / 1000);
  task.awaySecs = (task.awaySecs || 0) + durationSecs;
  const period = task.awayPeriods[task.awayPeriods.length - 1];
  if (period && !period.endedAt) {
    period.endedAt = new Date(endedAtMs).toISOString();
    period.durationSecs = +durationSecs.toFixed(1);
  }
  task.awayStartedAt = null;
  task.pauseKind = null;
  task.isPaused = false;
  persistActiveSession();
}

function leaveAway(endedAtMs = Date.now()) {
  if (!task || !task.isPaused) return;
  closeAway(endedAtMs);
  startTicker();
  drawTimer();
}

function drawTimer() {
  if (!task) return;
  document.getElementById('t-title').textContent = task.title;
  const digEl = document.getElementById('t-digits');

  if (task.mode === 'countup') {
    digEl.textContent = fmt(task.flowSecs);
    digEl.classList.add('flow-up');
    document.getElementById('t-badge').textContent          = 'Ride the Flow';
    document.getElementById('t-eta').style.display          = 'none';
    document.getElementById('t-flow-strip').style.display   = '';
    document.getElementById('btn-state').style.display      = 'none';
    if (!endPending) document.getElementById('btn-end').textContent = 'End Session';
  } else {
    digEl.textContent = fmt(task.remSecs);
    digEl.classList.remove('flow-up');
    document.getElementById('t-badge').textContent        = task.isPaused ? 'Away' : 'Focus';
    document.getElementById('t-flow-strip').style.display = 'none';
    document.getElementById('btn-state').style.display    = '';
    if (!endPending) document.getElementById('btn-end').textContent = 'End';

    const etaEl = document.getElementById('t-eta');
    if (task.ciIdx < task.ciPoints.length) {
      const secs = task.ciPoints[task.ciIdx] - task.workSecs;
      if (secs > 0) {
        etaEl.textContent    = 'Next check-in in ' + fmt(secs);
        etaEl.style.display  = '';
      } else {
        etaEl.style.display  = 'none';
      }
    } else {
      etaEl.style.display = 'none';
    }
  }

  const badge = document.getElementById('t-badge');
  if (task.isPaused) badge.textContent = 'Away';
  badge.classList.toggle('away', task.isPaused);
  document.getElementById('btn-pause').textContent = task.isPaused ? 'Resume' : 'Pause';

  // Early Finish — visible only in countdown mode after 50% of effective time
  const earlyBtn = document.getElementById('btn-early');
  const halfReached = task.mode === 'countdown' &&
                      task.workSecs >= task.effectiveTotalSecs / 2;
  earlyBtn.style.display = halfReached ? '' : 'none';
  if (halfReached && !earlyPending) {
    earlyBtn.textContent = '🏁 Early Finish';
    earlyBtn.classList.remove('confirming');
  }

  const awayTotalSecs = (task.awaySecs || 0) +
    (task.awayStartedAt ? Math.max(0, (Date.now() - task.awayStartedAt) / 1000) : 0);
  document.getElementById('t-chips').innerHTML = task.checkIns.map(ci =>
    `<span class="chip" style="background:${COLORS[ci.zone]}">${cap(ci.zone)}</span>`
  ).join('') + (awayTotalSecs > 0
    ? `<span class="chip" style="background:${COLORS.away}">Away</span>` : '');
}

function togglePause() {
  if (!task) return;
  if (task.isPaused) leaveAway();
  else enterAway('manual');
}

function reqEnd() {
  if (!endPending) {
    // First tap: enter pending state (replaces confirm() which is blocked in iframes)
    endPending = true;
    const btn = document.getElementById('btn-end');
    btn.textContent = 'Confirm?';
    btn.style.cssText = 'background:var(--grind);color:#fff;border:none;flex:1;';
    setTimeout(() => {
      if (endPending) {
        endPending = false;
        btn.textContent = task && task.mode === 'countup' ? 'End Session' : 'End';
        btn.style.cssText = '';
      }
    }, 3000);
  } else {
    // Second tap: confirmed
    endPending = false;
    stopTicker();
    finishTask();
  }
}

function reqEarlyFinish() {
  if (!task || task.mode !== 'countdown') return;
  if (!earlyPending) {
    earlyPending = true;
    const btn = document.getElementById('btn-early');
    btn.textContent = 'Confirm Early Finish?';
    btn.classList.add('confirming');
    setTimeout(() => {
      if (earlyPending) {
        earlyPending = false;
        btn.textContent = '🏁 Early Finish';
        btn.classList.remove('confirming');
      }
    }, 3000);
  } else {
    earlyPending = false;
    stopTicker();
    finishTask();
  }
}

function manualCheckin() {
  if (!task || task.isPaused || task.mode === 'countup') return;
  stopTicker();
  openCheckin('manual');
}

// ─────────────────────────────────────────────
// PLATFORM NOTIFICATIONS
// Browser today; Tauri/iOS adapters can implement the same interface later.
// ─────────────────────────────────────────────
function requestNotificationPermission() {
  return DDZPlatform.notifications.requestPermission().catch(() => 'denied');
}

async function showCheckInNotification() {
  await DDZPlatform.notifications.showCheckIn();
}

function scheduleNextSessionEvent() {
  if (!task || task.isPaused || task.mode !== 'countdown') {
    DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
    return;
  }
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen && activeScreen.id !== 'screen-timer') {
    DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
    return;
  }
  const untilCheckin = task.ciIdx < task.ciPoints.length
    ? task.ciPoints[task.ciIdx] - task.workSecs
    : Infinity;
  const kind = untilCheckin < task.remSecs ? 'checkin' : 'finish';
  const seconds = Math.max(1, Math.min(untilCheckin, task.remSecs));
  DDZPlatform.notifications.scheduleSessionEvent({
    kind,
    at:Date.now() + seconds * 1000,
    taskName:task.title,
  }).catch(() => {});
}

// ─────────────────────────────────────────────
// SOUND  ← Change #3
// Two-tone chime when the check-in input appears.
// ─────────────────────────────────────────────
function playCheckInSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    [[880, 0, 0.30], [1320, 0.20, 0.50]].forEach(([freq, delay, release]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.25, t + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + release);
      osc.start(t + delay);
      osc.stop(t + delay + release + 0.01);
    });
    setTimeout(() => { try { ctx.close(); } catch(e) {} }, 900);
  } catch(e) {}
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
}

// ─────────────────────────────────────────────
// CHECK-IN
// ─────────────────────────────────────────────
function openCheckin(src, suppressNotification = false) {
  DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
  pendingSrc   = src;
  ciDragResult = {zone:'neutral', ex:5, ef:5, efficiencyInput:0, effortInput:0};
  ciSliderTouched = { efficiency:false, effort:false };
  document.getElementById('ci-sub').textContent =
    src === 'manual' ? 'Manual check-in' : 'Scheduled check-in';

  const btn = document.getElementById('ci-confirm-btn');
  btn.disabled  = false;
  btn.textContent = 'Confirm · Neutral';
  btn.style.cssText = `background:${COLORS.neutral};color:#fff;border:none;width:100%;`;

  const lbl = document.getElementById('ci-zone-label');
  lbl.textContent = 'Neutral';
  lbl.style.color = COLORS.neutral;

  document.getElementById('ci-efficiency').value = 0;
  document.getElementById('ci-effort').value = 0;
  document.getElementById('ci-efficiency-value').textContent = '0';
  document.getElementById('ci-effort-value').textContent = '0';

  nav('checkin');
  startCheckinAutoSubmit();
  persistActiveSession();
  if (src === 'scheduled' && !suppressNotification) showCheckInNotification();
  playCheckInSound();
}

function stopCheckinAutoSubmit() {
  if (ciAutoWorker) { ciAutoWorker.stop(); ciAutoWorker = null; }
  ciAutoDeadline = null;
}

function startCheckinAutoSubmit() {
  stopCheckinAutoSubmit();
  ciAutoDeadline = Date.now() + 60 * 1000;
  const draw = () => {
    if (!ciAutoDeadline) return;
    const remaining = Math.max(0, Math.ceil((ciAutoDeadline - Date.now()) / 1000));
    const el = document.getElementById('ci-auto-submit');
    if (el) el.textContent = `Auto-continues in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    if (remaining <= 0) confirmCiZone(true);
  };
  draw();
  ciAutoWorker = DDZPlatform.timers.createPulse(draw);
}

function markCiSliderTouched(which) {
  ciSliderTouched[which] = true;
  updateCheckinSliders();
}

function updateCheckinSliders(which) {
  if (which) ciSliderTouched[which] = true;
  const efficiency = +document.getElementById('ci-efficiency').value;
  const effort     = +document.getElementById('ci-effort').value;
  document.getElementById('ci-efficiency-value').textContent = efficiency > 0 ? '+' + efficiency : String(efficiency);
  document.getElementById('ci-effort-value').textContent     = effort > 0 ? '+' + effort : String(effort);

  const lbl   = document.getElementById('ci-zone-label');
  const btn   = document.getElementById('ci-confirm-btn');
  const state = efficiency === 0 && effort === 0
    ? {zone:'neutral', exertion:5, effectiveness:5}
    : DDZCore.stateFromSliders(efficiency, effort);
  const zone = state.zone;
  ciDragResult = {
    zone, ex:state.exertion, ef:state.effectiveness,
    efficiencyInput:efficiency, effortInput:effort,
  };
  lbl.textContent = cap(zone);
  lbl.style.color = COLORS[zone];
  btn.disabled = false;
  btn.textContent = 'Confirm · ' + cap(zone);
  btn.style.cssText = `background:${COLORS[zone]};color:#fff;border:none;width:100%;`;
}

function pickZone(zone, ex, ef, efficiencyInput, effortInput) {
  if (!task) return;
  if (ex === undefined) { const sc = SCORES[zone]; ex = sc.ex; ef = sc.ef; }
  const adj = zone==='flow' ? -8 : zone==='cruise' ? -5 : zone==='drift' ? 5 : 0;
  task.checkIns.push({
    id: 'ci_' + Date.now(),
    timestamp: new Date().toISOString(),
    elapsedWorkMin: +(task.workSecs / 60).toFixed(1),
    zone, exertion: ex, effectiveness: ef,
    efficiencyInput: Number.isFinite(efficiencyInput) ? efficiencyInput : null,
    effortInput: Number.isFinite(effortInput) ? effortInput : null,
    timeAdj: adj, source: pendingSrc,
  });
  pendingSrc = null;
  if (zone === 'neutral') { backToTimer(); return; }
  showZoneAction(zone);
}

// ─────────────────────────────────────────────
// ZONE ACTIONS  — time adjustments now also recalc check-ins
// ─────────────────────────────────────────────
function showZoneAction(zone) {
  nav('zoneAction');
  const iconEl  = document.getElementById('za-icon');
  const tagEl   = document.getElementById('za-tag');
  const titleEl = document.getElementById('za-title');
  const msgEl   = document.getElementById('za-msg');
  const btnsEl  = document.getElementById('za-btns');

  tagEl.textContent   = cap(zone);
  tagEl.style.background = COLORS[zone];

  if (zone === 'flow') {
    const cut = Math.min(8*60, task.remSecs - 5*60);
    if (cut > 0) {
      task.remSecs            -= cut;
      task.effectiveTotalSecs -= cut;
      recalcCheckIns();           // ← dynamic recalc
    }
    iconEl.textContent  = '⚡';
    titleEl.textContent = "You're in Flow.";
    msgEl.textContent   = "We've shortened the remaining time.\n\nContinue the countdown or ride the flow?";
    btnsEl.innerHTML    = `
      <button class="btn btn-primary" onclick="backToTimer()">Continue Countdown</button>
      <button class="btn btn-flow btn-full" onclick="rideTheFlow()">Ride the Flow</button>`;

  } else if (zone === 'cruise') {
    const cut = Math.min(5*60, task.remSecs - 5*60);
    if (cut > 0) {
      task.remSecs            -= cut;
      task.effectiveTotalSecs -= cut;
      recalcCheckIns();           // ← dynamic recalc
    }
    iconEl.textContent  = '🚀';
    titleEl.textContent = "You're cruising.";
    msgEl.textContent   = "The task feels smooth, so we're lightly increasing the pace.";
    btnsEl.innerHTML    = `<button class="btn btn-primary" onclick="backToTimer()">Continue</button>`;

  } else if (zone === 'grind') {
    iconEl.textContent  = '🔧';
    titleEl.textContent = "You're grinding.";
    if (task.grindCnt < 2) {
      task.grindCnt++;
      msgEl.textContent = "High effort, low effectiveness.\nTake a 5-minute set break.";
      btnsEl.innerHTML  = `<button class="btn btn-primary" onclick="startBreakFlow()">Start Break</button>`;
    } else {
      msgEl.textContent = "You've already taken the max breaks.\nKeep pushing — you're almost there.";
      btnsEl.innerHTML  = `<button class="btn btn-primary" onclick="backToTimer()">Continue</button>`;
    }

  } else if (zone === 'drift') {
    iconEl.textContent  = '🌊';
    titleEl.textContent = "You're drifting.";
    if (task.driftCnt < 2) {
      task.driftCnt++;
      task.remSecs            += 5*60;
      task.effectiveTotalSecs += 5*60;
      recalcCheckIns();           // ← dynamic recalc
      msgEl.textContent = "We'll add a short warmup period\nso you can properly enter the task.";
    } else {
      msgEl.textContent = "Focus on just the next 5 minutes.\nWhat's the single next action?";
    }
    btnsEl.innerHTML = `<button class="btn btn-primary" onclick="backToTimer()">Continue</button>`;
  }
  persistActiveSession();
}

function backToTimer() {
  // Reset end-button and early-finish state
  endPending   = false;
  earlyPending = false;
  const btn = document.getElementById('btn-end');
  btn.style.cssText = '';
  const eBtn = document.getElementById('btn-early');
  eBtn.classList.remove('confirming');

  // Safety: if time ran out while in check-in/break, finish immediately
  if (task && task.mode === 'countdown' && task.remSecs <= 0) {
    finishTask();
    return;
  }
  nav('timer');
  drawTimer();
  startTicker();
}

function rideTheFlow() {
  task.mode     = 'countup';
  task.flowSecs = 0;
  DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
  nav('timer');
  drawTimer();
  startTicker();
}

// ─────────────────────────────────────────────
// BREAK
// ─────────────────────────────────────────────
function startBreakFlow() {
  stopAwayDetection();
  DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
  breakSecs   = 300;
  breakEndAt  = Date.now() + breakSecs * 1000;
  breakRecord = {
    id: 'brk_' + Date.now(), taskId: task.id,
    startedAt: new Date().toISOString(), endedAt: null,
    durationMin: 5, trigger: 'grind', wasSkipped: false,
  };
  nav('break');
  drawBreak();
  startBreakTicker();
  persistActiveSession();
}

function drawBreak()  { document.getElementById('b-digits').textContent = fmt(breakSecs); }
function stopBreakTicker() {
  if (breakerWorker) {
    breakerWorker.stop();
    breakerWorker = null;
  }
}
function startBreakTicker() {
  stopBreakTicker();
  breakerWorker = DDZPlatform.timers.createPulse(() => updateBreakTimer());
}
function updateBreakTimer() {
  if (!breakEndAt || !breakRecord) return;
  breakSecs = Math.max(0, Math.ceil((breakEndAt - Date.now()) / 1000));
  if (breakSecs <= 0) {
    stopBreakTicker();
    endBreakFlow(false);
  } else {
    drawBreak();
  }
}
function skipBreak()  { stopBreakTicker(); endBreakFlow(true); }

function endBreakFlow(skipped) {
  stopBreakTicker();
  breakEndAt = null;
  if (breakRecord) {
    breakRecord.endedAt    = new Date().toISOString();
    breakRecord.wasSkipped = skipped;
    task.breaks.push(breakRecord);
    breakRecord = null;
  }
  backToTimer();
}

// ─────────────────────────────────────────────
// FINISH TASK
// ─────────────────────────────────────────────
function finishTask() {
  if (!task) return;          // guard against double-call
  stopTicker();               // ensure ticker is stopped regardless of caller
  stopAwayDetection();
  if (task.isPaused) closeAway();
  DDZPlatform.notifications.cancelSessionEvents().catch(() => {});
  endPending   = false;
  earlyPending = false;

  task.endedAt = new Date().toISOString();
  const saved = {
    id: task.id, planId: task.planId || null, title: task.title,
    plannedMin:    task.plannedMin,
    actualWorkMin: Math.round(task.workSecs / 60),
    flowExtMin:    Math.round(task.flowSecs / 60),
    awaySecs:      +(task.awaySecs || 0).toFixed(1),
    awayMin:       +((task.awaySecs || 0) / 60).toFixed(1),
    startedAt:     task.startedAt,
    endedAt:       task.endedAt,
    checkIns:      task.checkIns,
    breaks:        task.breaks,
    awayPeriods:   task.awayPeriods,
  };
  persistTask(saved);   // save first, before any rendering that could throw
  if (saved.planId) addSessionEffortToPlan(saved);
  task = null;          // clear task so re-entrant calls are harmless
  clearActiveSession();

  // Navigate to summary BEFORE rendering — canvas must be visible for Chart.js
  nav('summary');
  requestAnimationFrame(() => {
    try { renderSummary(saved); } catch(e) { console.warn('summary render:', e); }
  });
}

function addSessionEffortToPlan(session) {
  const plans = loadPlans();
  const plan = plans.find(p => p.id === session.planId);
  if (!plan) return;
  plan.totalEffortSpent = +((plan.totalEffortSpent || 0) + DDZCore.calculateSessionWorkload(session)).toFixed(1);
  savePlans(plans);
}

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
function renderSummary(sv) {
  summaryPlanId = sv.planId || null;
  document.getElementById('s-title').textContent   = sv.title;
  document.getElementById('s-planned').textContent = sv.plannedMin + 'm';
  document.getElementById('s-actual').textContent  = (sv.actualWorkMin + sv.flowExtMin) + 'm';
  const awayMin = Number.isFinite(sv.awaySecs) ? sv.awaySecs / 60 : (sv.awayMin || 0);
  const elapsedMin = sv.actualWorkMin + sv.flowExtMin + awayMin;
  const awayPct = elapsedMin > 0 ? Math.round(awayMin / elapsedMin * 100) : 0;
  document.getElementById('s-away').textContent = `${metricMinutes(+awayMin.toFixed(1))}m · ${awayPct}%`;
  if (sChart) { sChart.destroy(); sChart = null; }
  sChart = buildLineChart('s-chart', sv, 150);
  renderDistBox('s-dist', zoneDist(sv), true);
  document.getElementById('s-plan-actions').style.display = summaryPlanId ? '' : 'none';
  document.getElementById('s-instant-done').style.display = summaryPlanId ? 'none' : '';
}

function finishPlanAfterSession(choice) {
  if (!summaryPlanId) { goHome(); return; }
  const finalChoice = choice === 'all' ? 'all' : 'today';
  completePlan(summaryPlanId, finalChoice, false);
  goHome();
  showToast(finalChoice === 'all' ? 'Marked as completed ✓' : 'Done for today ✓');
}

// ─────────────────────────────────────────────
// CHARTS  ← Change #4: task chart per check-in (already), daily + weekly added
// ─────────────────────────────────────────────
// Task-level chart: X = elapsed work minutes at each check-in
function buildLineChart(canvasId, sv) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const cis = sv.checkIns || [];
  if (!cis.length) return null;

  const labels = cis.map(ci => Math.round(ci.elapsedWorkMin) + 'm');
  const exData = cis.map(ci => ci.exertion);
  const efData = cis.map(ci => ci.effectiveness);

  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Exertion',      data:exData, borderColor:COLORS.grind,  backgroundColor:'rgba(229,57,53,.07)',  tension:.35, fill:false, pointRadius:5 },
        { label:'Effectiveness', data:efData, borderColor:COLORS.cruise, backgroundColor:'rgba(39,174,96,.07)', tension:.35, fill:false, pointRadius:5 },
      ],
    },
    options: lineChartOpts(),
  });
}

// Shared line chart options
function lineChartOpts(xFontSize) {
  return {
    responsive: true,
    animation: { duration: 400 },
    plugins: { legend:{ position:'top', labels:{ boxWidth:10, font:{size:11} } } },
    scales: {
      y: { min:0, max:10, ticks:{ stepSize:2, font:{size:10} }, grid:{ color:'rgba(0,0,0,.04)' } },
      x: { grid:{ display:false }, ticks:{ font:{ size: xFontSize||10 } } },
    },
  };
}

// ─────────────────────────────────────────────
// ZONE DISTRIBUTION
// ─────────────────────────────────────────────
function zoneDist(sv) {
  return DDZCore.zoneDistribution(sv);
}

function renderDistBox(elId, dist, addTitle) {
  const el = document.getElementById(elId);
  if (!el) return;
  const total = Object.values(dist).reduce((a,b) => a+b, 0);
  let html = addTitle ? '<div class="dist-box-title">Zone Distribution</div>' : '';
  ['flow','cruise','grind','drift','away'].forEach(z => {
    html += `<div class="dist-row">
      <div class="dist-dot" style="background:${COLORS[z]}"></div>
      <span class="dist-label">${cap(z)}</span>
      <span class="dist-time">${dist[z]||0}m</span>
    </div>`;
  });
  if (!total) html += '<p style="font-size:13px;color:var(--muted);margin-top:6px;">No check-ins recorded.</p>';
  el.innerHTML = html;
}

// ─────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────
function renderHistory() {
  Object.values(hCharts).forEach(c => c && c.destroy());
  hCharts = {};
  const tasks = loadTasks().slice().reverse();
  renderByTask(tasks);
  renderByDay(tasks);
  // By Week rendered lazily on tab switch
}

// ─── By Task ───
function renderByTask(tasks) {
  const pane = document.getElementById('pane-byTask');
  if (!tasks.length) {
    pane.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>No tasks yet.</div>';
    return;
  }
  let html = '';
  tasks.forEach((t, i) => {
    const total = (t.actualWorkMin||0) + (t.flowExtMin||0);
    const date  = new Date(t.startedAt).toLocaleDateString('en-US', {month:'short', day:'numeric'});
    html += `<div class="task-card">
      <div class="tc-head">
        <div class="tc-title">${esc(t.title)}</div>
        <div class="tc-date">${date}</div>
      </div>
      <div class="tc-meta">
        <span>Planned <strong>${t.plannedMin}m</strong></span>
        <span>Actual <strong>${total}m</strong></span>
      </div>
      <div class="chart-box" style="margin-bottom:10px;">
        <div class="chart-box-title">Exertion &amp; Effectiveness per check-in</div>
        <canvas id="hc-${i}" height="110"></canvas>
      </div>
      <div id="hd-${i}"></div>
    </div>`;
  });
  pane.innerHTML = html;
  requestAnimationFrame(() => {
    tasks.forEach((t, i) => {
      const c = buildLineChart('hc-'+i, t);
      if (c) hCharts['hc-'+i] = c;
      renderDistBox('hd-'+i, zoneDist(t), false);
    });
  });
}

// ─── By Day ───
function renderByDay(tasks) {
  const pane = document.getElementById('pane-byDay');
  if (!tasks.length) {
    pane.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div>No data yet.</div>';
    return;
  }
  const byDay = {};
  tasks.forEach(t => {
    const k = new Date(t.startedAt).toDateString();
    (byDay[k] = byDay[k]||[]).push(t);
  });
  const days = Object.keys(byDay).sort((a,b) => new Date(b) - new Date(a));

  let html = '';
  days.forEach((day, di) => {
    const dt    = new Date(day).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
    const total = byDay[day].reduce((s,t) => s + (t.actualWorkMin||0) + (t.flowExtMin||0), 0);
    html += `<div class="day-card">
      <div class="day-date">${dt} · ${total}m</div>
      <div id="dd-${di}"></div>
      <div class="chart-box" style="margin-top:10px;">
        <div class="chart-box-title">Daily Exertion &amp; Effectiveness (by clock time)</div>
        <canvas id="dc-${di}" height="110"></canvas>
      </div>
    </div>`;
  });
  pane.innerHTML = html;

  requestAnimationFrame(() => {
    days.forEach((day, di) => {
      const agg = {flow:0, cruise:0, grind:0, drift:0, away:0};
      byDay[day].forEach(t => { const d = zoneDist(t); Object.keys(d).forEach(z => agg[z] += d[z]); });
      renderDistBox('dd-'+di, agg, false);

      // daily chart: combine check-ins from all tasks, sorted by clock time
      const allCIs = byDay[day]
        .flatMap(t => t.checkIns||[])
        .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (!allCIs.length) return;

      const canvas = document.getElementById('dc-'+di);
      if (!canvas) return;
      const labels = allCIs.map(ci => {
        const d = new Date(ci.timestamp);
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
      });
      hCharts['dc-'+di] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label:'Exertion',      data:allCIs.map(c=>c.exertion),      borderColor:COLORS.grind,  tension:.35, fill:false, pointRadius:4 },
            { label:'Effectiveness', data:allCIs.map(c=>c.effectiveness), borderColor:COLORS.cruise, tension:.35, fill:false, pointRadius:4 },
          ],
        },
        options: lineChartOpts(),
      });
    });
  });
}

// ─── By Week  ← Change #4: weekly chart with daily averages ───
function renderByWeek() {
  const pane     = document.getElementById('pane-byWeek');
  const allTasks = loadTasks();

  // Build last 7 days (oldest → newest)
  const today = new Date();
  const days  = Array.from({length:7}, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const labels  = days.map(d => d.toLocaleDateString('en-US', {weekday:'short', month:'numeric', day:'numeric'}));
  const exData  = [];
  const efData  = [];
  const dayData = []; // {zm, ciCount, hasData}

  days.forEach(day => {
    const dayStr  = day.toDateString();
    const dayTasks = allTasks.filter(t => new Date(t.startedAt).toDateString() === dayStr);
    const cis     = dayTasks.flatMap(t => t.checkIns||[]);

    if (!cis.length) {
      exData.push(null);
      efData.push(null);
      dayData.push(null);
    } else {
      const avgEx = cis.reduce((s,c) => s + c.exertion, 0) / cis.length;
      const avgEf = cis.reduce((s,c) => s + c.effectiveness, 0) / cis.length;
      exData.push(+avgEx.toFixed(1));
      efData.push(+avgEf.toFixed(1));

      const zm = {flow:0, cruise:0, grind:0, drift:0, away:0};
      dayTasks.forEach(t => { const d = zoneDist(t); Object.keys(d).forEach(z => zm[z] += d[z]); });
      dayData.push({ zm, ciCount: cis.length });
    }
  });

  const hasData = exData.some(v => v !== null);
  if (!hasData) {
    pane.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>No data yet.<br><span style="font-size:12px;">Complete some tasks to see your weekly trend.</span></div>';
    return;
  }

  pane.innerHTML = `
    <div class="chart-box" style="margin-bottom:16px;">
      <div class="chart-box-title">7-Day Average Exertion &amp; Effectiveness</div>
      <canvas id="weekly-chart" height="200"></canvas>
    </div>
    <div id="weekly-day-list"></div>
  `;

  requestAnimationFrame(() => {
    const canvas = document.getElementById('weekly-chart');
    if (!canvas) return;

    if (hCharts['weekly']) { hCharts['weekly'].destroy(); }

    // Annotate data points with zone info via custom tooltip
    hCharts['weekly'] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Avg Exertion',
            data: exData,
            borderColor: COLORS.grind,
            backgroundColor: 'rgba(229,57,53,.08)',
            tension: .4, fill: false, pointRadius: 6, spanGaps: true,
          },
          {
            label: 'Avg Effectiveness',
            data: efData,
            borderColor: COLORS.cruise,
            backgroundColor: 'rgba(39,174,96,.08)',
            tension: .4, fill: false, pointRadius: 6, spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        animation: { duration: 500 },
        plugins: {
          legend: { position:'top', labels:{ boxWidth:10, font:{size:11} } },
          tooltip: {
            callbacks: {
              afterBody(items) {
                const i = items[0].dataIndex;
                if (!dayData[i]) return '';
                const {zm, ciCount} = dayData[i];
                return [
                  '',
                  `Check-ins: ${ciCount}`,
                  `Flow ${zm.flow}m · Cruise ${zm.cruise}m`,
                  `Grind ${zm.grind}m · Drift ${zm.drift}m`,
                ];
              },
            },
          },
        },
        scales: {
          y: { min:0, max:10, ticks:{ stepSize:2, font:{size:10} }, grid:{ color:'rgba(0,0,0,.04)' } },
          x: { grid:{ display:false }, ticks:{ font:{size:9}, maxRotation:30 } },
        },
      },
    });

    // Per-day breakdown cards
    const listEl = document.getElementById('weekly-day-list');
    let html = '';
    days.forEach((day, i) => {
      if (!dayData[i]) return;
      const {zm, ciCount} = dayData[i];
      const dt = day.toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});
      const avgExStr = exData[i] !== null ? exData[i] : '—';
      const avgEfStr = efData[i] !== null ? efData[i] : '—';
      html += `<div class="day-card">
        <div class="day-date">${dt}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
          ${ciCount} check-in${ciCount>1?'s':''} · Avg exertion ${avgExStr} · Avg effectiveness ${avgEfStr}
        </div>
        <div class="week-zone-row">
          ${['flow','cruise','grind','drift','away'].map(z => `
            <span class="week-zone-tag">
              <span class="week-zone-dot" style="background:${COLORS[z]}"></span>
              ${cap(z)} ${zm[z]}m
            </span>
          `).join('')}
        </div>
      </div>`;
    });
    listEl.innerHTML = html || '<p style="font-size:13px;color:var(--muted);">No data this week.</p>';
  });
}

// ─────────────────────────────────────────────
// TABS  — now 3 tabs
// ─────────────────────────────────────────────
function switchTab(name) {
  const names = ['byTask', 'byDay', 'byWeek'];
  document.querySelectorAll('.tab').forEach((t, i) =>
    t.classList.toggle('active', names[i] === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('pane-' + name).classList.add('active');
  if (name === 'byWeek') renderByWeek();
}

// ─────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────
function loadTasks() {
  return DDZPlatform.storage.readJSON('ddz_tasks', []);
}
function persistTask(t) {
  const all = loadTasks();
  if (all.some(x => x.id === t.id)) return;
  all.push(t);
  DDZPlatform.storage.writeJSON('ddz_tasks', all);
}

function persistActiveSession() {
  if (!task) return;
  const activeScreen = document.querySelector('.screen.active');
  DDZPlatform.storage.writeJSON(ACTIVE_SESSION_KEY, {
    version:1,
    savedAt:Date.now(),
    screen:activeScreen ? activeScreen.id.replace('screen-', '') : 'timer',
    task,
    pendingSrc,
    ciAutoDeadline,
    breakEndAt,
    breakSecs,
    breakRecord,
  });
}

function clearActiveSession() {
  DDZPlatform.storage.writeJSON(ACTIVE_SESSION_KEY, null);
}

function restoreActiveSession() {
  const saved = DDZPlatform.storage.readJSON(ACTIVE_SESSION_KEY, null);
  if (!saved || saved.version !== 1 || !saved.task || saved.task.endedAt) return false;

  task = saved.task;
  task.awaySecs = Number(task.awaySecs) || 0;
  task.awayPeriods = Array.isArray(task.awayPeriods) ? task.awayPeriods : [];
  task.checkIns = Array.isArray(task.checkIns) ? task.checkIns : [];
  task.breaks = Array.isArray(task.breaks) ? task.breaks : [];
  task.lastTickAt = Number(task.lastTickAt) || Number(saved.savedAt) || Date.now();
  pendingSrc = saved.pendingSrc || null;

  if (_splashTimer) {
    clearTimeout(_splashTimer);
    _splashTimer = null;
  }

  if (task.isPaused) {
    nav('timer');
    drawTimer();
    startAwayDetection();
    return true;
  }

  if (saved.screen === 'break' && saved.breakRecord && saved.breakEndAt) {
    breakRecord = saved.breakRecord;
    breakEndAt = Number(saved.breakEndAt);
    breakSecs = Math.max(0, Math.ceil((breakEndAt - Date.now()) / 1000));
    nav('break');
    if (breakSecs <= 0) endBreakFlow(false);
    else {
      drawBreak();
      startBreakTicker();
      persistActiveSession();
    }
    return true;
  }

  if (saved.screen === 'checkin') {
    openCheckin(pendingSrc || 'scheduled', true);
    return true;
  }

  nav('timer');
  const event = advanceTimerTo(Date.now());
  if (!event && task) {
    drawTimer();
    startTicker();
  }
  return true;
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function fmt(secs) {
  const s = Math.max(0, Math.floor(secs));
  return pad(Math.floor(s/60)) + ':' + pad(s % 60);
}
function pad(n)  { return String(n).padStart(2, '0'); }
function cap(s)  { return s.charAt(0).toUpperCase() + s.slice(1); }
function esc(s)  { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─────────────────────────────────────────────
// DRAG BOARD  — reusable SVG drag quadrant
// ─────────────────────────────────────────────
function makeDragBoard(boardId, opts) {
  // opts: topLabel/bottomLabel/leftLabel/rightLabel (axis labels)
  //       tl/tr/bl/br (CSS color strings per quadrant)
  //       tlName/trName/blName/brName (optional text inside quadrant)
  //       onMove(normX, normY)   — fires while dragging
  //       onRelease(normX, normY) — fires on pointer up
  const wrap = document.getElementById(boardId);
  if (!wrap) return;

  const S = 260, C = 130, PAD = 30, R = C - PAD;
  const tlCx = (PAD+C)/2, tlCy = (PAD+C)/2;
  const trCx = (C+S-PAD)/2, trCy = tlCy;
  const blCx = tlCx, blCy = (C+S-PAD)/2;
  const brCx = trCx, brCy = blCy;

  const qN = (x, y, name, col) => name
    ? `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${col}" font-weight="700" opacity="0.75">${name}</text>`
    : '';

  wrap.innerHTML = `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${PAD}" y="${PAD}" width="${R}" height="${R}" fill="${opts.tl||'#aaa'}" opacity="0.13" rx="3"/>
    <rect x="${C}"   y="${PAD}" width="${R}" height="${R}" fill="${opts.tr||'#aaa'}" opacity="0.13" rx="3"/>
    <rect x="${PAD}" y="${C}"   width="${R}" height="${R}" fill="${opts.bl||'#aaa'}" opacity="0.13" rx="3"/>
    <rect x="${C}"   y="${C}"   width="${R}" height="${R}" fill="${opts.br||'#aaa'}" opacity="0.13" rx="3"/>
    <line x1="${PAD}" y1="${C}" x2="${S-PAD}" y2="${C}" stroke="#ddd" stroke-width="1"/>
    <line x1="${C}" y1="${PAD}" x2="${C}" y2="${S-PAD}" stroke="#ddd" stroke-width="1"/>
    ${qN(tlCx, tlCy, opts.tlName, opts.tl||'#888')}
    ${qN(trCx, trCy, opts.trName, opts.tr||'#888')}
    ${qN(blCx, blCy, opts.blName, opts.bl||'#888')}
    ${qN(brCx, brCy, opts.brName, opts.br||'#888')}
    ${opts.topLabel    ? `<text x="${C}"     y="${PAD-9}"   text-anchor="middle" dominant-baseline="auto"   font-size="9" fill="#bbb">${opts.topLabel}</text>`    : ''}
    ${opts.bottomLabel ? `<text x="${C}"     y="${S-3}"     text-anchor="middle" dominant-baseline="auto"   font-size="9" fill="#bbb">${opts.bottomLabel}</text>` : ''}
    ${opts.leftLabel   ? `<text x="14" y="${C}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#bbb" transform="rotate(-90,14,${C})">${opts.leftLabel}</text>`   : ''}
    ${opts.rightLabel  ? `<text x="${S-14}" y="${C}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#bbb" transform="rotate(90,${S-14},${C})">${opts.rightLabel}</text>`  : ''}
    <line id="${boardId}-ln" x1="${C}" y1="${C}" x2="${C}" y2="${C}"
      stroke="#888" stroke-width="2.5" stroke-linecap="round" opacity="0"/>
    <circle cx="${C}" cy="${C}" r="5" fill="#ccc"/>
    <circle id="${boardId}-ep" cx="${C}" cy="${C}" r="9" fill="#888" opacity="0"/>
  </svg>`;

  const svg = wrap.querySelector('svg');
  svg.style.cssText = 'width:100%;display:block;touch-action:none;cursor:crosshair;';
  const ln = document.getElementById(boardId + '-ln');
  const ep = document.getElementById(boardId + '-ep');
  const qc = { tl: opts.tl||'#888', tr: opts.tr||'#888', bl: opts.bl||'#888', br: opts.br||'#888' };
  let isDown = false;

  function toSvg(e) {
    const r = svg.getBoundingClientRect();
    return { px: (e.clientX - r.left) * S / r.width, py: (e.clientY - r.top) * S / r.height };
  }

  function apply(px, py) {
    let dx = px - C, dy = py - C;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R/d; dy *= R/d; }
    const normX = dx/R, normY = dy/R;
    const q = normX >= 0 ? (normY <= 0 ? 'tr' : 'br') : (normY <= 0 ? 'tl' : 'bl');
    const col = qc[q];
    ln.setAttribute('x2', C+dx); ln.setAttribute('y2', C+dy);
    ln.setAttribute('stroke', col); ln.setAttribute('opacity', '1');
    ep.setAttribute('cx', C+dx); ep.setAttribute('cy', C+dy);
    ep.setAttribute('fill', col); ep.setAttribute('opacity', '1');
    return { normX, normY };
  }

  svg.addEventListener('pointerdown', e => {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    isDown = true;
    const {px, py} = toSvg(e);
    const {normX, normY} = apply(px, py);
    if (opts.onMove) opts.onMove(normX, normY);
  });
  svg.addEventListener('pointermove', e => {
    if (!isDown) return;
    e.preventDefault();
    const {px, py} = toSvg(e);
    const {normX, normY} = apply(px, py);
    if (opts.onMove) opts.onMove(normX, normY);
  });
  svg.addEventListener('pointerup', e => {
    if (!isDown) return;
    isDown = false;
    const {px, py} = toSvg(e);
    const {normX, normY} = apply(px, py);
    if (opts.onRelease) opts.onRelease(normX, normY);
  });
  svg.addEventListener('pointercancel', () => { isDown = false; });
}

function zoneFromNorm(normX, normY) {
  return DDZCore.zoneFromNorm(normX, normY);
}
function normToScore(v) { return DDZCore.normToScore(v); }

function confirmCiZone(autoSubmitted = false) {
  if (!ciDragResult) return;
  stopCheckinAutoSubmit();
  pickZone(
    ciDragResult.zone, ciDragResult.ex, ciDragResult.ef,
    ciDragResult.efficiencyInput, ciDragResult.effortInput
  );
  ciDragResult = null;
  if (autoSubmitted) showToast('Neutral check-in saved');
}

// ─────────────────────────────────────────────
// PLANNER
// ─────────────────────────────────────────────
function initPlannerBoard() {
  makeDragBoard('plan-board', {
    topLabel: 'Challenging', bottomLabel: 'Easy',
    leftLabel: 'Distracting', rightLabel: 'Constructive',
    tl: '#9C27B0', tr: '#3D5AFE', bl: '#78909C', br: '#27AE60',
    onMove(normX, normY) {
      const l = natureLabel(normX, normY);
      const el = document.getElementById('plan-zone-label');
      if (el) { el.textContent = l.text; el.style.color = l.color; }
    },
    onRelease(normX, normY) {
      plannerNorm = { normX, normY };
      const l = natureLabel(normX, normY);
      const el = document.getElementById('plan-zone-label');
      if (el) { el.textContent = l.text; el.style.color = l.color; }
    },
  });
}

function natureLabel(normX, normY) {
  // normX>0 = constructive; normY<0 = challenging (screen up)
  const c = normX >= 0, h = normY <= 0;
  const text  = (h ? 'Challenging' : 'Easy') + ' · ' + (c ? 'Constructive' : 'Distracting');
  const color = c ? (h ? '#3D5AFE' : '#27AE60') : (h ? '#9C27B0' : '#78909C');
  return { text, color };
}

function natureColorFromScores(con, cha) {
  const c = con > 5, h = cha > 5;
  return c ? (h ? '#3D5AFE' : '#27AE60') : (h ? '#9C27B0' : '#78909C');
}
function natureTextFromScores(con, cha) {
  const c = con > 5, h = cha > 5;
  return (h ? 'Challenging' : 'Easy') + ' · ' + (c ? 'Constructive' : 'Distracting');
}

function pickPlanDur(min) {
  plannerDur = min;
  document.querySelectorAll('#plan-dur-row .dur-btn').forEach(b =>
    b.classList.toggle('selected', +b.dataset.min === min));
}

function updatePlanPriority() {
  plannerPriority = +document.getElementById('plan-priority').value;
  document.getElementById('plan-priority-value').textContent = String(plannerPriority);
}

function priorityColor(priority) {
  const colors = ['#9AA5B6','#8595AA','#7189A4','#607F9F','#557494','#746E70','#8A705F','#9A6F52','#A76C49','#B36740'];
  return colors[Math.max(1, Math.min(10, priority || 5)) - 1];
}

function addPlan() {
  const name = document.getElementById('plan-name').value.trim();
  if (!name) { showToast('Please enter a task name'); return; }
  const now = new Date();
  const plan = {
    id: 'plan_' + Date.now(),
    title: name,
    plannedMin: plannerDur,
    priority: plannerPriority,
    date: now.toDateString(),
    createdAt: now.toISOString(),
    totalEffortSpent: 0,
    daysLasted: 1,
    timesShipped: 1,
    order: null,
  };
  const plans = loadPlans();
  plans.push(plan);
  savePlans(plans);
  document.getElementById('plan-name').value = '';
  nav('tasklist');
}

function loadPlans() {
  const raw = DDZPlatform.storage.readJSON('ddz_plans', []);
  const historicalTasks = loadTasks();
  let changed = false;
  const plans = raw.map(plan => {
    const p = {...plan};
    const fallbackDate = p.date ? new Date(p.date) : new Date();
    if (!p.createdAt || Number.isNaN(new Date(p.createdAt).getTime())) {
      p.createdAt = (Number.isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate).toISOString(); changed = true;
    }
    if (!Number.isFinite(p.priority)) { p.priority = Math.max(1, Math.min(10, p.constructiveness || 5)); changed = true; }
    if (!Number.isFinite(p.totalEffortSpent)) {
      p.totalEffortSpent = +historicalTasks
        .filter(taskRecord => taskRecord.planId === p.id || (!taskRecord.planId && taskRecord.title === p.title))
        .reduce((sum, taskRecord) => sum + DDZCore.calculateSessionWorkload(taskRecord), 0)
        .toFixed(1);
      changed = true;
    }
    if (!Number.isFinite(p.timesShipped)) { p.timesShipped = p.date ? 1 : 0; changed = true; }
    const end = p.doneAt ? new Date(p.doneAt) : new Date();
    const startDay = new Date(new Date(p.createdAt).toDateString());
    const endDay = new Date(end.toDateString());
    const days = Math.max(1, Math.round((endDay - startDay) / 86400000) + 1);
    if (p.daysLasted !== days) { p.daysLasted = days; changed = true; }
    return p;
  });
  if (changed) DDZPlatform.storage.writeJSON('ddz_plans', plans);
  return plans;
}
function savePlans(plans) {
  DDZPlatform.storage.writeJSON('ddz_plans', plans);
}
function todayPlans() {
  return loadPlans().filter(p => p.date === new Date().toDateString());
}

function unfinishedPlans() {
  return loadPlans().filter(p => !p.done && p.date !== new Date().toDateString());
}

function renderPlannerUnfinished() {
  const el = document.getElementById('planner-unfinished');
  if (!el) return;
  const old = unfinishedPlans().sort((a,b) => (b.priority||5) - (a.priority||5));
  if (!old.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="uf-section">
    <div class="uf-head">Ship to Today</div>
    ${old.map(p => {
      const col = priorityColor(p.priority);
      return `<div class="uf-item">
        <div class="uf-dot" style="background:${col}"></div>
        <div class="uf-info">
          <div class="uf-name">${esc(p.title)}</div>
          <div class="uf-meta">${p.plannedMin}m · Priority ${p.priority} · Shipped ${p.timesShipped}×</div>
        </div>
        <button class="uf-ship" onclick="shipToToday('${p.id}')">Ship to Today</button>
      </div>`;
    }).join('')}
  </div>`;
}

function shipToToday(planId) {
  const plans = loadPlans();
  const plan  = plans.find(p => p.id === planId);
  if (!plan) return;
  plan.date  = new Date().toDateString();
  plan.doneForTodayAt = null;
  plan.timesShipped = (plan.timesShipped || 0) + 1;
  plan.order = null;
  savePlans(plans);
  renderPlannerUnfinished(); // refresh unfinished list in planner
  renderTaskList();          // refresh task list if open
  refreshHome();             // update home screen
  showToast('已移至今日 ✓');
}

// ─────────────────────────────────────────────
// TASK LIST
// ─────────────────────────────────────────────
function renderTaskList() {
  const allPlans  = loadPlans();
  const today     = new Date().toDateString();
  const undone    = allPlans.filter(p => !p.done);
  const done      = allPlans.filter(p => p.done);

  // Today first, then the ship list; priority is authoritative in both groups.
  undone.sort((a, b) => {
    const aToday = a.date === today, bToday = b.date === today;
    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return  1;
    return (b.priority || 5) - (a.priority || 5) || (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  // Sort done: most recently done first
  done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  const container = document.getElementById('tasklist-items');
  let html = '';
  if (!undone.length) html += '<div class="empty-state compact-empty">No active tasks yet.</div>';

  // ── UNDONE ─────────────────────────────────
  undone.forEach((p, i) => {
    const col    = priorityColor(p.priority);
    const isToday = p.date === today;
    const primaryBtn = isToday
      ? `<button class="pi-go"      onclick="startPlan('${p.id}')">Start</button>`
      : `<button class="pi-ship"    onclick="shipToToday('${p.id}')">Ship to Today</button>`;
    html += `<div class="plan-item" data-id="${p.id}" data-idx="${i}">
      <div class="pi-dot" style="background:${col}"></div>
      <div class="pi-info">
        <div class="pi-title">${esc(p.title)}</div>
        <div class="pi-meta">${p.plannedMin}m · Priority ${p.priority}</div>
        <div class="pi-stats"><span>Effort ${metricMinutes(p.totalEffortSpent || 0)}m</span><span>${p.daysLasted} day${p.daysLasted===1?'':'s'}</span><span>Shipped ${p.timesShipped}×</span></div>
      </div>
      ${primaryBtn}
      <button class="pi-done-btn" onclick="markPlanDone('${p.id}')" title="Finish task">✓</button>
      <button class="pi-del"      onclick="deletePlan('${p.id}')"   title="Delete">✕</button>
    </div>`;
  });

  html += `<button class="btn btn-primary tasklist-add" onclick="nav('planner')">+ Add Task</button>`;

  // ── DONE ───────────────────────────────────
  if (done.length) {
    html += `<div class="tl-done-head">Completed · ${done.length}</div>`;
    done.forEach(p => {
      const col = priorityColor(p.priority);
      html += `<div class="plan-item-done" data-id="${p.id}">
        <div class="pi-dot" style="background:${col}"></div>
        <div class="pi-info">
          <div class="pi-title">${esc(p.title)}</div>
          <div class="pi-meta">Effort ${metricMinutes(p.totalEffortSpent || 0)}m · ${p.daysLasted} day${p.daysLasted===1?'':'s'} · Shipped ${p.timesShipped}×</div>
        </div>
        <button class="pi-del" onclick="deletePlan('${p.id}')" title="Delete">✕</button>
      </div>`;
    });
  }

  container.innerHTML = html;
}

function startPlan(planId) {
  const plan = loadPlans().find(p => p.id === planId);
  if (!plan) return;
  selDur = plan.plannedMin;
  document.getElementById('task-name').value = plan.title;
  document.querySelectorAll('#screen-startTask .dur-btn').forEach(b =>
    b.classList.toggle('selected', +b.dataset.min === selDur));
  pendingPlanId = planId;
  nav('startTask');
}

function markPlanDone(id) {
  completePlan(id, 'all');
}

function completePlan(id, choice, refresh = true) {
  const plans = loadPlans();
  const plan  = plans.find(p => p.id === id);
  if (!plan) return false;
  Object.assign(plan, DDZCore.completedPlanState(plan, choice));
  savePlans(plans);
  if (refresh) {
    renderTaskList();
    refreshHome();
    showToast(choice === 'all' ? 'Marked as completed ✓' : 'Done for today ✓');
  }
  return true;
}

function deletePlan(id) {
  const plans = loadPlans().filter(p => p.id !== id);
  savePlans(plans);
  renderTaskList();
  refreshHome();
}

function initTaskListDrag() {
  const container = document.getElementById('tasklist-items');
  if (!container || container._dragReady) return;
  container._dragReady = true;

  let dragEl = null;

  container.addEventListener('pointerdown', e => {
    if (!e.target.closest('.pi-handle')) return;
    const item = e.target.closest('.plan-item');
    if (!item) return;
    e.preventDefault();
    dragEl = item;
    item.classList.add('dragging');
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', e => {
    if (!dragEl) return;
    e.preventDefault();
    const others = [...container.querySelectorAll('.plan-item:not(.dragging)')];
    let before = null;
    for (const el of others) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = el; break; }
    }
    if (before) container.insertBefore(dragEl, before);
    else {
      const last = others[others.length - 1];
      if (last) last.after(dragEl);
      else container.appendChild(dragEl);
    }
  });

  const endDrag = () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    const newOrder = [...container.querySelectorAll('.plan-item')].map(el => el.dataset.id);
    const plans = loadPlans();
    newOrder.forEach((id, i) => { const p = plans.find(x => x.id === id); if (p) p.order = i; });
    savePlans(plans);
    dragEl = null;
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', () => {
    if (dragEl) { dragEl.classList.remove('dragging'); dragEl = null; }
  });
}

// ─────────────────────────────────────────────
// SPLASH
// ─────────────────────────────────────────────
let _splashTimer = null;

function dismissSplash() {
  if (_splashTimer) { clearTimeout(_splashTimer); _splashTimer = null; }
  DDZPlatform.storage.writeJSON('ddz_seen', 1);
  nav('home');
}

// ─────────────────────────────────────────────
// NORTH STAR  — WHOOP-style arc gauges
// ─────────────────────────────────────────────
function _arcPath(cx, cy, r, pct) {
  // Arc: 150° start, 240° sweep (clockwise). Gap at bottom (~8→4 o'clock).
  const toR = d => d * Math.PI / 180;
  const S = 150, W = 240;
  const sx = +(cx + r * Math.cos(toR(S))).toFixed(1);
  const sy = +(cy + r * Math.sin(toR(S))).toFixed(1);
  const p  = Math.max(0.001, Math.min(1, pct));
  const e  = S + W * p;
  const ex = +(cx + r * Math.cos(toR(e))).toFixed(1);
  const ey = +(cy + r * Math.sin(toR(e))).toFixed(1);
  const lg = W * p > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${lg} 1 ${ex} ${ey}`;
}

function _gaugeSVG(value, color) {
  // value: 1–9 or null
  const cx = 60, cy = 52, r = 40;
  const pct = value !== null ? (value - 1) / 8 : 0;
  const bg  = _arcPath(cx, cy, r, 1);
  const fg  = _arcPath(cx, cy, r, Math.max(0.001, pct));
  const txt = value !== null ? value.toFixed(1) : '—';
  const tCol = value !== null ? 'var(--text)' : 'rgba(0,0,0,.2)';
  return `<svg viewBox="0 0 120 88" xmlns="http://www.w3.org/2000/svg">
    <path d="${bg}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="7" stroke-linecap="round"/>
    ${pct > 0.001 ? `<path d="${fg}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>` : ''}
    <text x="${cx}" y="${cy + 12}" text-anchor="middle"
      font-size="27" font-weight="800" fill="${tCol}"
      font-family="-apple-system,BlinkMacSystemFont,sans-serif">${txt}</text>
  </svg>`;
}

function calcStrain() {
  return DDZCore.calculateStrain(loadTasks());
}

function calcFire() {
  return DDZCore.calculateFire(loadTasks());
}

function renderZoneChart(zm) {
  const canvas = document.getElementById('h-zone-chart');
  if (!canvas) return;
  if (homeZoneChart) { homeZoneChart.destroy(); homeZoneChart = null; }

  const total = zm.flow + zm.cruise + zm.grind + zm.drift + (zm.away || 0);
  homeZoneChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: total > 0
      ? { labels: ['Flow','Cruise','Grind','Drift','Away'],
          datasets: [{ data: [zm.flow, zm.cruise, zm.grind, zm.drift, zm.away || 0],
            backgroundColor: [COLORS.flow, COLORS.cruise, COLORS.grind, COLORS.drift, COLORS.away],
            borderWidth: 0, hoverOffset: 4 }] }
      : { datasets: [{ data: [1], backgroundColor: ['rgba(0,0,0,.07)'], borderWidth: 0 }] },
    options: {
      responsive: false, cutout: '64%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: total > 0,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}m` } }
      }
    }
  });

  // Legend
  const leg = document.getElementById('h-zone-legend');
  if (leg) leg.innerHTML = ['flow','cruise','grind','drift','away'].map(z =>
    `<div class="zone-row">
      <div class="zone-dot" style="background:${COLORS[z]}"></div>
      <span class="zone-label">${cap(z)}</span>
      <span class="zone-time">${zm[z]||0}m</span>
    </div>`
  ).join('');
}

function renderNorthStar() {
  const el = document.getElementById('h-northstar');
  if (!el) return;
  const strain = calcStrain();
  const fire   = calcFire();
  el.innerHTML = `<div class="ns-card">
    <div class="ns-head">
      <span class="ns-title">North Star</span>
      <span class="ns-period">rolling 24h</span>
    </div>
    <div class="ns-row">
      <div class="ns-metric">
        ${_gaugeSVG(strain, '#E53935')}
        <div class="ns-metric-name">Strain</div>
        <div class="ns-metric-desc">exertion load</div>
      </div>
      <div class="ns-sep"></div>
      <div class="ns-metric">
        ${_gaugeSVG(fire, '#F5A623')}
        <div class="ns-metric-name">Fire</div>
        <div class="ns-metric-desc">avg effectiveness</div>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
const DASHBOARD_COLORS = ['#607D9A','#8799AA','#A8B3BD','#746E70','#8D735F','#A1846A','#556A7D','#B1A69A'];

function renderDashboard() {
  const tasks = loadTasks();
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayEnd = dayStart + 86400000;
  const weekStart = dayStart - 6 * 86400000;
  renderEffortPie('day', DDZCore.calculateEffortAllocation(tasks, dayStart, dayEnd));
  renderEffortPie('week', DDZCore.calculateEffortAllocation(tasks, weekStart, dayEnd));
}

function renderEffortPie(period, allocation) {
  const canvas = document.getElementById(`dashboard-${period}-chart`);
  const chartWrap = canvas.parentElement;
  const legend = document.getElementById(`dashboard-${period}-legend`);
  if (dashboardCharts[period]) dashboardCharts[period].destroy();
  if (!allocation.length) {
    chartWrap.style.display = 'none';
    legend.innerHTML = '<div class="dashboard-empty">No positive-effort sessions yet.</div>';
    dashboardCharts[period] = null;
    return;
  }
  chartWrap.style.display = '';
  const colors = allocation.map((_, i) => DASHBOARD_COLORS[i % DASHBOARD_COLORS.length]);
  dashboardCharts[period] = new Chart(canvas.getContext('2d'), {
    type:'pie',
    data:{
      labels:allocation.map(item => item.label),
      datasets:[{data:allocation.map(item => item.minutes), backgroundColor:colors, borderColor:'rgba(255,255,255,.72)', borderWidth:2}],
    },
    options:{responsive:true, maintainAspectRatio:false, animation:{duration:420}, plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx => `${ctx.label}: ${ctx.raw} min`}}}},
  });
  legend.innerHTML = allocation.map((item, i) => `<div class="dashboard-legend-item"><i style="background:${colors[i]}"></i><span>${esc(item.label)}</span><strong>${metricMinutes(item.minutes)}m</strong></div>`).join('');
}

function initSwipeNavigation() {
  const home = document.getElementById('screen-home');
  const dashboard = document.getElementById('screen-dashboard');
  const bind = (el, direction, destination) => {
    el.addEventListener('pointerdown', event => { swipeStart = {x:event.clientX, y:event.clientY}; });
    el.addEventListener('pointerup', event => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dy) < 70 && (direction === 'right' ? dx > 70 : dx < -70)) nav(destination);
    });
    el.addEventListener('pointercancel', () => { swipeStart = null; });
  };
  bind(home, 'right', 'dashboard');
  bind(dashboard, 'left', 'home');
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function initApp() {
  // Always show splash on every open; auto-dismiss after 3.6s
  _splashTimer = setTimeout(dismissSplash, 3600);
  await DDZPlatform.init();
  initSwipeNavigation();
  restoreActiveSession();
}
// Browsers may suspend all JavaScript while a tab or device is asleep. Reconcile
// immediately on return so the countdown never resumes from a stale value.
DDZPlatform.lifecycle.onResume(() => {
  tick();
  updateBreakTimer();
  if (task) {
    persistActiveSession();
    scheduleNextSessionEvent();
  }
});
DDZPlatform.lifecycle.onPause(() => {
  if (!task) return;
  if (tickerWorker) advanceTimerTo(Date.now());
  persistActiveSession();
  scheduleNextSessionEvent();
});
initApp();
