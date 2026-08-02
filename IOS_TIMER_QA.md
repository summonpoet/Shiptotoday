# iOS timer regression checklist

This checklist follows how a user is likely to use Ship to Today. Run the P0
items before every TestFlight release that changes timers, lifecycle handling,
notifications, check-ins, Away, or Live Activity UI.

## P0 — release blockers

- [ ] Start a countdown and watch it for 10 seconds. The app timer decreases
  once per second without stalls, duplicated seconds, or jumps.
- [ ] Put the app in the background for at least 20 seconds. Both Dynamic
  Island values continue: blue total time and green next check-in time.
- [ ] Tap the Dynamic Island to return, background the app, then tap it again.
  The app and Dynamic Island still update every second after the second entry.
- [ ] Leave the app backgrounded across a scheduled check-in. The notification
  arrives once, at the expected time, and opening it shows the correct session.
- [ ] Leave the app backgrounded through zero. The finish notification arrives
  once, the remaining time never becomes negative, and settlement opens with
  the correct worked duration.
- [ ] Pause manually. App, lock-screen, and Dynamic Island timers freeze on the
  same value and show `Paused`; resuming continues from that value.
- [ ] Trigger automatic Away after two foreground idle minutes. Timers freeze,
  status shows `Away`, activity resumes on input, and Away time is included in
  settlement without being counted as work.
- [ ] Force-quit during an active session, wait, and reopen. The session is
  restored from wall-clock time without starting a duplicate Live Activity or
  sending duplicate notifications.

## P1 — main product flow

- [ ] Start an Instant Task and a planned task; titles, durations, and task IDs
  are correct on the app, lock screen, and expanded Dynamic Island.
- [ ] At check-in, leave sliders untouched and confirm. `(0, 0)` is saved and
  the countdown resumes normally.
- [ ] Do nothing on check-in for one minute. `(0, 0)` submits once and the timer
  resumes; the check-in screen does not remain behind another screen.
- [ ] Let check-in remain open for two idle minutes. It enters Away according to
  product rules and returns to a coherent timer state on activity.
- [ ] Test Flow, Cruise, Grind, and Drift. Time rewards/compensation alter the
  total and future check-in time consistently in app and Live Activity.
- [ ] Enter and exit Flow count-up mode. The timer direction and displayed
  status stay correct after backgrounding and reopening.
- [ ] Start, finish, and skip a Grind break. Break time survives backgrounding,
  ends once, and the focus timer resumes once.
- [ ] Finish with both `Done for today` and `Mark as completed`; task placement,
  times shipped, total effort, and days lasted remain correct.

## P1 — interruptions and lifecycle corner cases

- [ ] Lock/unlock the phone repeatedly during a session.
- [ ] Open Notification Center, Control Center, Siri, camera, and an incoming
  call overlay, then return. Temporary inactive states must not freeze or
  duplicate the timer.
- [ ] Switch rapidly between Ship to Today and another app 5–10 times.
- [ ] Tap the app icon, Dynamic Island, lock-screen Live Activity, check-in
  notification, and finish notification as separate entry routes.
- [ ] Change device time zone or manually move the clock forward/backward while
  a test session is running; the app must fail safely and never produce a
  negative or implausibly large duration.
- [ ] Run across midnight. The active task continues, while Today/dashboard
  attribution remains internally consistent after settlement.
- [ ] Test with Low Power Mode, poor battery, and less than 10% charge.
- [ ] Test after iOS has evicted the WebView or the app process from memory.

## P2 — presentation and resilience

- [ ] Compact island stays at the intended short width in running, Away, and
  Paused states; long task names do not expand or clip the two timers.
- [ ] Durations above 59 minutes remain legible in compact and expanded states.
- [ ] When there is no future check-in, the green value shows `--:--` and the
  blue total continues normally.
- [ ] Deny notification permission. The session still runs and Live Activity
  behavior remains coherent; the app provides no false claim that alerts work.
- [ ] Disable Live Activities in iOS Settings. The in-app timer and local
  notifications continue without errors.
- [ ] Start a session close to a check-in boundary, then pause/resume or
  background/foreground repeatedly. The check-in opens exactly once.
- [ ] Test Chinese system language, 12/24-hour formats, large text, display zoom,
  and Reduce Motion without clipped controls or unreadable timers.

## Automated coverage

`tests/lifecycle.test.js` simulates iOS suspension and repeated Dynamic Island
entry. It asserts wall-clock reconciliation, pulse replacement, continuous app
countdown, and refreshed total/check-in Live Activity payloads. Native iOS UI,
OS scheduling, process eviction, and ActivityKit rendering still require the P0
real-device checks above.
