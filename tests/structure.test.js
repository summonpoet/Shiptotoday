const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const html = fs.readFileSync('dingding_zones.html', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');

test('HTML loads shared layers in dependency order', () => {
  const core = html.indexOf('./src/core.js');
  const platform = html.indexOf('./src/platform-browser.js');
  const appIndex = html.indexOf('./src/app.js');
  assert.ok(core > 0 && platform > core && appIndex > platform);
  assert.match(html, /\.\/src\/styles\.css/);
  assert.doesNotMatch(html, /<style>/);
});

test('application logic uses platform boundaries', () => {
  assert.doesNotMatch(app, /localStorage\./);
  assert.doesNotMatch(app, /new Notification/);
  assert.doesNotMatch(app, /new Worker/);
  assert.match(app, /DDZPlatform\.storage/);
  assert.match(app, /DDZCore\.advanceSession/);
});

test('required check-in slider controls remain present', () => {
  for (const id of ['ci-efficiency', 'ci-effort', 'ci-confirm-btn', 'ci-zone-label']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
});

test('home uses the new task-first information architecture', () => {
  assert.match(html, /<h1 class="home-title">Today<\/h1>/);
  assert.match(html, />Plan Today<\/button>/);
  assert.match(html, />Instant Task<\/button>/);
  assert.match(html, /id="h-performance"/);
  assert.doesNotMatch(html, /id="h-northstar"/);
  assert.doesNotMatch(html, /id="h-zone-chart"/);
});

test('planner, post-countdown completion, check-in and dashboard use the reduced-friction design', () => {
  assert.match(html, /id="plan-priority"[^>]+type="range"/);
  assert.doesNotMatch(html, /id="plan-board"/);
  assert.doesNotMatch(html, /id="guide-sheet"|id="guide-backdrop"|openGuide\(/);
  assert.match(html, /Done for today/);
  assert.match(html, /Mark as completed/);
  assert.match(html, /id="s-plan-actions"/);
  assert.doesNotMatch(html, /complete-sheet|complete-backdrop|choice-option|>Confirm</);
  assert.match(app, /function finishPlanAfterSession\(choice\)/);
  assert.match(app, /function markPlanDone\(id\) \{\s*completePlan\(id, 'all'\)/);
  assert.match(html, /id="screen-dashboard"/);
  assert.match(html, /dashboard-day-chart/);
  assert.match(html, /dashboard-week-chart/);
  assert.match(app, /ciAutoDeadline = Date\.now\(\) \+ 60 \* 1000/);
  assert.match(app, /zone:'neutral', ex:5, ef:5/);
  assert.ok(app.indexOf('tasklist-add') < app.indexOf('Completed ·'));
});

test('away pauses after inactivity, resumes only automatic pauses, and appears in settlement', () => {
  const platform = fs.readFileSync('src/platform-browser.js', 'utf8');
  assert.match(app, /const AWAY_IDLE_MS = 2 \* 60 \* 1000/);
  assert.match(app, /enterAway\('auto', idleAt\)/);
  assert.match(app, /task\.pauseKind === 'auto'/);
  assert.match(app, /enterAway\('manual'\)/);
  assert.match(app, /awayPeriods/);
  assert.match(platform, /const events = \['pointermove', 'pointerdown', 'keydown', 'touchstart'\]/);
  assert.match(platform, /activity, init/);
  assert.match(html, /Away <strong id="s-away"><\/strong>/);
  assert.match(app, /if \(!awayMonitor\) startAwayDetection\(\)/);
  assert.match(app, /activeScreen\.id !== 'screen-timer'/);
  assert.match(app, /stopCheckinAutoSubmit\(\);\s*pendingSrc = null;\s*nav\('timer'\)/);
  assert.doesNotMatch(app, /function openCheckin\(src\) \{\s*stopAwayDetection\(\)/);
});
