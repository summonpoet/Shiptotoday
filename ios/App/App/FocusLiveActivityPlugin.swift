import ActivityKit
import Capacitor
import Foundation

@objc(FocusLiveActivityPlugin)
public class FocusLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FocusLiveActivityPlugin"
    public let jsName = "FocusLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["supported": true, "enabled": false])
            return
        }
        guard let taskID = call.getString("taskID"),
              let taskName = call.getString("taskName"),
              let state = contentState(from: call) else {
            call.reject("Missing Live Activity state")
            return
        }

        Task { @MainActor in
            do {
                let activities = Activity<FocusActivityAttributes>.activities
                if let existing = activities.first(where: { $0.attributes.taskID == taskID }) {
                    await existing.update(content(for: state))
                    call.resolve(["supported": true, "enabled": true, "id": existing.id])
                    return
                }
                for activity in activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                let attributes = FocusActivityAttributes(taskID: taskID, taskName: taskName)
                let activity = try Activity.request(
                    attributes: attributes,
                    content: content(for: state),
                    pushType: nil
                )
                call.resolve(["supported": true, "enabled": true, "id": activity.id])
            } catch {
                call.reject("Unable to start Live Activity", nil, error)
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        guard let state = contentState(from: call) else {
            call.reject("Missing Live Activity state")
            return
        }
        let taskID = call.getString("taskID")

        Task { @MainActor in
            let activity = Activity<FocusActivityAttributes>.activities.first {
                taskID == nil || $0.attributes.taskID == taskID
            }
            guard let activity else {
                call.resolve(["supported": true, "updated": false])
                return
            }
            await activity.update(content(for: state))
            call.resolve(["supported": true, "updated": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false])
            return
        }
        let taskID = call.getString("taskID")

        Task { @MainActor in
            let activities = Activity<FocusActivityAttributes>.activities.filter {
                taskID == nil || $0.attributes.taskID == taskID
            }
            for activity in activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve(["supported": true, "ended": activities.count])
        }
    }

    @available(iOS 16.2, *)
    private func contentState(from call: CAPPluginCall) -> FocusActivityAttributes.ContentState? {
        guard let timerDateMs = call.getDouble("timerDate"),
              let seconds = call.getInt("seconds"),
              let isRunning = call.getBool("isRunning"),
              let countsDown = call.getBool("countsDown"),
              let status = call.getString("status") else {
            return nil
        }
        return FocusActivityAttributes.ContentState(
            timerDate: Date(timeIntervalSince1970: timerDateMs / 1000),
            seconds: max(0, seconds),
            isRunning: isRunning,
            countsDown: countsDown,
            status: status
        )
    }

    @available(iOS 16.2, *)
    private func content(for state: FocusActivityAttributes.ContentState) -> ActivityContent<FocusActivityAttributes.ContentState> {
        let staleDate = state.isRunning && state.countsDown ? state.timerDate : nil
        return ActivityContent(state: state, staleDate: staleDate)
    }
}
