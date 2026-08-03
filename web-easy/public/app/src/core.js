(function initDDZCore(global) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function zoneFromNorm(normX, normY) {
    if (normX >= 0 && normY <= 0) return 'flow';
    if (normX < 0 && normY <= 0) return 'cruise';
    if (normX < 0 && normY > 0) return 'drift';
    return 'grind';
  }

  function normToScore(value) {
    return clamp(Math.round(5 + value * 4), 1, 9);
  }

  function stateFromSliders(efficiency, effort) {
    const normX = clamp(Number(effort) / 5, -1, 1);
    const normY = -clamp(Number(efficiency) / 5, -1, 1);
    return {
      zone: zoneFromNorm(normX, normY),
      exertion: normToScore(normX),
      effectiveness: normToScore(-normY),
    };
  }

  function checkInPoints(totalSecs) {
    return [0.25, 0.5, 0.75].map(fraction => Math.round(totalSecs * fraction));
  }

  function recalculateCheckIns(task) {
    const points = checkInPoints(task.effectiveTotalSecs);
    let nextIndex = 0;
    while (nextIndex < points.length && points[nextIndex] <= task.workSecs) nextIndex++;
    task.ciPoints = points;
    task.ciIdx = nextIndex;
    return task;
  }

  function advanceSession(task, rawElapsedSecs) {
    const elapsedSecs = Math.max(0, Math.floor(rawElapsedSecs));
    if (!task || task.isPaused || elapsedSecs === 0) return { event:null, advancedSecs:0 };

    if (task.mode === 'countup') {
      task.flowSecs += elapsedSecs;
      return { event:null, advancedSecs:elapsedSecs };
    }

    const nextCiSecs = task.ciIdx < task.ciPoints.length
      ? Math.max(0, task.ciPoints[task.ciIdx] - task.workSecs)
      : Infinity;

    if (task.remSecs <= elapsedSecs && task.remSecs <= nextCiSecs) {
      const advancedSecs = Math.max(0, task.remSecs);
      task.workSecs += advancedSecs;
      task.remSecs = 0;
      return { event:'finish', advancedSecs };
    }

    if (nextCiSecs <= elapsedSecs && nextCiSecs < task.remSecs) {
      task.remSecs -= nextCiSecs;
      task.workSecs += nextCiSecs;
      task.ciIdx++;
      return { event:'checkin', advancedSecs:nextCiSecs };
    }

    task.remSecs -= elapsedSecs;
    task.workSecs += elapsedSecs;
    return { event:null, advancedSecs:elapsedSecs };
  }

  function zoneDistribution(session) {
    const total = sessionWorkMinutes(session);
    const result = { flow:0, cruise:0, grind:0, drift:0, neutral:0, away:0 };
    const awayMinutes = Number.isFinite(session.awaySecs)
      ? Math.max(0, session.awaySecs / 60)
      : Math.max(0, Number(session.awayMin) || 0);
    sessionSegments(session).forEach(({checkIn, durationMin}) => {
      const zone = checkIn.zone;
      if (Object.prototype.hasOwnProperty.call(result, zone)) {
        result[zone] += durationMin;
      }
    });
    const workZones = ['flow','cruise','grind','drift','neutral'];
    workZones.forEach(zone => { result[zone] = +result[zone].toFixed(1); });
    const roundedTotal = workZones.reduce((sum, zone) => sum + result[zone], 0);
    const residual = +(total - roundedTotal).toFixed(1);
    if (residual) {
      const adjustmentZone = [...workZones].reverse().find(zone => result[zone] > 0) || 'neutral';
      result[adjustmentZone] = +(result[adjustmentZone] + residual).toFixed(1);
    }
    result.away = +awayMinutes.toFixed(1);
    return result;
  }

  function sessionWorkMinutes(session) {
    const baseMinutes = Number.isFinite(session.actualWorkMin)
      ? session.actualWorkMin
      : (session.plannedMin || 0);
    return Math.max(0, baseMinutes + (session.flowExtMin || 0));
  }

  function sessionElapsedMinutes(session) {
    const awayMinutes = Number.isFinite(session.awaySecs)
      ? Math.max(0, session.awaySecs / 60)
      : Math.max(0, Number(session.awayMin) || 0);
    return +(sessionWorkMinutes(session) + awayMinutes).toFixed(1);
  }

  function recentTasks(tasks, nowMs) {
    const cutoff = nowMs - DAY_MS;
    return tasks.filter(task => new Date(task.startedAt).getTime() > cutoff);
  }

  function calculateStrain(tasks, nowMs = Date.now()) {
    let totalExertionMin = 0;
    recentTasks(tasks, nowMs).forEach(task => {
      const minutes = (task.actualWorkMin || 0) + (task.flowExtMin || 0);
      const checkIns = task.checkIns || [];
      if (!minutes || !checkIns.length) return;
      const average = checkIns.reduce((sum, checkIn) => sum + checkIn.exertion, 0) / checkIns.length;
      totalExertionMin += average * minutes;
    });
    return totalExertionMin ? +Math.min(9, totalExertionMin / 60).toFixed(1) : null;
  }

  function calculateFire(tasks, nowMs = Date.now()) {
    const checkIns = recentTasks(tasks, nowMs).flatMap(task => task.checkIns || []);
    if (!checkIns.length) return null;
    return +(checkIns.reduce((sum, checkIn) => sum + checkIn.effectiveness, 0) / checkIns.length).toFixed(1);
  }

  function rawSliderValue(checkIn, rawKey, scoreKey) {
    if (Number.isFinite(checkIn[rawKey])) return clamp(checkIn[rawKey], -5, 5);
    const score = Number(checkIn[scoreKey]);
    return Number.isFinite(score) ? clamp(Math.round((score - 5) / 0.8), -5, 5) : 0;
  }

  function sessionSegments(session) {
    const checkIns = session.checkIns || [];
    const total = sessionWorkMinutes(session);
    if (!checkIns.length) {
      return total > 0 ? [{
        checkIn:{zone:'neutral', efficiencyInput:0, effortInput:0, effectiveness:5, exertion:5},
        durationMin:total,
      }] : [];
    }
    return checkIns.map((checkIn, index) => ({
      checkIn,
      durationMin: Math.max(0,
        (index + 1 < checkIns.length ? checkIns[index + 1].elapsedWorkMin : total)
        - (index === 0 ? 0 : checkIn.elapsedWorkMin)
      ),
    }));
  }

  function calculateTodayPerformance(tasks, day = new Date()) {
    const dayKey = day.toDateString();
    let totalOutputMin = 0;
    let highQualityMin = 0;
    let workloadMin = 0;

    tasks
      .filter(task => new Date(task.startedAt).toDateString() === dayKey)
      .forEach(task => {
        totalOutputMin += (task.actualWorkMin || 0) + (task.flowExtMin || 0);
        sessionSegments(task).forEach(({checkIn, durationMin}) => {
          const efficiency = rawSliderValue(checkIn, 'efficiencyInput', 'effectiveness');
          const effort = rawSliderValue(checkIn, 'effortInput', 'exertion');
          if (efficiency > 0) highQualityMin += durationMin;
          if (effort > 0) workloadMin += durationMin * (1 + 0.1 * effort);
        });
      });

    const round1 = value => +value.toFixed(1);
    return {
      totalOutputMin: round1(totalOutputMin),
      highQualityMin: round1(Math.min(highQualityMin, totalOutputMin)),
      workloadMin: round1(workloadMin),
    };
  }

  function calculateSessionWorkload(session) {
    const workload = sessionSegments(session).reduce((total, {checkIn, durationMin}) => {
      const effort = rawSliderValue(checkIn, 'effortInput', 'exertion');
      return effort > 0 ? total + durationMin * (1 + 0.1 * effort) : total;
    }, 0);
    return +workload.toFixed(1);
  }

  function calculateEffortAllocation(tasks, startMs, endMs) {
    const groups = new Map();
    tasks.forEach(task => {
      const started = new Date(task.startedAt).getTime();
      if (!Number.isFinite(started) || started < startMs || started >= endMs) return;
      const effort = calculateSessionWorkload(task);
      if (effort <= 0) return;
      const key = task.planId || task.title || 'Focus Session';
      const current = groups.get(key) || {key, label:task.title || 'Focus Session', minutes:0};
      current.minutes += effort;
      groups.set(key, current);
    });
    return [...groups.values()]
      .map(item => ({...item, minutes:+item.minutes.toFixed(1)}))
      .sort((a,b) => b.minutes - a.minutes);
  }

  function completedPlanState(plan, choice, nowMs = Date.now()) {
    if (choice === 'all') {
      return {...plan, done:true, doneAt:nowMs};
    }
    return {...plan, done:false, date:'', doneForTodayAt:nowMs};
  }

  global.DDZCore = Object.freeze({
    zoneFromNorm,
    normToScore,
    stateFromSliders,
    checkInPoints,
    recalculateCheckIns,
    advanceSession,
    zoneDistribution,
    calculateStrain,
    calculateFire,
    calculateTodayPerformance,
    calculateSessionWorkload,
    calculateEffortAllocation,
    sessionWorkMinutes,
    sessionElapsedMinutes,
    completedPlanState,
  });
})(globalThis);
