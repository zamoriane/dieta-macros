import ActivityKit
import AppIntents
import WidgetKit
import Foundation

@available(iOS 17.0, *)
struct VictusAttributes: ActivityAttributes {
    struct Cup: Codable, Hashable { let ml: Int; let beverage: String; let label: String }
    struct ContentState: Codable, Hashable {
        let consumed: Int
        let goal: Int
        let mood: String
        let english: Bool
        let pending: Int
        let cups: [Cup]
    }
    let owner: String
    let day: String
    let expires: Date
}

// Both the app plugin and extension compile this file. The App Group remains
// the source of truth; activity content never carries authentication credentials.
@available(iOS 17.0, *)
actor VictusLive {
    static let shared = VictusLive()
    func content(_ state: [String: Any]) -> VictusAttributes.ContentState? {
        guard let s = state["snapshot"] as? [String: Any],
              s["day"] as? String == VictusStore.day(),
              let goal = s["goalMl"] as? Int, goal > 0 else { return nil }
        let now = Date(), c = Calendar.current
        let consumed = VictusStore.consumed(state, at: now)
        let minute = c.component(.hour, from: now) * 60 + c.component(.minute, from: now)
        let active = (s["days"] as? [Int] ?? Array(0...6)).contains(c.component(.weekday, from: now) - 1)
        let cups = (s["cups"] as? [[String: Any]] ?? []).prefix(2).compactMap { cup -> VictusAttributes.Cup? in
            guard let ml = cup["ml"] as? Int, let beverage = cup["bebida"] as? String else { return nil }
            return .init(ml: ml, beverage: beverage, label: cup["label"] as? String ?? beverage)
        }
        return .init(consumed: consumed, goal: goal,
                     mood: VictusStore.mood(consumed: consumed, goal: goal, minute: minute,
                                           start: s["start"] as? Int ?? 540, end: s["end"] as? Int ?? 1260, active: active),
                     english: s["locale"] as? String == "en",
                     pending: (state["pending"] as? [[String: Any]] ?? []).count, cups: cups)
    }
    func start() async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw NSError(domain: "VictusLive", code: 1, userInfo: [NSLocalizedDescriptionKey: "Live Activities disabled"])
        }
        // Refresh and remove expired sessions first. Never restart on background sync.
        await refresh()
        let state = try VictusStore.transaction { _ in }
        guard let owner = state["owner"] as? String, !owner.isEmpty, let value = content(state), value.consumed < value.goal else {
            throw NSError(domain: "VictusLive", code: 2, userInfo: [NSLocalizedDescriptionKey: "Open Water and sync today's goal first"])
        }
        if Activity<VictusAttributes>.activities.contains(where: { $0.attributes.owner == owner && $0.activityState == .active }) { return }
        let now = Date()
        let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now))!
        let expiry = min(now.addingTimeInterval(8 * 3600), midnight)
        _ = try Activity.request(attributes: VictusAttributes(owner: owner, day: VictusStore.day(), expires: expiry),
                                 content: ActivityContent(state: value, staleDate: expiry), pushType: nil)
    }
    func stop() async {
        for a in Activity<VictusAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }
    func refresh() async {
        let state = (try? VictusStore.transaction { _ in }) ?? [:]
        for a in Activity<VictusAttributes>.activities {
            guard a.attributes.owner == state["owner"] as? String,
                  a.attributes.day == VictusStore.day(), Date() < a.attributes.expires,
                  let value = content(state) else {
                await a.end(nil, dismissalPolicy: .immediate); continue
            }
            let update = ActivityContent(state: value, staleDate: a.attributes.expires)
            if value.consumed >= value.goal {
                await a.end(update, dismissalPolicy: .after(Date().addingTimeInterval(60)))
            } else { await a.update(update) }
        }
    }
}

@available(iOS 17.0, *)
struct VictusLiveDrink: LiveActivityIntent {
    static var title: LocalizedStringResource = "Registar bebida / Log drink"
    static var openAppWhenRun = false
    @Parameter(title: "Conta / Account") var owner: String
    @Parameter(title: "Volume") var ml: Int
    @Parameter(title: "Bebida / Drink") var beverage: String
    init() {}
    init(owner: String, ml: Int, beverage: String) { self.owner = owner; self.ml = ml; self.beverage = beverage }
    func perform() async throws -> some IntentResult {
        guard Activity<VictusAttributes>.activities.contains(where: {
            $0.attributes.owner == owner && $0.attributes.day == VictusStore.day() && Date() < $0.attributes.expires && $0.activityState == .active
        }) else { return .result() }
        try VictusStore.add(owner: owner, ml: ml, beverage: beverage)
        WidgetCenter.shared.reloadAllTimelines()
        await VictusLive.shared.refresh()
        return .result()
    }
}
