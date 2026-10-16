package pt.takingcare.victus;

import android.content.Context;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

public final class VictusStore {
    interface Mutation { void apply(JSONObject value) throws Exception; }
    static synchronized JSONObject transaction(Context context, Mutation mutation) throws Exception {
        var prefs = context.getSharedPreferences("victus", Context.MODE_PRIVATE);
        var state = new JSONObject(prefs.getString("state", "{}"));
        mutation.apply(state);
        if (!prefs.edit().putString("state", state.toString()).commit()) throw new Exception("Victus storage unavailable");
        return state;
    }
    static String day() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }
    static void add(Context context, String owner, int ml, String beverage) throws Exception {
        transaction(context, state -> {
            if (owner.isEmpty() || !owner.equals(state.optString("owner"))) return;
            var s = state.optJSONObject("snapshot"); if (s == null) return;
            var cups = s.optJSONArray("cups"); if (cups == null) return;
            JSONObject cup = null;
            for (int i = 0; i < cups.length(); i++) {
                var c = cups.getJSONObject(i);
                if (c.optInt("ml") == ml && beverage.equals(c.optString("bebida"))) { cup = c; break; }
            }
            if (cup == null || ml < 10 || ml > 3000) return;
            var pending = state.optJSONArray("pending"); if (pending == null) pending = new JSONArray();
            if (pending.length() >= 200) return;
            var formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
            pending.put(new JSONObject().put("id", UUID.randomUUID().toString()).put("owner", owner).put("day", day())
                .put("at", formatter.format(new Date())).put("ml", ml).put("bebida", beverage).put("fator", cup.optDouble("fator", 1)));
            state.put("pending", pending);
        });
    }
    static void undo(Context context, String owner) throws Exception {
        transaction(context, state -> {
            if (!owner.equals(state.optString("owner"))) return;
            var pending = state.optJSONArray("pending");
            if (pending != null && pending.length() > 0 && !pending.getJSONObject(pending.length() - 1).optBoolean("attempted")) pending.remove(pending.length() - 1);
        });
    }
    static int consumed(JSONObject state) {
        var s = state.optJSONObject("snapshot");
        int total = s != null && day().equals(s.optString("day")) ? s.optInt("consumedMl") : 0;
        var pending = state.optJSONArray("pending");
        if (pending != null) for (int i = 0; i < pending.length(); i++) {
            var e = pending.optJSONObject(i);
            if (e != null && day().equals(e.optString("day"))) total += (int)Math.round(e.optInt("ml") * e.optDouble("fator", 1));
        }
        return total;
    }
    static String mood(int consumed, int goal, int minute, int start, int end, boolean active) {
        if (goal <= 0) return "sleepy";
        double p = (double)consumed / goal;
        if (p >= 1) return "happy"; if (p >= .75) return "encouraging";
        if (!active || minute < start + 30) return "sleepy";
        double expected = Math.max(0, Math.min(1, (double)(minute - start) / Math.max(1, end - start)));
        return p + .15 < expected ? "grumpy" : "encouraging";
    }
}
