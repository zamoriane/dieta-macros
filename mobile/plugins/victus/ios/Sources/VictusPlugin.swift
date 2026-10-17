import Capacitor
import WidgetKit
import ActivityKit
import UIKit

@objc(VictusPlugin)
public class VictusPlugin: CAPPlugin, CAPBridgedPlugin {
    private var pushStartTask: Task<Void, Never>?
    private var activityTask: Task<Void, Never>?
    public override func load() {
        if #available(iOS 17.0, *) {
            activityTask = Task {
                for await _ in Activity<VictusAttributes>.activityUpdates {
                    if Task.isCancelled { return }
                    await VictusLive.shared.refresh()
                }
            }
        }
        if #available(iOS 17.2, *) {
            pushStartTask = Task { [weak self] in
                for await token in Activity<VictusAttributes>.pushToStartTokenUpdates {
                    guard self != nil, !Task.isCancelled else { return }
                    VictusConsent.defaults.set(token.map { String(format: "%02x", $0) }.joined(), forKey: "live.pushStart")
                }
            }
        }
    }
    deinit { pushStartTask?.cancel(); activityTask?.cancel() }
    public let identifier = "VictusPlugin"
    public let jsName = "Victus"
    public let pluginMethods: [CAPPluginMethod] = ["read", "sync", "clear", "requestPin", "liveStatus", "startLive", "stopLive", "setLiveConsent"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    @objc func setLiveConsent(_ call: CAPPluginCall) {
        guard let choice = call.getString("choice"), ["accepted", "later", "off"].contains(choice),
              let state = try? VictusStore.transaction({ _ in }), let owner = state["owner"] as? String, !owner.isEmpty else {
            call.reject("Sync account before setting consent"); return
        }
        VictusConsent.set(choice, owner: owner)
        if #available(iOS 17.0, *) {
            Task { @MainActor in
                if choice != "accepted" { await VictusLive.shared.stop() }
                else if UIApplication.shared.applicationState == .active { await VictusLive.shared.foreground() }
                call.resolve()
            }
        } else { call.resolve() }
    }
    @objc func liveStatus(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            let state = (try? VictusStore.transaction { _ in }) ?? [:]
            let owner = state["owner"] as? String ?? ""
            let installation = VictusConsent.defaults.string(forKey: "live.installation") ?? UUID().uuidString.lowercased()
            VictusConsent.defaults.set(installation, forKey: "live.installation")
            call.resolve(["supported": true, "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
                          "consentVersion": 1, "choice": owner.isEmpty ? "unknown" : VictusConsent.choice(owner),
                          "installationId": installation,
                          "lastStartedDay": VictusConsent.lastDay(owner) ?? "",
                          "pushStartToken": (VictusConsent.choice(owner) == "accepted" && ActivityAuthorizationInfo().areActivitiesEnabled) ? (VictusConsent.defaults.string(forKey: "live.pushStart") ?? "") : "",
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
    private func refreshLive(foreground: Bool = false) {
        if #available(iOS 17.0, *) { Task { @MainActor in
            if foreground && UIApplication.shared.applicationState == .active { await VictusLive.shared.foreground() }
            else { await VictusLive.shared.refresh() }
        } }
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
            WidgetCenter.shared.reloadAllTimelines()
            if #available(iOS 17.0, *) {
                Task { @MainActor in
                    if UIApplication.shared.applicationState == .active { await VictusLive.shared.foreground() }
                    else { await VictusLive.shared.refresh() }
                    call.resolve()
                }
            } else { call.resolve() }
        } catch { call.reject("Unable to sync Victus", nil, error) }
    }
    @objc func clear(_ call: CAPPluginCall) {
        do {
            _ = try VictusStore.transaction { state in
                var archives = state["archives"] as? [String: [[String: Any]]] ?? [:]
                if let owner = state["owner"] as? String {
                    if call.getBool("purge") == true { archives.removeValue(forKey: owner); VictusConsent.purge(owner) }
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
