import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.2, *)
@main
struct ShipToTodayWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusLiveActivity()
    }
}
