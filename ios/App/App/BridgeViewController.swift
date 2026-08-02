import Capacitor

final class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // App-local plugins are not included in Capacitor's generated package
        // registration list. registerPluginType(_:) is a no-op while automatic
        // package registration is enabled, so export this instance explicitly.
        bridge?.registerPluginInstance(FocusLiveActivityPlugin())
    }
}
