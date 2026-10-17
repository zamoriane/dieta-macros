import Capacitor
import WidgetKit
import ActivityKit

@objc(VictusPlugin)
public class VictusPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VictusPlugin"
    public let jsName = "Victus"
    public let pluginMethods: [CAPPluginMethod] = ["read", "sync", "clear", "requestPin", "liveStatus", "startLive", "stopLive"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    @objc func liveStatus(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            call.resolve(["supported": true, "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
                          "active": Activity<VictusAttributes>.activities.contains { $0.activityState == .active }])
        } else { call.resolve(["supported": false, "enabled": false, "active": false]) }
    }
    @objc func startLive(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            Task { @MainActor in
                do { try await VictusLive.shared.start(); call.resolve() }
                catch { call.reject("Unable to start Live Activity", nil, error) }
            }
        } else { call.reject("Requires iOS 17") }
    }
    @objc func stopLive(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) { Task { await VictusLive.shared.stop(); call.resolve() } }
        else { call.resolve() }
    }
    private func refreshLive() {
        if #available(iOS 17.0, *) { Task { await VictusLive.shared.refresh() } }
    }
    @objc func read(_ call: CAPPluginCall) {
        guard let owner = call.getString("owner"), !owner.isEmpty else { call.reject("Missing owner"); return }
        do {
            let result = try VictusStore.transaction { state in
                if state["owner"] as? String != owner {
                    var archives = state["archives"] as? [String: [[String: Any]]] ?? [:]
                    if let previous = state["owner"] as? String, let pending = state["pending"] as? [[String: Any]], !pending.isEmpty { archives[previous] = pending }
                    let restored = archives.removeValue(forKey: owner) ?? []
                    state = ["owner": owner, "pending": restored, "archives": archives]
                }
                // Submitted entries cannot be undone while an HTTP request may be committing.
                state["pending"] = (state["pending"] as? [[String: Any]] ?? []).map { event in
                    var copy = event; copy["attempted"] = true; return copy
                }
            }
            WidgetCenter.shared.reloadAllTimelines()
            refreshLive()
            call.resolve(["pending": result["pending"] ?? []])
        } catch { call.reject("Unable to read Victus", nil, error) }
    }
    @objc func sync(_ call: CAPPluginCall) {
        guard let owner = call.getString("owner"), let snapshot = call.getObject("snapshot") else { call.reject("Missing snapshot"); return }
        let ids = Set(call.getArray("ackIds", String.self) ?? [])
        do {
            _ = try VictusStore.transaction { state in
                guard state["owner"] as? String == owner else { return }
                state["snapshot"] = snapshot
                state["pending"] = (state["pending"] as? [[String: Any]] ?? []).filter { !ids.contains($0["id"] as? String ?? "") }
            }
            WidgetCenter.shared.reloadAllTimelines(); refreshLive(); call.resolve()
        } catch { call.reject("Unable to sync Victus", nil, error) }
    }
    @objc func clear(_ call: CAPPluginCall) {
        do {
            _ = try VictusStore.transaction { state in
                var archives = state["archives"] as? [String: [[String: Any]]] ?? [:]
                if let owner = state["owner"] as? String {
                    if call.getBool("purge") == true { archives.removeValue(forKey: owner) }
                    else if let pending = state["pending"] as? [[String: Any]], !pending.isEmpty { archives[owner] = pending }
                }
                state = ["archives": archives]
            }
            WidgetCenter.shared.reloadAllTimelines(); refreshLive(); call.resolve()
        }
        catch { call.reject("Unable to clear Victus", nil, error) }
    }
    @objc func requestPin(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
}
