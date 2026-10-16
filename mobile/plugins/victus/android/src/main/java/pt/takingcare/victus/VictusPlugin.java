package pt.takingcare.victus;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import org.json.*;
import java.util.*;

@CapacitorPlugin(name = "Victus")
public class VictusPlugin extends Plugin {
    @PluginMethod public void read(PluginCall call) {
        String owner = call.getString("owner", "");
        if (owner.isEmpty()) { call.reject("Missing owner"); return; }
        try {
            var state = VictusStore.transaction(getContext(), s -> {
                if (!owner.equals(s.optString("owner"))) {
                    var keys = new ArrayList<String>(); s.keys().forEachRemaining(keys::add); keys.forEach(s::remove);
                    s.put("owner", owner).put("pending", new JSONArray());
                }
                var pending = s.optJSONArray("pending");
                if (pending != null) for (int i = 0; i < pending.length(); i++) pending.getJSONObject(i).put("attempted", true);
            });
            VictusWidget.updateAll(getContext());
            var result = new JSObject(); result.put("pending", state.optJSONArray("pending")); call.resolve(result);
        } catch (Exception e) { call.reject("Unable to read Victus", e); }
    }
    @PluginMethod public void sync(PluginCall call) {
        String owner = call.getString("owner", ""); var snapshot = call.getObject("snapshot");
        if (owner.isEmpty() || snapshot == null) { call.reject("Missing snapshot"); return; }
        try {
            var ack = call.getArray("ackIds", new JSArray()); var ids = new HashSet<String>();
            for (int i = 0; i < ack.length(); i++) ids.add(ack.getString(i));
            VictusStore.transaction(getContext(), s -> {
                if (!owner.equals(s.optString("owner"))) return;
                var pending = s.optJSONArray("pending"); var kept = new JSONArray();
                if (pending != null) for (int i = 0; i < pending.length(); i++) {
                    var e = pending.getJSONObject(i); if (!ids.contains(e.optString("id"))) kept.put(e);
                }
                s.put("snapshot", snapshot).put("pending", kept);
            });
            VictusWidget.updateAll(getContext()); call.resolve();
        } catch (Exception e) { call.reject("Unable to sync Victus", e); }
    }
    @PluginMethod public void clear(PluginCall call) {
        try {
            VictusStore.transaction(getContext(), s -> {
                var keys = new ArrayList<String>(); s.keys().forEachRemaining(keys::add); keys.forEach(s::remove);
            });
            VictusWidget.updateAll(getContext()); call.resolve();
        } catch (Exception e) { call.reject("Unable to clear Victus", e); }
    }
    @PluginMethod public void requestPin(PluginCall call) {
        var result = new JSObject();
        var manager = AppWidgetManager.getInstance(getContext());
        boolean supported = Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported();
        result.put("supported", supported);
        if (supported) manager.requestPinAppWidget(new ComponentName(getContext(), VictusWidget.class), null, null);
        // This means requested, never proof that the user added it.
        call.resolve(result);
    }
}
