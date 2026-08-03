const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/core.js');
const core = global.DDZCore;

test('slider values preserve four-zone semantics and 1-9 scores', () => {
  assert.deepEqual(core.stateFromSliders(5, 5), {zone:'flow', exertion:9, effectiveness:9});
  assert.deepEqual(core.stateFromSliders(5, -5), {zone:'cruise', exertion:1, effectiveness:9});
  assert.deepEqual(core.stateFromSliders(-5, 5), {zone:'grind', exertion:9, effectiveness:1});
  assert.deepEqual(core.stateFromSliders(-5, -5), {zone:'drift', exertion:1, effectiveness:1});
  assert.deepEqual(core.stateFromSliders(3, -2), {zone:'cruise', exertion:3, effectiveness:7});
});

test('check-ins recalculate at quarter points and skip elapsed points', () => {
  assert.deepEqual(core.checkInPoints(600), [150, 300, 450]);
  const session = {effectiveTotalSecs:900, workSecs:400, ciPoints:[], ciIdx:0};
  core.recalculateCheckIns(session);
  assert.deepEqual(session.ciPoints, [225, 450, 675]);
  assert.equal(session.ciIdx, 1);
});

test('wall-clock advance stops at first crossed check-in', () => {
  const session = {
    mode:'countdown', isPaused:false, remSecs:100, workSecs:0, flowSecs:0,
    ciPoints:[30, 60, 90], ciIdx:0,
  };
  assert.deepEqual(core.advanceSession(session, 65), {event:'checkin', advancedSecs:30});
  assert.equal(session.remSecs, 70);
  assert.equal(session.workSecs, 30);
  assert.equal(session.ciIdx, 1);
});

test('natural end wins when it coincides with a check-in', () => {
  const session = {
    mode:'countdown', isPaused:false, remSecs:30, workSecs:70, flowSecs:0,
    ciPoints:[100], ciIdx:0,
  };
  assert.deepEqual(core.advanceSession(session, 40), {event:'finish', advancedSecs:30});
  assert.equal(session.remSecs, 0);
  assert.equal(session.workSecs, 100);
});

test('countup and paused sessions advance correctly', () => {
  const countup = {mode:'countup', isPaused:false, flowSecs:10};
  core.advanceSession(countup, 12);
  assert.equal(countup.flowSecs, 22);
  const paused = {mode:'countdown', isPaused:true, remSecs:50, workSecs:10};
  assert.deepEqual(core.advanceSession(paused, 20), {event:null, advancedSecs:0});
  assert.equal(paused.remSecs, 50);
});

test('zone distribution and north-star calculations match product rules', () => {
  const session = {
    plannedMin:30, actualWorkMin:30, flowExtMin:0,
    checkIns:[
      {elapsedWorkMin:5, zone:'flow', exertion:6, effectiveness:8},
      {elapsedWorkMin:15, zone:'grind', exertion:8, effectiveness:4},
    ],
  };
  assert.deepEqual(core.zoneDistribution(session), {
    flow:15, cruise:0, grind:15, drift:0, neutral:0, away:0,
  });
  const now = Date.parse('2026-07-14T12:00:00Z');
  const tasks = [{...session, startedAt:'2026-07-14T11:00:00Z', actualWorkMin:60}];
  assert.equal(core.calculateStrain(tasks, now), 7);
  assert.equal(core.calculateFire(tasks, now), 6);
  assert.equal(core.calculateStrain([{...session, startedAt:'2026-07-12T11:00:00Z'}], now), null);
});

test('away is a first-class state in session distribution', () => {
  const session = {
    plannedMin:30, actualWorkMin:30, flowExtMin:0, awaySecs:150,
    checkIns:[
      {elapsedWorkMin:5, zone:'flow'},
      {elapsedWorkMin:15, zone:'drift'},
    ],
  };
  assert.deepEqual(core.zoneDistribution(session), {
    flow:15, cruise:0, grind:0, drift:15, neutral:0, away:2.5,
  });
  assert.deepEqual(core.zoneDistribution({actualWorkMin:5, awayMin:2}), {
    flow:0, cruise:0, grind:0, drift:0, neutral:5, away:2,
  });
});

test('zone totals conserve decimal work time and expose full elapsed time', () => {
  const session = {
    actualWorkMin:14, awaySecs:144,
    checkIns:[
      {elapsedWorkMin:6, zone:'flow'},
      {elapsedWorkMin:9, zone:'neutral'},
      {elapsedWorkMin:10, zone:'neutral'},
    ],
  };
  const distribution = core.zoneDistribution(session);
  const workTotal = ['flow','cruise','grind','drift','neutral']
    .reduce((sum, zone) => sum + distribution[zone], 0);
  const elapsedTotal = workTotal + distribution.away;
  assert.equal(workTotal, 14);
  assert.equal(elapsedTotal, 16.4);
  assert.equal(core.sessionElapsedMinutes(session), 16.4);
});

test('today performance uses positive efficiency and weighted positive effort', () => {
  const day = new Date('2026-07-14T12:00:00Z');
  const task = {
    startedAt:'2026-07-14T08:00:00Z', plannedMin:30, actualWorkMin:30, flowExtMin:0,
    checkIns:[
      {elapsedWorkMin:5, efficiencyInput:3, effortInput:2, effectiveness:7, exertion:7},
      {elapsedWorkMin:15, efficiencyInput:-2, effortInput:4, effectiveness:3, exertion:8},
    ],
  };
  assert.deepEqual(core.calculateTodayPerformance([task], day), {
    totalOutputMin:30,
    highQualityMin:15,
    workloadMin:39,
  });
});

test('today performance remains compatible with records without raw slider values', () => {
  const day = new Date('2026-07-14T12:00:00Z');
  const task = {
    startedAt:'2026-07-14T08:00:00Z', actualWorkMin:25, flowExtMin:0,
    checkIns:[{elapsedWorkMin:5, effectiveness:8, exertion:9}],
  };
  assert.deepEqual(core.calculateTodayPerformance([task], day), {
    totalOutputMin:25,
    highQualityMin:25,
    workloadMin:37.5,
  });
});

test('session workload and effort allocation use positive effort only', () => {
  const session = {
    planId:'p1', title:'Alpha', startedAt:'2026-07-14T08:00:00Z', actualWorkMin:30, flowExtMin:0,
    checkIns:[
      {elapsedWorkMin:5, effortInput:2, exertion:7},
      {elapsedWorkMin:15, effortInput:-3, exertion:3},
    ],
  };
  assert.equal(core.calculateSessionWorkload(session), 18);
  assert.deepEqual(core.calculateEffortAllocation(
    [session, {...session, id:'second', actualWorkMin:25}],
    Date.parse('2026-07-14T00:00:00Z'), Date.parse('2026-07-15T00:00:00Z')
  ), [{key:'p1', label:'Alpha', minutes:36}]);
});

test('post-countdown actions keep a task shippable or complete it', () => {
  const plan = {id:'p1', date:'Wed Jul 15 2026', done:false};
  assert.deepEqual(core.completedPlanState(plan, 'today', 100), {
    id:'p1', date:'', done:false, doneForTodayAt:100,
  });
  assert.deepEqual(core.completedPlanState(plan, 'all', 200), {
    id:'p1', date:'Wed Jul 15 2026', done:true, doneAt:200,
  });
});
