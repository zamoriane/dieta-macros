import Foundation
import Darwin

// Compiled into both the Capacitor plugin and WidgetKit extension.
// One cross-process lock protects the snapshot and the outbox together.
public enum VictusStore {
    public static let group = "group.com.zamoriane.takingcare"
    public static func transaction(_ change: (inout [String: Any]) -> Void) throws -> [String: Any] {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw NSError(domain: "Victus", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group unavailable"])
        }
        let fd = open(dir.appendingPathComponent("victus.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw NSError(domain: "Victus", code: 2) }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw NSError(domain: "Victus", code: 3) }
        defer { flock(fd, LOCK_UN) }
        let url = dir.appendingPathComponent("victus.json")
        var value: [String: Any] = [:]
        if FileManager.default.fileExists(atPath: url.path) {
            value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] ?? [:]
        }
        change(&value)
        try JSONSerialization.data(withJSONObject: value).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
        return value
    }
    public static func day(_ date: Date = Date()) -> String {
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
    public static func add(owner: String, ml: Int, beverage: String) throws {
        _ = try transaction { state in
            guard !owner.isEmpty, state["owner"] as? String == owner,
                  let snapshot = state["snapshot"] as? [String: Any],
                  let cups = snapshot["cups"] as? [[String: Any]],
                  let cup = cups.first(where: { ($0["ml"] as? Int) == ml && ($0["bebida"] as? String) == beverage }),
                  (10...3000).contains(ml) else { return }
            var queue = state["pending"] as? [[String: Any]] ?? []
            guard queue.count < 200 else { return }
            queue.append(["id": UUID().uuidString.lowercased(), "owner": owner, "day": day(),
                          "at": ISO8601DateFormatter().string(from: Date()), "ml": ml,
                          "bebida": beverage, "fator": cup["fator"] as? Double ?? 1])
            state["pending"] = queue
        }
    }
    public static func undo(owner: String) throws {
        _ = try transaction { state in
            guard state["owner"] as? String == owner else { return }
            var queue = state["pending"] as? [[String: Any]] ?? []
            if let last = queue.last, last["attempted"] as? Bool != true { queue.removeLast() }
            state["pending"] = queue
        }
    }
    public static func consumed(_ state: [String: Any], at date: Date) -> Int {
        let s = state["snapshot"] as? [String: Any] ?? [:]
        let base = s["day"] as? String == day(date) ? s["consumedMl"] as? Int ?? 0 : 0
        return base + (state["pending"] as? [[String: Any]] ?? []).filter { $0["day"] as? String == day(date) }.reduce(0) {
            $0 + Int((Double($1["ml"] as? Int ?? 0) * ($1["fator"] as? Double ?? 1)).rounded())
        }
    }
    public static func mood(consumed: Int, goal: Int, minute: Int, start: Int, end: Int, active: Bool) -> String {
        guard goal > 0 else { return "sleepy" }
        let p = Double(consumed) / Double(goal)
        if p >= 1 { return "happy" }; if p >= 0.75 { return "encouraging" }
        if !active || minute < start + 30 { return "sleepy" }
        let expected = max(0, min(1, Double(minute - start) / Double(max(1, end - start))))
        return p + 0.15 < expected ? "grumpy" : "encouraging"
    }
}
