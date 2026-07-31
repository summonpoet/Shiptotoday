# DingDing Zones — Product Requirements Document v1.1
> Based on the web prototype (May 2026). This is the definitive reference for the iOS native app build.
> **v1.1 changes**: Added Splash Screen (§3), North Star Dashboard (§5), Early Finish (§7.5), Today's Zones donut chart (§4.3), Delete Task (§14), iOS frontend/backend architecture assessment (§21–§24).

---

## 1. Product Overview

### Product Name
**DingDing Zones** （叮叮专注）

### Tagline
Work like workouts. / *your focus copilot.*

### One-line Description
A minimalist focus timer that periodically checks in on your cognitive state, adjusts session length accordingly, and builds a visual picture of how your brain performs over time.

### Core Philosophy
Traditional Pomodoro timers treat focus as binary: start, endure, finish.

DingDing Zones treats focus as a **training process**. Just like physical training has effort zones (aerobic, anaerobic, recovery), cognitive work also has qualitatively different states. A good focus tool should not just count time — it should understand whether you are in Flow, Cruise, Grind, or Drift, and respond intelligently.

The app does two things well:
1. **During a session** — checks in at natural intervals, gives lightweight feedback, adjusts time so the session stays honest.
2. **After sessions** — shows you a picture of your cognitive patterns over time, by task, day, and week.

### Design Principles
- **Minimal friction**: every interaction should be 1–2 taps maximum.
- **No judgment**: zones are neutral observations, not performance scores.
- **Honest time**: the timer adjusts to reality, not the other way around.
- **Simple data**: charts and stats should be readable at a glance without explanation.

---

## 2. The Four-Zone Model

This is the conceptual core of the entire product. Every other feature is in service of this model.

### Zone Definitions

| Zone | Exertion | Effectiveness | Description |
|------|----------|---------------|-------------|
| **Flow** | High | High | Peak performance. Deep focus, ideas connecting, time flying. |
| **Cruise** | Low–Mid | High | Smooth and effective. Comfortable, making progress, sustainable. |
| **Grind** | High | Low | Pushing hard but not clicking. Stuck, frustrated, or mentally blocked. |
| **Drift** | Low | Low | Haven't really started yet. Distracted, procrastinating, just going through motions. |

### Zone Colours (used consistently throughout the app)

| Zone | Colour | Hex |
|------|--------|-----|
| Flow | Amber/Orange | `#F5A623` |
| Cruise | Green | `#27AE60` |
| Grind | Red | `#E53935` |
| Drift | Grey-Blue | `#78909C` |

### Zone Coordinates (internal, not shown to user)
Each zone maps to a position on a 9×9 exertion × effectiveness grid. These scores are stored with each check-in for chart rendering.

| Zone | Exertion score | Effectiveness score |
|------|----------------|---------------------|
| Drift | 2 | 2 |
| Cruise | 3 | 8 |
| Grind | 8 | 3 |
| Flow | 8 | 8 |

When the user uses the drag quadrant (see §8), the precise position they drag to is mapped to a 1–9 score for both axes. The zone is determined by which quadrant the drag endpoint falls in.

---

## 3. Splash Screen *(new in v1.1)*

### Purpose
Cinematic first impression shown **every time the app is opened** (not just first launch). Sets brand tone before the user reaches Home.

### Behaviour
- Shown on every cold launch / fresh open
- Auto-dismisses after **3.6 seconds**
- Tapping anywhere dismisses immediately
- A thin progress bar at the bottom animates from 0% to 100% over 3.6 s (visual cue for auto-dismiss timing)

### Visual Design
- Full-screen dark background: `#07070F`
- Decorative concentric rings (subtle, low opacity white outlines) — upper-right corner
- Radial glow (blue-tinted, bottom-left)
- Content anchored to bottom-left with ~52px bottom padding:
  - Eyebrow label: `DINGDING ZONES` — 10px, letter-spacing 4px, muted white
  - Main headline split over two lines:
    - Line 1: "Work like" — 44px, weight 300, 82% white
    - Line 2: "workouts." — 64px, weight 900, pure white
  - Sub-headline: "your focus copilot." — 17px, italic, weight 300, 35% white
  - Tap prompt: small dot + `TAP TO CONTINUE` label in muted caps
- Progress bar: 2px, 18% white, full width, pinned to very bottom

### Animation
- Content enters with a slide-up + fade-in on load (~0.9 s cubic-bezier)
- Progress bar fills linearly over 3.6 s

### iOS Implementation
```swift
// Show on every launch — no "has seen" flag
struct SplashView: View {
    let onDismiss: () -> Void
    @State private var progress: CGFloat = 0

    var body: some View {
        ZStack { /* dark bg + rings + content */ }
        .onTapGesture { onDismiss() }
        .onAppear {
            withAnimation(.linear(duration: 3.6)) { progress = 1.0 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) { onDismiss() }
        }
    }
}
```

---

## 4. Screen Map

The app has 11 screens (Splash added in v1.1). Navigation is always explicit (no tab bar). Transitions are push/pop or modal sheet.

```
Splash (every launch)
└── Home
     ├─ Start Focus → Timer → Check-in → Zone Action → (Break →) Timer
     │                                              └─ Summary → Home
     ├─ Plan Today (Task List)
     │    └─ Add Task (Planner)
     └─ View History
```

### Screen List

| ID | Screen Name | iOS equivalent |
|----|-------------|----------------|
| `splash` | Splash / Launch | Full-screen modal, no back |
| `home` | Home | Root view |
| `startTask` | New Focus Session | Push |
| `timer` | Timer | Push (full-screen) |
| `checkin` | Check-in | Modal sheet |
| `zoneAction` | Zone Feedback | Modal sheet |
| `break` | Break | Modal sheet |
| `summary` | Task Complete | Replace (no back) |
| `history` | History | Push |
| `tasklist` | Today's Tasks | Push |
| `planner` | Add a Task | Push |

---

## 5. Home Screen

### Purpose
Dashboard: two cognitive performance gauges, today's planned tasks, today's zone breakdown, and session launchers.

### Layout (top to bottom)
1. **Date line** — e.g. "Thursday, May 21"
2. **Title** — "focus copilot."
3. **North Star card** *(§5.1)* — WHOOP-style arc gauges for Strain and Fire
4. **Today's Tasks section** *(only shown if plans exist for today)*
   - Section header: "TODAY'S TASKS"
   - One row per planned task *(§5.2)*
5. **Today's Zones card** *(§5.3)*
   - Doughnut chart + legend showing time in each zone
6. **Action buttons** (stacked, bottom of screen)
   - Primary: **Start Focus**
   - Secondary: **Plan Today**
   - Ghost: **View History →**

### 5.1 North Star Dashboard *(new in v1.1)*

The North Star card sits at the top of Home and shows two rolling 24-hour metrics, inspired by WHOOP's strain/recovery gauges.

#### Metrics

| Metric | Name | Definition |
|--------|------|------------|
| **Strain** | exertion load | **Integral** of exertion × work-time over rolling 24 hours — a **volume/load** metric, not an average |
| **Fire** | avg effectiveness | Simple average of all effectiveness scores in the rolling 24 hours — a pure **state** metric |

**Strain — integral calculation:**
```
For each completed task in the past 24 hours:
    avgExertion  = mean(task.checkIns[].exertion)
    workMinutes  = task.actualWorkMin + task.flowExtMin
    contribution = avgExertion × workMinutes       // exertion-minutes

totalExertionMin = sum(contributions)
Strain (display) = min(9.0,  totalExertionMin / 60)   // exertion-hours, capped at 9
```

Key properties:
- **Monotonically increases** with work done today; never rises from inactivity
- **Drops toward null** as tasks age out of the 24 h rolling window
- **null** (shown as `—`) when no tasks recorded in the past 24 h
- Unit is "exertion-hours": e.g. 25 min at exertion 7 ≈ 2.9; 90 min at exertion 8 → capped at 9
- Display scale: 1–9 to match the gauge arc (same as check-in scores)

**Fire calculation:**
```
Fire = mean(effectiveness scores of all check-ins in last 24h)
```
If 0 check-ins: Fire = null.

#### Visual Design
- Card background: `--bg` (light grey `#F4F5F7`)
- Card header row: "NORTH STAR" label (9px, letter-spacing 2.5px, muted uppercase) + "rolling 24h" (9px, muted right-aligned)
- Two gauge columns side by side, separated by a 1px vertical divider
- Each gauge:
  - SVG arc: 240° sweep, starting at 150° (lower-left), ending at 390° (lower-right)
  - Track: faint grey arc (`rgba(0,0,0,0.08)`, 7px stroke)
  - Fill: coloured arc (Strain = `--grind` red; Fire = `--flow` amber)
  - Centre label: numeric value to 1 decimal, or `—` if null
  - Below gauge: metric name in uppercase caps (9px), description in muted (9px)
- Scale: 1.0 = score of 1, 9.0 = score of 9 → `pct = (value − 1) / 8`

#### iOS Arc Math
```swift
func arcPath(cx: CGFloat, cy: CGFloat, r: CGFloat, pct: CGFloat) -> Path {
    let startDeg: CGFloat = 150
    let sweep:    CGFloat = 240
    let endDeg = startDeg + sweep * max(0.001, min(1, pct))
    var path = Path()
    path.addArc(center: CGPoint(x: cx, y: cy), radius: r,
                startAngle: .degrees(startDeg), endAngle: .degrees(endDeg),
                clockwise: false)
    return path
}
```

### 5.2 Today's Task Row

Each row shows:
- Small coloured dot (task nature colour — see §20.2)
- Task name (truncated if long)
- Duration in minutes (e.g. "45m")
- **Start** button → navigates to `startTask` with task name and duration pre-filled

Rows are sorted: if the user has manually reordered the task list today, honour that order; otherwise sort by constructiveness score descending (most constructive first).

### 5.3 Today's Zones — Doughnut Chart *(updated in v1.1)*

Replaces the previous 4-row text list with a doughnut chart + inline legend.

- **Chart**: doughnut with 64% cutout, no legend inside chart
- **Layout**: chart (110×110 pt fixed) left-aligned + legend rows to the right
- **Data**: minutes in each zone, calculated from all sessions completed today
- **Colours**: zone colours (Flow amber, Cruise green, Grind red, Drift grey)
- **Empty state**: single grey ring (no data) — legend rows show "0m" for all zones
- **Legend rows**: coloured dot + zone name + time right-aligned; shown for all 4 zones even if 0

---

## 6. Start Focus Screen

### Purpose
Set up a new focus session. Simple: name + duration, then start.

### Fields

**Task Name**
- Optional free text, max 60 characters
- Placeholder: "Task name (optional)"
- If blank, defaults to "Focus Session"

**Duration Selector**
- 6 options displayed as tappable chips in a row:
  - `10m`, `25m`, `45m` *(default selected)*, `60m`, `90m`
  - `🧪 3m test` — dashed border, muted style; for testing only
- Only one can be selected at a time
- If arriving from a plan (via Start button), the plan's duration is pre-selected

### Start Button
- Full-width primary button
- Tapping creates the task object and navigates to `timer`

---

## 7. Timer Screen

### Purpose
The main in-session screen. Shows remaining time, current state, zone history, and session controls.

### Layout

**Top section**
- Task title (truncated)
- Status badge: "Focus" | "Paused" | "Ride the Flow"

**Centre (large)**
- Large digit display: `MM:SS`
  - Countdown mode: remaining time, normal colour
  - Flow/Ride-the-Flow mode: elapsed time, amber colour
- "Next check-in in MM:SS" label (shown when next check-in exists)
- "Ride the Flow · Keep going until you're ready to stop" strip (shown only in flow/countup mode)
- Zone chips: small coloured pills showing each completed check-in zone, left to right

**Bottom controls**
- Full-width: **State Changed** button (triggers manual check-in; hidden in flow mode)
- Two-button row:
  - **Pause** / **Resume**
  - **End** (two-tap confirmation — see §7.3)
- **🏁 Early Finish** button *(§7.5)* — shown only after 50% of session has elapsed

### 7.1 Timer Modes

**Countdown mode** (default)
- Counts down from the selected duration
- Ticker fires every 1 second
- At `remSecs ≤ 0`: auto-finish the task (→ Summary)
- At scheduled check-in points: pause ticker, open Check-in sheet

**Ride-the-Flow / Countup mode**
- User selected "Ride the Flow" after a Flow check-in
- Counts up from 0 (elapsed time in the flow extension)
- No scheduled check-ins
- "State Changed" button hidden
- Ends when user taps "End Session"

### 7.2 Check-in Schedule

Check-ins are scheduled at **¼, ½, ¾** of the effective total session duration. They are recalculated after every time adjustment.

**Algorithm:**
```
effectiveTotalSecs = current intended total session duration
ciPoints = [0.25, 0.5, 0.75].map(f => round(effectiveTotalSecs × f))
ciIdx = first index where ciPoints[i] > workSecs
```

`workSecs` = elapsed work time (excludes break time).

When a check-in point is reached (`workSecs >= ciPoints[ciIdx]`), the timer pauses and the Check-in sheet opens.

**Priority rule**: if `remSecs ≤ 0` on the same tick as a check-in point, the natural end takes priority (task finishes, no check-in).

### 7.3 End Session (Two-Tap Confirmation)
Because confirm dialogs are disruptive, the End button uses a two-tap pattern:
- **First tap**: button turns red, text changes to "Confirm?" — reverts after 3 seconds if no second tap
- **Second tap**: calls `finishTask()`

This prevents accidental session termination.

### 7.4 Pause / Resume
- Pauses the ticker; badge shows "Paused"
- Timer digits remain visible (showing frozen time)
- Resume restarts the ticker from exactly where it left off

### 7.5 Early Finish *(new in v1.1)*

An escape hatch that lets the user end a session early while still counting it as a **full successful completion** — not an abandonment.

#### Visibility Condition
The "🏁 Early Finish" button is shown only when:
```
task.mode == "countdown" AND workSecs >= effectiveTotalSecs / 2
```
i.e., at least 50% of the planned session has elapsed. Hidden before that.

#### Interaction (Two-tap confirmation)
- **First tap**: button text changes to "Confirm Early Finish?", style changes to confirming state (green filled). Reverts after 3 seconds if not confirmed.
- **Second tap**: calls `finishTask()` — identical path to natural completion

#### Result
- Session is saved and counted as complete (no "abandoned" flag)
- Summary screen shown normally with all check-in data
- Zone stats and North Star metrics updated normally

#### iOS Implementation Note
The Early Finish button should be visually distinct from End (which is destructive/red). Use green styling to signal "this is a positive action — you've earned it."

---

## 8. Check-in Screen

### Purpose
Periodic (or manual) cognitive state check-in. The user indicates which zone they're in by dragging on an interactive quadrant.

### Trigger Sources
- **Scheduled**: timer automatically pauses at ¼, ½, ¾ points
- **Manual**: user taps "State Changed" button on the timer screen

### Visual Design

The check-in uses a **drag quadrant board** — an interactive SVG (or Canvas on iOS) with:

- 4 quadrant background areas with low-opacity zone colours:
  - Top-left: Cruise (green)
  - Top-right: Flow (amber)
  - Bottom-left: Drift (grey)
  - Bottom-right: Grind (red)
- Axis lines (horizontal + vertical through centre)
- Small zone name labels inside each quadrant: "Cruise", "Flow", "Drift", "Grind"
- Axis labels: "Effective" (top), "Ineffective" (bottom), "Low effort" (left, rotated −90°), "High effort" (right, rotated +90°)
- A central origin dot

**Interaction:**
1. User touches anywhere on the board → a line appears from centre to touch point, coloured by whichever quadrant the touch falls in
2. Line and endpoint dot update live as user drags
3. Zone name label below the board updates live (e.g., "Flow" in amber)
4. On touch release → "Confirm · Flow" button appears (coloured with zone colour)
5. User taps Confirm → check-in is recorded, Zone Feedback screen opens

**Coordinate mapping (internal):**
- normX = horizontal offset from centre, normalised to [-1, 1]; positive = right = high exertion
- normY = vertical offset from centre, normalised to [-1, 1]; positive = down (screen coords) = low effectiveness
- Zone: `normX ≥ 0 && normY ≤ 0` → Flow; `normX < 0 && normY ≤ 0` → Cruise; `normX < 0 && normY > 0` → Drift; else → Grind
- Exertion score: `clamp(round(5 + normX × 4), 1, 9)`
- Effectiveness score: `clamp(round(5 + (−normY) × 4), 1, 9)` *(inverted because screen Y is downward)*

**Sound + Haptics (on scheduled check-in):**
- Two-tone chime: 880 Hz (0–300 ms) + 1320 Hz (200–500 ms), sine wave, max amplitude 0.25
- Haptic: medium impact × 2 with 40 ms gap (iOS: `UIImpactFeedbackGenerator`)

---

## 9. Zone Feedback Screen

### Purpose
After a check-in, show the user their zone, give brief feedback text, and apply the time adjustment.

### Screen Layout
1. Large emoji icon
2. Coloured zone tag (e.g., "Flow" on amber background)
3. Zone headline (e.g., "You're in Flow.")
4. Body text (zone-specific message)
5. Action button(s)

### 9.1 Zone-Specific Rules

#### Flow ⚡
**Headline:** "You're in Flow."
**Body:** "We've shortened the remaining time.\n\nContinue the countdown or ride the flow?"
**Time adjustment:** subtract `min(8 min, remSecs – 5 min)` from `remSecs` and `effectiveTotalSecs`; recalculate check-in points
**Buttons:**
- "Continue Countdown" → return to timer in countdown mode
- "Ride the Flow" → switch timer to countup/flow mode (§7.1)

#### Cruise 🚀
**Headline:** "You're cruising."
**Body:** "The task feels smooth, so we're lightly increasing the pace."
**Time adjustment:** subtract `min(5 min, remSecs – 5 min)` from `remSecs` and `effectiveTotalSecs`; recalculate check-in points
**Button:** "Continue" → return to timer

#### Grind 🔧
**Headline:** "You're grinding."
**Time adjustment:** none
**Condition A** (grindCount < 2):
  - Body: "High effort, low effectiveness.\nTake a 5-minute set break."
  - Button: "Start Break" → open Break screen
  - Increment `grindCount`
**Condition B** (grindCount ≥ 2):
  - Body: "You've already taken the max breaks.\nKeep pushing — you're almost there."
  - Button: "Continue" → return to timer
  - *(No further breaks offered)*

#### Drift 🌊
**Headline:** "You're drifting."
**Condition A** (driftCount < 2):
  - Body: "We'll add a short warmup period\nso you can properly enter the task."
  - Time adjustment: add 5 min to `remSecs` and `effectiveTotalSecs`; recalculate check-in points
  - Increment `driftCount`
**Condition B** (driftCount ≥ 2):
  - Body: "Focus on just the next 5 minutes.\nWhat's the single next action?"
  - *(No further time additions)*
**Button:** "Continue" → return to timer

### 9.2 Time Adjustment Safety Bounds
- Minimum remaining time after any subtraction: 5 minutes (`remSecs – cut ≥ 5 min`)
- Maximum Grind breaks per session: 2
- Maximum Drift extensions per session: 2

### 9.3 Recalculate Check-in Points
After any time adjustment, recalculate check-in schedule:
```
total    = effectiveTotalSecs
ciPoints = [0.25, 0.5, 0.75].map(f => round(total × f))
ciIdx    = first i where ciPoints[i] > workSecs
```

---

## 10. Break Screen

### Purpose
A 5-minute structured break triggered by a Grind check-in.

### Behaviour
- Countdown from 5:00
- "Skip Break" button available at all times
- When break ends (naturally or skipped): return to timer and resume countdown
- Break record is stored (durationMin, wasSkipped, startedAt, endedAt) for analytics

### Layout
- Label: "Set Break"
- Large red `MM:SS` countdown
- Hint text: "Rest now. The task will continue after this break."
- "Skip Break" button (secondary style)

---

## 11. Task Complete Screen (Summary)

### Purpose
Shown immediately after a session ends (natural end, two-tap End, or Early Finish). Celebrate completion, show performance data.

### Header
- "Task Completed ✓"
- Task name
- "Planned Xm · Actual Ym" meta line *(Actual = workMin + flowExtMin)*

### Per-Task Chart
Line chart with two series:
- X-axis: elapsed work minutes at each check-in
- Y-axis: 1–10 scale
- Series 1: **Exertion** (red line)
- Series 2: **Effectiveness** (green line)
- Data points = check-ins only (each check-in is one point)
- If no check-ins: chart is not rendered

### Zone Distribution
Card showing time in each zone:
- Flow: Xm
- Cruise: Xm
- Grind: Xm
- Drift: Xm

Zone time is computed via the distribution algorithm: for consecutive check-ins, the time between check-in[i] and check-in[i+1] is attributed to zone[i]; the last check-in's zone holds until the session end.

### Done Button
Returns to Home; updates today's zone stats.

---

## 12. History Screen

### Purpose
Post-session analytics. Three tabs showing performance over different time scales.

### Tab 1: By Task
- Chronological list (most recent first)
- Each card shows: task title, date, planned vs actual time, per-check-in line chart, zone distribution
- Empty state if no tasks

### Tab 2: By Day
- One card per day (most recent first)
- Each card: date + total work minutes, zone distribution, daily line chart
- Daily chart: X = clock time (HH:MM), Y = exertion/effectiveness; combines check-ins from all tasks on that day, sorted by timestamp

### Tab 3: By Week
- Last 7 calendar days
- Weekly line chart: X = day label (Mon/Tue etc.), Y = average exertion/effectiveness
  - Null values for days with no data (chart spans gaps)
- Per-day breakdown cards below the chart (days with data only)
  - Shows: day name, check-in count, avg exertion, avg effectiveness, zone minutes

### Chart Spec (all charts)
- iOS: Swift Charts (`LineMark`)
- Y-axis: 0–10, grid lines every 2
- X-axis: no grid lines
- Smooth tension: `.interpolationMethod(.catmullRom)`
- Points visible on all charts
- Legend at top

---

## 13. Task Planner Screen

### Purpose
Plan a task before starting it: name, duration, and nature (how challenging/constructive it is).

### Fields

**Task Name**
- Required text field, max 60 chars
- Cannot submit without a name

**Estimated Duration**
- Chip selector: 10m / 25m *(default)* / 45m / 60m / 90m

**Nature Drag Board**
- Same drag-quadrant interaction as the check-in board (§8), but with different axes:
  - Y-axis: Challenging (top) ↔ Easy (bottom)
  - X-axis: Distracting (left) ↔ Constructive (right)
- 4 colour areas:
  - Top-left (Challenging + Distracting): purple `#9C27B0`
  - Top-right (Challenging + Constructive): blue `#3D5AFE`
  - Bottom-left (Easy + Distracting): grey `#78909C`
  - Bottom-right (Easy + Constructive): green `#27AE60`
- No zone names on the board (just colour areas)
- Text label below the board updates live: e.g., "Challenging · Constructive"
- Drag is optional — if user doesn't drag, defaults to (5, 5) neutral

**Stored scores:**
- `constructiveness`: 1–9 (normX mapped to score, right = 9)
- `challengingness`: 1–9 (−normY mapped to score, top = 9)

### Submit
- "Add to Today's List" button
- On tap: creates Plan record, saves to storage, navigates to Task List

### Unfinished Tasks Section
At the top of the Planner screen, above the form: if there are plans from **previous days** (date ≠ today), show them in an "Unfinished from previous days" section.

Each unfinished task row:
- Coloured dot (nature colour)
- Task name + original date (e.g., "May 20")
- Duration
- **"Ship to Today"** button — updates the plan's date to today, resets manual order, refreshes home and task list

---

## 14. Task List Screen

### Purpose
View and manage today's planned tasks. Launch any task directly from here.

### Layout
- Back button + "Today's Tasks" heading
- Scrollable list of task cards
- "+ Add Task" button at bottom (navigates to Planner)
- Empty state: illustration + "No tasks yet. Tap + Add Task to plan your day."

### Task Card
Each card:
- ⠿ drag handle (left, for reordering)
- Small coloured dot (nature colour)
- Task name (truncated)
- Duration + nature text (e.g., "45m · Challenging · Constructive")
- **Start** button (right) → navigates to `startTask` with name and duration pre-filled
- **✕ Delete** button (far right) *(new in v1.1)* → immediately removes the task from the list; no confirmation dialog

### Delete Task Behaviour *(new in v1.1)*
- Tapping ✕ removes the plan record from storage immediately
- Both the Task List and the Home screen today's task section are refreshed
- No undo / no confirmation (tasks can be re-added via Planner)
- The ✕ button is styled subtly (muted, low opacity) to avoid accidental taps, but turns red on press

### Sorting
- **Default sort**: by `constructiveness` score descending (most constructive first)
- **After manual reorder**: sort by stored `order` index
- When a new task is added (order = null), it sorts by constructiveness until the user manually reorders

### Drag to Reorder
- Hold and drag the ⠿ handle to reorder
- The dragged item moves in real-time; list animates to show new position
- On release: `order` values (0, 1, 2, …) are written to all cards and persisted
- Once any card has a manual order value, constructiveness-sort no longer applies

---

## 15. Data Models

### Task (completed session record)
```
{
  id:            String       // "task_<timestamp>"
  title:         String
  plannedMin:    Int
  actualWorkMin: Int          // round(workSecs / 60)
  flowExtMin:    Int          // round(flowSecs / 60)
  earlyFinish:   Bool         // true if ended via Early Finish button
  startedAt:     ISO8601
  endedAt:       ISO8601
  checkIns:      [CheckIn]
  breaks:        [Break]
}
```

### CheckIn
```
{
  id:               String
  timestamp:        ISO8601
  elapsedWorkMin:   Float
  zone:             Enum      // "flow" | "cruise" | "grind" | "drift"
  exertion:         Int       // 1–9
  effectiveness:    Int       // 1–9
  timeAdj:          Int       // minutes added (+) or subtracted (−); 0 for grind
  source:           Enum      // "scheduled" | "manual"
}
```

### Break
```
{
  id:          String
  taskId:      String
  startedAt:   ISO8601
  endedAt:     ISO8601
  durationMin: Int
  trigger:     String        // "grind"
  wasSkipped:  Bool
}
```

### Plan (task planner entry)
```
{
  id:               String
  title:            String
  plannedMin:       Int
  constructiveness: Int       // 1–9
  challengingness:  Int       // 1–9
  date:             String    // ISO date string e.g. "2026-05-21"
  order:            Int?      // nil = constructiveness sort; Int = manual order
}
```

### Storage Keys (web prototype)
| Key | Content |
|-----|---------|
| `ddz_tasks` | Array of Task records (JSON) |
| `ddz_plans` | Array of Plan records (JSON) |

On iOS: use **SwiftData** (iOS 17+) or Codable + file storage. See §21 for backend-separated model.

---

## 16. Session State Machine

During an active session, the in-memory task object tracks:

```
effectiveTotalSecs   Int    // Starts = plannedMin × 60. Updated on every time adjustment.
remSecs              Int    // Remaining seconds.
workSecs             Int    // Seconds of actual work (excludes breaks).
flowSecs             Int    // Seconds in countup/flow mode.
mode                 Enum   // "countdown" | "countup"
isPaused             Bool
driftCount           Int    // 0–2
grindCount           Int    // 0–2
ciPoints             [Int]  // Scheduled check-in points in workSecs
ciIdx                Int    // Index of next pending check-in
checkIns             [CheckIn]
breaks               [Break]
earlyFinishPending   Bool   // Two-tap state for Early Finish
endPending           Bool   // Two-tap state for End
```

### Timer Tick Logic (1-second interval)
```
if isPaused: return

if mode == countdown:
    remSecs--
    workSecs++
    if remSecs <= 0:
        finishTask()
        return
    if workSecs >= ciPoints[ciIdx]:
        ciIdx++
        pauseTimer()
        openCheckin(source: .scheduled)
        return
else (countup):
    flowSecs++

updateUI()

// Early Finish button visibility
earlyBtn.visible = (mode == countdown) && (workSecs >= effectiveTotalSecs / 2)
```

---

## 17. iOS-Specific Implementation Notes

### 17.1 Background Timer Accuracy
When the app is backgrounded, iOS suspends the timer. On return to foreground:
1. Record `sessionStartWallTime` (Date) when the session begins
2. On `sceneDidBecomeActive`: recalculate `workSecs` as `Date.now() − sessionStartWallTime − totalPausedDuration − totalBreakDuration`
3. Update `remSecs` accordingly
4. Trigger any check-in points that were passed while backgrounded

### 17.2 Local Notifications
When a session starts, schedule local notifications for each upcoming check-in point:
```swift
let content = UNMutableNotificationContent()
content.title = "Check-in Time"
content.body  = "How is your brain right now?"
content.sound = UNNotificationSound.default
let trigger = UNTimeIntervalNotificationTrigger(
    timeInterval: Double(ciPoints[i] - workSecs), repeats: false)
```
Cancel all pending notifications when the session ends, pauses, or completes Early Finish.

### 17.3 Haptics
| Event | Haptic type |
|-------|-------------|
| Check-in triggers | Medium impact × 2, gap 40 ms |
| Zone Confirm tap | Light impact |
| Session complete (incl. Early Finish) | Success notification feedback |
| Ship to Today | Light impact |
| Delete task | Light impact |

### 17.4 Drag Quadrant (iOS)
Implement using `DragGesture` on a `Canvas` or `ZStack` with `GeometryReader`:
- Track gesture `.location` relative to view centre
- Clamp to circle radius
- Update line endpoint and endpoint dot in real-time
- Apply quadrant colour to line and dot
- On `gesture.onEnded`: lock position, show Confirm button

### 17.5 Chart Library
Use **Swift Charts** (iOS 16+):
- `LineMark` for exertion and effectiveness series
- `.symbol(Circle().strokeBorder(lineWidth: 1.5))` for data points
- `.interpolationMethod(.catmullRom)` for smooth curves
- Y-axis: 0–10 domain, step 2

---

## 18. Navigation Flow (Detailed)

```
App Launch
└── Splash (3.6s or tap)
    └── Home
        ├── [Start Focus]
        │   └── startTask
        │       └── [Start] → Timer
        │           ├── (scheduled check-in) → Checkin sheet
        │           │   └── [Confirm Zone] → ZoneAction sheet
        │           │       ├── Flow: [Continue Countdown] → Timer
        │           │       │         [Ride the Flow]     → Timer (countup)
        │           │       ├── Cruise/Drift: [Continue]  → Timer
        │           │       └── Grind: [Start Break]      → Break sheet
        │           │                   └── (break ends/skip) → Timer
        │           ├── (manual check-in) → same as above
        │           ├── (timer reaches 0) → Summary
        │           ├── [🏁 Early Finish] × 2 → Summary
        │           └── [End] × 2 taps → Summary
        │               └── [Done] → Home
        │
        ├── [Plan Today]
        │   └── tasklist
        │       ├── [✕ Delete] on any task → tasklist (refreshed)
        │       ├── [Start] on any task → startTask (pre-filled) → ...
        │       └── [+ Add Task]
        │           └── planner
        │               ├── [Ship to Today] → planner (refreshed)
        │               └── [Add to Today's List] → tasklist
        │
        └── [View History →]
            └── history (tabs: By Task / By Day / By Week)
```

---

## 19. Visual Design System

### Colours
```
--flow:   #F5A623   amber
--cruise: #27AE60   green
--grind:  #E53935   red
--drift:  #78909C   blue-grey
--bg:     #F4F5F7   light grey page background
--card:   #FFFFFF   white card surface
--text:   #1A1A2E   near-black
--muted:  #888888   secondary text
--border: #E5E7EB   divider / input border
--accent: #3D5AFE   primary button / interactive blue

Splash background: #07070F
```

### Typography
- System font (San Francisco on iOS)
- Large titles: 26px, weight 800
- Section titles: 20px, weight 700
- Body: 15px, weight 400
- Secondary: 13px, weight 400, muted colour
- Labels/caps: 12px, weight 700, uppercase, letter-spacing 0.5px
- Timer digits: 76px, weight 800, tabular numerals
- Splash headline bold: 64px, weight 900

### Buttons
| Style | Background | Text |
|-------|------------|------|
| Primary | `--accent` | White |
| Secondary | `--bg` | `--text`, 2px border |
| Ghost | Transparent | `--muted` |
| Danger (End) | `#FFEBEE` | `--grind` |
| Flow | `--flow` | White |
| Early Finish (confirming) | `--cruise` | White |
| Delete (✕) | None | `--muted` at 40% opacity |

---

## 20. Out of Scope for v1

- Account / sign-in / cloud sync *(see §21 for v2 architecture)*
- Push notifications requiring a backend
- Points, coins, badges, achievements
- Social sharing / leaderboards
- AI summaries or coaching
- Siri / Shortcuts integration
- Widgets (home screen / lock screen)
- Apple Watch companion
- Data export (CSV / HealthKit)
- Task categories or tags
- Recurring task templates
- iPad layout

---

---

# Part II — iOS Frontend/Backend Architecture Assessment

---

## 21. Current Architecture (Web Prototype)

The web prototype is a **fully client-side, zero-backend** application:

| Layer | Current solution |
|-------|-----------------|
| UI | Single HTML file, Vanilla JS |
| State | In-memory JS variables |
| Persistence | `localStorage` (browser key-value) |
| Auth | None |
| Sync | None |
| Analytics | None |

This works fine for a solo-user prototype but has three hard limits for a shipped iOS product:
1. **No identity** — data is tied to a single device/browser with no recovery
2. **No sync** — user loses everything if they change devices
3. **No analytics** — you have zero visibility into real usage

---

## 22. Recommended iOS Architecture: Offline-First with Optional Sync

The recommended approach for v1 iOS is **offline-first with CloudKit sync** — no custom backend required at launch. A custom REST API can be added in v2 when user accounts and server-side features are needed.

### 22.1 Option A — No Backend (v1 recommended)

```
┌─────────────────────────────────────────────┐
│                  iOS App                     │
│                                             │
│  SwiftUI Views                              │
│       ↕                                     │
│  ViewModels (ObservableObject / @Observable)│
│       ↕                                     │
│  SwiftData (local SQLite)                   │
│       ↕                                     │
│  CloudKit (automatic sync via SwiftData)    │
└─────────────────────────────────────────────┘
```

**How it works:**
- SwiftData with `modelContainer(for:..., configurations: ModelConfiguration(cloudKitContainerIdentifier:))` automatically syncs to iCloud
- User gets multi-device sync for free (iPhone ↔ iPad ↔ restored device)
- No server, no auth, no backend cost
- Works fully offline; syncs when network is available

**Trade-offs:**
- Requires user to be signed into iCloud (graceful fallback: local-only if not signed in)
- Cannot build server-side features (leaderboards, coach feedback, AI analysis) until v2
- CloudKit has opaque quotas (generous for typical usage)

### 22.2 Option B — Custom Backend (v2 / when needed)

```
┌─────────────────────────────────────────────┐
│                  iOS App                     │
│                                             │
│  SwiftUI Views                              │
│       ↕                                     │
│  ViewModels                                 │
│       ↕                                     │
│  Repository Layer                           │
│    ├─ LocalStore (SwiftData/CoreData)        │
│    └─ RemoteStore (URLSession / API client) │
└─────────────────────────────────────────────┘
                      ↕ HTTPS REST
┌─────────────────────────────────────────────┐
│               Backend (v2)                   │
│                                             │
│  Auth Service  ──  API Server  ──  DB       │
│  (Apple Sign In)  (FastAPI/   (PostgreSQL)  │
│                    Express)                 │
└─────────────────────────────────────────────┘
```

---

## 23. Changes Required: Web Prototype → iOS App

### 23.1 Architecture Changes

| Web | iOS |
|-----|-----|
| Single HTML file | SwiftUI app with proper MVVM |
| Vanilla JS functions | `@Observable` ViewModels per screen |
| `localStorage` JSON blobs | SwiftData model classes with proper relationships |
| In-memory session state | `SessionStore` singleton (`@Observable`) |
| `nav(screenId)` | `NavigationStack` + `NavigationPath` |
| `requestAnimationFrame` deferred renders | `.task {}` / `.onAppear {}` modifiers |
| Chart.js (JS) | Swift Charts |
| SVG drag board | `Canvas` + `DragGesture` |
| Web Audio API chime | `AVAudioEngine` or `SystemSoundID` |

### 23.2 New SwiftData Models

```swift
@Model class TaskRecord {
    var id: String
    var title: String
    var plannedMin: Int
    var actualWorkMin: Int
    var flowExtMin: Int
    var earlyFinish: Bool
    var startedAt: Date
    var endedAt: Date
    @Relationship(deleteRule: .cascade) var checkIns: [CheckInRecord]
    @Relationship(deleteRule: .cascade) var breaks: [BreakRecord]
}

@Model class CheckInRecord {
    var id: String
    var timestamp: Date
    var elapsedWorkMin: Double
    var zone: String          // "flow" | "cruise" | "grind" | "drift"
    var exertion: Int
    var effectiveness: Int
    var timeAdj: Int
    var source: String
    var task: TaskRecord?
}

@Model class PlanRecord {
    var id: String
    var title: String
    var plannedMin: Int
    var constructiveness: Int
    var challengingness: Int
    var date: Date
    var order: Int?
}
```

### 23.3 ViewModels Needed

| ViewModel | Replaces |
|-----------|----------|
| `HomeViewModel` | `refreshHome()` |
| `SessionViewModel` | `task`, `ticker`, `drawTimer()`, `finishTask()` |
| `CheckInViewModel` | `openCheckin()`, `confirmCiZone()`, drag state |
| `PlannerViewModel` | `addPlan()`, `plannerNorm`, `plannerDur` |
| `TaskListViewModel` | `renderTaskList()`, drag-reorder logic, `deletePlan()` |
| `HistoryViewModel` | `renderHistory()`, tab switching |
| `NorthStarViewModel` | `renderNorthStar()`, rolling 24h calculations |

### 23.4 New Complexity on iOS vs Web

| Area | Web (easy) | iOS (needs work) |
|------|-----------|-----------------|
| Background timer | Not applicable | Wall-clock correction on foreground return (§17.1) |
| Notifications | Not possible | `UNUserNotificationCenter` scheduling at session start |
| Haptics | Not available | `UIImpactFeedbackGenerator` throughout |
| Drag quadrant | SVG + Pointer Events | `Canvas` + `DragGesture` + `GeometryReader` |
| Audio chime | Web Audio API | `AVAudioEngine` (2-oscillator mix) |
| Persistence | `localStorage` | SwiftData + optional CloudKit |
| North Star gauge | SVG arc path math | `Path.addArc()` in SwiftUI `Canvas` |
| Doughnut chart | Chart.js | Swift Charts `SectorMark` (iOS 17+) or custom |

### 23.5 New Screens Needed (iOS-only)

These don't exist in the web prototype but are required for a real iOS product:

| Screen | Purpose |
|--------|---------|
| **iCloud Sign-in prompt** | If iCloud not enabled, offer to use local-only mode with a warning |
| **Notification permission request** | On first session start; non-blocking if denied |
| **Settings screen** | Default duration, notification preferences, data export, app version |

---

## 24. If Custom Backend Added (v2 Details)

### 24.1 Auth Flow
1. User taps "Sign in with Apple" (mandatory for App Store apps that use social auth)
2. App receives Apple ID token
3. App POSTs token to backend: `POST /api/auth/apple`
4. Backend validates with Apple, creates user record, returns JWT
5. JWT stored in iOS **Keychain** (never UserDefaults)
6. All subsequent API requests include `Authorization: Bearer <jwt>`

### 24.2 Required API Endpoints

```
Auth
  POST  /api/auth/apple         Exchange Apple ID token for JWT

Plans
  GET   /api/plans?date=        Fetch plans for a given date
  POST  /api/plans              Create plan
  PATCH /api/plans/:id          Update plan (ship to today, reorder, edit)
  DELETE /api/plans/:id         Delete plan

Sessions
  POST  /api/sessions           Save completed session + all check-ins + breaks
  GET   /api/sessions           Fetch history (with pagination, date filters)
  GET   /api/sessions/:id       Fetch single session detail

Stats
  GET   /api/stats/northstar    Rolling 24h strain + fire (or compute client-side)
  GET   /api/stats/weekly       Weekly aggregates for history tab
```

### 24.3 Offline-First Sync Strategy
For a shipped product, all writes should work offline and sync when online:

```
User action → write to local SwiftData → mark as "pending sync"
Background task / network resume → upload pending records to server
Server response → mark local records as "synced"
Pull on app open → fetch server records newer than last sync timestamp
Conflict rule: server wins (last-write-wins is fine for this use case)
```

### 24.4 Recommended Backend Stack (if built)

| Component | Recommendation | Reason |
|-----------|---------------|--------|
| API server | **FastAPI** (Python) or **Hono** (TypeScript) | Fast to build, type-safe |
| Database | **PostgreSQL** via Supabase | Managed, free tier, built-in auth option |
| Auth | **Supabase Auth** with Apple provider | Handles Apple Sign In + JWT out of the box |
| Hosting | **Railway** or **Fly.io** | Simple deploy, auto-scale, affordable |
| Analytics | **PostHog** (self-hosted or cloud) | Event tracking without surrendering user data |

### 24.5 When to Add a Backend

Add a custom backend when **any** of the following are needed:
- User accounts visible to you (e.g., to contact users)
- Server-side AI / coaching features
- Cross-user features (leaderboards, challenges, sharing)
- Analytics dashboards (session counts, retention, zone distribution across users)
- Export to third-party tools (Notion, Calendars, HealthKit sync)

**Do not add a backend for v1 iOS.** CloudKit via SwiftData gives you sync for free with zero operational cost. Ship fast, validate the product, add backend in v2.

---

## 25. Open Questions for iOS Build

1. **iOS minimum version**: iOS 16 (Swift Charts, minimum) or iOS 17 (SwiftData, `SectorMark`)? Recommendation: iOS 17+ — 93%+ of active devices by late 2026.
2. **CloudKit vs. no sync**: Is sync required for v1? If users are likely to have both iPhone and iPad, yes. If phone-only, local is fine for v1.
3. **Timer precision**: Use `DispatchSourceTimer` (not `Timer.scheduledTimer`) to reduce drift. Apply wall-clock correction on every foreground return (§17.1).
4. **Doughnut chart**: `SectorMark` (iOS 17) renders naturally. For iOS 16, use a custom `Path`-based arc drawing.
5. **Splash screen duration**: 3.6 s is long for a returning user who opens the app 10× per day. Consider shortening to 1.5–2 s for iOS, or only showing it once per day.
6. **Early Finish analytics**: Track `earlyFinish: true` on sessions — this tells you how often users are over-planning. High early finish rate = reduce default durations.
7. **Delete task confirmation**: Currently no confirmation dialog (matching web). Recommend keeping it frictionless but adding an "Undo" toast (3-second window) on iOS.

---

## 26. iOS Build — Effort Estimate & Sprint Breakdown

Assumes a single full-stack iOS developer familiar with SwiftUI and Swift Charts. Sprints are 1 week.

| Sprint | Focus | Deliverables |
|--------|-------|-------------|
| **S1** | Project scaffold + data layer | Xcode project, SwiftData models (`TaskRecord`, `CheckInRecord`, `PlanRecord`), CloudKit container wiring, basic `NavigationStack` skeleton |
| **S2** | Home screen | Splash screen, North Star gauges (`Path.addArc`), Today's Tasks list, Today's Zones (`SectorMark` donut), `HomeViewModel` |
| **S3** | Session flow — timer + check-in | Timer screen (`DispatchSourceTimer`, wall-clock correction), Check-in drag quadrant (`Canvas` + `DragGesture`), Zone Action screen, Early Finish logic |
| **S4** | Session flow — break + summary | Break countdown, Summary screen (`LineChart`), zone distribution, `SessionViewModel` finish logic |
| **S5** | Planning screens | Task List (drag-to-reorder with `.onMove`), Planner screen (quadrant board for task nature), delete + ship-to-today |
| **S6** | History screens | By Task / By Day / By Week tabs, `LineChart` per task, weekly aggregates, `HistoryViewModel` |
| **S7** | Polish + iOS-only screens | Notification permission request (`UNUserNotificationCenter`), Settings screen, haptics throughout (`UIImpactFeedbackGenerator`), `AVAudioEngine` chime |
| **S8** | QA + TestFlight | Bug fixes, edge-case handling (empty states, date rollover, backgrounding), App Store screenshots, TestFlight beta |

**Total: ~8 weeks** for a polished v1 TestFlight build.

### Rough effort breakdown by area

| Area | Effort | Notes |
|------|--------|-------|
| Data layer (SwiftData + CloudKit) | 3 days | Straightforward; CloudKit wiring can be tricky first time |
| Drag quadrant board | 3 days | Biggest rewrite; Canvas + DragGesture geometry needs careful work |
| Timer + background handling | 2 days | Wall-clock correction + `DispatchSourceTimer` |
| Charts (North Star gauges + line + donut) | 3 days | Swift Charts is clean but gauge needs custom `Canvas` |
| Navigation + screen layout | 4 days | All 10+ screens in SwiftUI |
| Notifications + haptics + audio | 2 days | Well-documented APIs, low risk |
| Settings + edge cases + polish | 3 days | Always takes longer than expected |
| QA + TestFlight prep | 3 days | — |
| **Total** | **~23 dev-days** | ≈ 8 weeks solo, 4 weeks with 2 devs |

### Key risks

1. **Drag quadrant geometry** — translating SVG coordinate math to SwiftUI `Canvas` + `GeometryReader` is the highest-complexity task. Build and validate this in S3 before anything else.
2. **Background timer drift** — `DispatchSourceTimer` reduces but does not eliminate drift; wall-clock correction on foreground return is mandatory.
3. **CloudKit first-time setup** — entitlements, container IDs, and iCloud capability provisioning can eat a full day if new to it.
4. **Swift Charts `SectorMark`** — iOS 17+ only; if targeting iOS 16, the donut chart needs a custom `Path` implementation (~1 extra day).

---

*Document version: 1.1 — May 2026*
*Based on: DingDing Zones web prototype (dingding_zones.html)*
*v1.1 adds: Splash Screen, North Star Dashboard, Early Finish, Doughnut Chart, Delete Task, iOS architecture assessment*
*Next revision: after iOS v1 alpha testing*
