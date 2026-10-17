import Capacitor
import WidgetKit

@objc(VictusPlugin)
public class VictusPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VictusPlugin"
    public let jsName = "Victus"
    public let pluginMethods: [CAPPluginMethod] = ["read", "sync", "clear", "requestPin"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
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
            WidgetCenter.shared.reloadAllTimelines(); call.resolve()
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
            WidgetCenter.shared.reloadAllTimelines(); call.resolve()
        }
        catch { call.reject("Unable to clear Victus", nil, error) }
    }
    @objc func requestPin(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
}
