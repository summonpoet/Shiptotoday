import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct FocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let referenceDate: Date?
        let timerDate: Date
        let seconds: Int
        let nextCheckInDate: Date?
        let nextCheckInSeconds: Int?
        let isRunning: Bool
        let countsDown: Bool
        let status: String
    }

    let taskID: String
    let taskName: String
}
