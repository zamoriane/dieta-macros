import SwiftUI
import WidgetKit
import AppIntents

struct DrinkIntent: AppIntent {
    static var title: LocalizedStringResource = "Registar bebida / Log drink"
    static var openAppWhenRun = false
    @Parameter(title: "Conta / Account") var owner: String
    @Parameter(title: "Volume") var ml: Int
    @Parameter(title: "Bebida / Drink") var beverage: String
    init() {}
    init(owner: String, ml: Int, beverage: String) { self.owner = owner; self.ml = ml; self.beverage = beverage }
    func perform() async throws -> some IntentResult {
        try VictusStore.add(owner: owner, ml: ml, beverage: beverage)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
struct UndoIntent: AppIntent {
    static var title: LocalizedStringResource = "Desfazer / Undo"
    static var openAppWhenRun = false
    @Parameter(title: "Conta / Account") var owner: String
    init() {}
    init(owner: String) { self.owner = owner }
    func perform() async throws -> some IntentResult {
        try VictusStore.undo(owner: owner); WidgetCenter.shared.reloadAllTimelines(); return .result()
    }
}
struct WaterEntry: TimelineEntry { let date: Date; let state: [String: Any] }
struct WaterProvider: TimelineProvider {
    func placeholder(in context: Context) -> WaterEntry { WaterEntry(date: Date(), state: [:]) }
    func getSnapshot(in context: Context, completion: @escaping (WaterEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WaterEntry>) -> Void) {
        let now = Date()
        let state = (try? VictusStore.transaction { _ in }) ?? [:]
        let entries = (0..<25).map { WaterEntry(date: now.addingTimeInterval(Double($0) * 1800), state: state) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}
struct VictusView: View {
    let entry: WaterEntry
    @Environment(\.widgetFamily) var family
    let teal = Color(red: 0, green: 0.38, blue: 0.38)
    var body: some View {
        let s = entry.state["snapshot"] as? [String: Any] ?? [:]
        let owner = entry.state["owner"] as? String ?? ""
        let en = s["locale"] as? String == "en"
        let ready = !s.isEmpty && !owner.isEmpty
        let consumed = VictusStore.consumed(entry.state, at: entry.date)
        let goal = max(1, s["goalMl"] as? Int ?? 2000)
        let calendar = Calendar.current
        let minute = calendar.component(.hour, from: entry.date) * 60 + calendar.component(.minute, from: entry.date)
        let active = (s["days"] as? [Int] ?? Array(0...6)).contains(calendar.component(.weekday, from: entry.date) - 1)
        let mood = VictusStore.mood(consumed: consumed, goal: goal, minute: minute, start: s["start"] as? Int ?? 540, end: s["end"] as? Int ?? 1260, active: active)
        let names = en ? ["sleepy": "Ready to start?", "grumpy": "Time for a glass?", "encouraging": "You’ve got this!", "happy": "Goal reached!"] : ["sleepy": "Vamos começar?", "grumpy": "Um copo agora?", "encouraging": "Vamos a isso!", "happy": "Meta atingida!"]
        let pending = entry.state["pending"] as? [[String: Any]] ?? []
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("VICTUS · " + (en ? "WATER" : "ÁGUA")).font(.caption2.bold())
                    Text(ready ? (mood == "encouraging" && consumed >= goal * 3 / 4 ? (en ? "Almost there!" : "Falta pouco!") : names[mood]!) : (en ? "Open Taking Care" : "Abra a Taking Care")).font(.headline).minimumScaleFactor(0.7)
                    if ready { Text("\(consumed) / \(goal) ml").font(.subheadline.monospacedDigit()) }
                }
                Spacer(minLength: 0)
                Image(mood).resizable().scaledToFit().frame(width: family == .systemSmall ? 42 : 72, height: family == .systemSmall ? 44 : 58).accessibilityHidden(true)
            }
            if ready {
                ProgressView(value: min(Double(consumed) / Double(goal), 1)).tint(teal)
                let cups = Array((s["cups"] as? [[String: Any]] ?? []).prefix(family == .systemSmall ? 1 : 2))
                HStack(spacing: 5) {
                    ForEach(cups.indices, id: \.self) { i in
                        let cup = cups[i]
                        Button(intent: DrinkIntent(owner: owner, ml: cup["ml"] as? Int ?? 250, beverage: cup["bebida"] as? String ?? "agua")) {
                            VStack(spacing: 1) {
                                Text("+\(cup["ml"] as? Int ?? 250) ml").bold()
                                Text(cup["label"] as? String ?? "").lineLimit(1).minimumScaleFactor(0.7)
                            }.font(.caption2).frame(maxWidth: .infinity)
                        }.tint(teal).buttonStyle(.bordered)
                    }
                    Link(destination: URL(string: "takingcare://agua")!) { Text(en ? "More" : "Mais").font(.caption2) }
                }
                HStack(spacing: 4) {
                    Text(pending.isEmpty ? (s["day"] as? String == VictusStore.day(entry.date) ? (en ? "Synced with app" : "Atualizado pela app") : (en ? "Open app to refresh goal" : "Abra a app para atualizar meta")) : (en ? "\(pending.count) pending · open app" : "\(pending.count) pendentes · abra a app")).lineLimit(1).minimumScaleFactor(0.6)
                    if let last = pending.last, last["attempted"] as? Bool != true { Button(intent: UndoIntent(owner: owner)) { Image(systemName: "arrow.uturn.backward") }.accessibilityLabel(en ? "Undo last pending drink" : "Desfazer última bebida pendente") }
                }.font(.system(size: 9))
            }
        }
        .foregroundStyle(teal)
        .containerBackground(Color(red: 0.88, green: 0.96, blue: 0.93), for: .widget)
        .widgetURL(URL(string: "takingcare://agua"))
        .privacySensitive()
    }
}
@main struct VictusWidget: Widget {
    let kind = "VictusWater"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WaterProvider()) { VictusView(entry: $0) }
            .configurationDisplayName("Victus")
            .description("Água e bebidas / Water and drinks")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
