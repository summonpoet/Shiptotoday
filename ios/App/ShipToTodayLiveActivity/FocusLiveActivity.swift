import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.2, *)
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            LockScreenFocusView(context: context)
                .activityBackgroundTint(Color(red: 0.08, green: 0.10, blue: 0.16).opacity(0.96))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "shiptotoday://timer"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Focus", systemImage: "timer")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.82))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    StatusPill(status: context.state.status)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(context.attributes.taskName)
                            .font(.headline)
                            .lineLimit(1)
                        FocusTimerText(state: context.state, font: .system(size: 34, weight: .semibold, design: .rounded))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(.blue)
                    .accessibilityLabel("Focus timer")
            } compactTrailing: {
                FocusTimerText(state: context.state, font: .caption.monospacedDigit())
                    .frame(minWidth: 42)
            } minimal: {
                Image(systemName: context.state.isRunning ? "timer" : "pause.fill")
                    .foregroundStyle(context.state.isRunning ? .blue : .orange)
                    .accessibilityLabel(context.state.status)
            }
            .widgetURL(URL(string: "shiptotoday://timer"))
            .keylineTint(.blue)
        }
    }
}

@available(iOSApplicationExtension 16.2, *)
private struct LockScreenFocusView: View {
    let context: ActivityViewContext<FocusActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "timer")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.blue)
                .frame(width: 40, height: 40)
                .background(.white.opacity(0.08), in: Circle())
            VStack(alignment: .leading, spacing: 5) {
                Text(context.attributes.taskName)
                    .font(.headline)
                    .lineLimit(1)
                Text(context.state.status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 10)
            FocusTimerText(state: context.state, font: .system(size: 32, weight: .semibold, design: .rounded))
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

@available(iOSApplicationExtension 16.2, *)
private struct FocusTimerText: View {
    let state: FocusActivityAttributes.ContentState
    let font: Font

    var body: some View {
        Group {
            if state.isRunning && state.countsDown {
                Text(timerInterval: Date.now...max(state.timerDate, Date.now), countsDown: true)
            } else if state.isRunning {
                Text(state.timerDate, style: .timer)
            } else {
                Text(formattedSeconds(state.seconds))
            }
        }
        .font(font)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.72)
    }

    private func formattedSeconds(_ total: Int) -> String {
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

@available(iOSApplicationExtension 16.2, *)
private struct StatusPill: View {
    let status: String

    var body: some View {
        Text(status)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor.opacity(0.22), in: Capsule())
            .foregroundStyle(statusColor)
    }

    private var statusColor: Color {
        switch status {
        case "Away": return .orange
        case "Paused", "Check-in", "Break": return .yellow
        case "Flow": return .cyan
        default: return .blue
        }
    }
}
