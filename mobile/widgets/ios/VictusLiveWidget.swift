import ActivityKit
import SwiftUI
import WidgetKit

extension ActivityViewContext where Attributes == VictusAttributes {
    var localVictus: VictusAttributes.ContentState? {
        guard let state = try? VictusStore.transaction({ _ in }),
              state["owner"] as? String == attributes.owner,
              VictusConsent.choice(attributes.owner) == "accepted",
              attributes.day == VictusStore.day(), Date() < attributes.expires else { return nil }
        return VictusLive.shared.content(state)
    }
}

struct VictusLiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VictusAttributes.self) { context in
            VictusLivePanel(context: context)
                .padding(16)
                .activityBackgroundTint(Color(red: 0.03, green: 0.23, blue: 0.25))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "takingcare://agua"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) { VictusLivePanel(context: context) }
            } compactLeading: {
                Image(context.localVictus?.mood ?? "sleepy").resizable().scaledToFit().frame(width: 24, height: 24)
            } compactTrailing: {
                Text(context.localVictus.map { "\(Int(min(1, Double($0.consumed) / Double(max(1, $0.goal))) * 100))%" } ?? "—")
                    .font(.caption.monospacedDigit()).foregroundStyle(.mint)
            } minimal: {
                Image(context.localVictus?.mood ?? "sleepy").resizable().scaledToFit()
            }
            .widgetURL(URL(string: "takingcare://agua"))
            .keylineTint(.mint)
        }
    }
}

struct VictusLivePanel: View {
    let context: ActivityViewContext<VictusAttributes>
    var body: some View {
        if let s = context.localVictus {
        let expired = context.isStale || context.attributes.day != VictusStore.day()
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(s.mood).resizable().scaledToFit().frame(width: 48, height: 56).accessibilityHidden(true)
                VStack(alignment: .leading) {
                    Text("Victus · " + (s.english ? "Water" : "Água")).font(.headline)
                    Text(expired ? (s.english ? "Open app to refresh" : "Abra a app para atualizar") : s.consumed >= s.goal ? (s.english ? "Goal reached!" : "Meta atingida!") : (s.english ? "Time for a glass?" : "Um copo agora?"))
                        .font(.subheadline)
                    Text("\(s.consumed) / \(s.goal) ml").font(.caption.monospacedDigit())
                }
                Spacer(minLength: 0)
            }
            ProgressView(value: min(1, Double(s.consumed) / Double(max(1, s.goal)))).tint(.mint)
            if !expired && s.consumed < s.goal {
                HStack {
                    ForEach(s.cups.indices, id: \.self) { i in
                        let cup = s.cups[i]
                        Button(intent: VictusLiveDrink(owner: context.attributes.owner, ml: cup.ml, beverage: cup.beverage)) {
                            Text("+\(cup.ml) ml · \(cup.label)").font(.caption.bold()).lineLimit(1).minimumScaleFactor(0.7)
                                .frame(maxWidth: .infinity)
                        }.buttonStyle(.bordered).tint(.mint)
                    }
                }
            }
            if s.pending > 0 {
                Text(s.english ? "\(s.pending) pending · open app to sync" : "\(s.pending) pendentes · abra a app para sincronizar").font(.caption2)
            }
        }.foregroundStyle(.white).privacySensitive()
        } else {
            Link("Victus · Taking Care", destination: URL(string: "takingcare://agua")!)
                .foregroundStyle(.white).padding()
        }
    }
}
