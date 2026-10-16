package pt.takingcare.victus;

import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.*;
import java.util.*;

public class VictusWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager manager, int[] ids) { updateAll(c); }
    @Override public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        try {
            if ("pt.takingcare.victus.ADD".equals(intent.getAction())) VictusStore.add(c, intent.getStringExtra("owner") == null ? "" : intent.getStringExtra("owner"), intent.getIntExtra("ml", 0), intent.getStringExtra("bebida"));
            if ("pt.takingcare.victus.UNDO".equals(intent.getAction())) VictusStore.undo(c, intent.getStringExtra("owner"));
            updateAll(c);
        } catch (Exception ignored) { /* Keep persisted queue intact; opening the app recovers it. */ }
    }
    static PendingIntent action(Context c, String action, String owner, JSONObject cup, int index) {
        var intent = new Intent(c, VictusWidget.class).setAction("pt.takingcare.victus." + action)
            .setData(Uri.parse("victus://" + action + "/" + owner + "/" + index)).putExtra("owner", owner);
        if (cup != null) intent.putExtra("ml", cup.optInt("ml")).putExtra("bebida", cup.optString("bebida"));
        return PendingIntent.getBroadcast(c, index, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void updateAll(Context c) {
        try {
            var manager = AppWidgetManager.getInstance(c);
            var state = VictusStore.transaction(c, s -> {});
            var s = state.optJSONObject("snapshot"); boolean ready = s != null && !state.optString("owner").isEmpty();
            if (s == null) s = new JSONObject();
            boolean en = "en".equals(s.optString("locale"));
            int consumed = VictusStore.consumed(state), goal = Math.max(1, s.optInt("goalMl", 2000));
            var cal = Calendar.getInstance(); int minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
            var days = s.optJSONArray("days"); boolean active = days == null;
            if (days != null) for (int i = 0; i < days.length(); i++) if (days.optInt(i) == cal.get(Calendar.DAY_OF_WEEK) - 1) active = true;
            String mood = VictusStore.mood(consumed, goal, minute, s.optInt("start", 540), s.optInt("end", 1260), active);
            String message = switch(mood) {
                case "happy" -> en ? "Goal reached!" : "Meta atingida!";
                case "grumpy" -> en ? "Time for a glass?" : "Um copo agora?";
                case "encouraging" -> en ? "You’ve got this!" : "Vamos a isso!";
                default -> en ? "Ready to start?" : "Vamos começar?";
            };
            if ("encouraging".equals(mood) && consumed >= goal * 0.75) message = en ? "Almost there!" : "Falta pouco!";
            int face = switch(mood) { case "happy" -> R.drawable.victus_happy; case "grumpy" -> R.drawable.victus_grumpy; case "encouraging" -> R.drawable.victus_encouraging; default -> R.drawable.victus_sleepy; };
            var pending = state.optJSONArray("pending"); int count = pending == null ? 0 : pending.length();
            var cups = s.optJSONArray("cups");
            var launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (launch == null) return;
            launch.setAction(Intent.ACTION_VIEW).setData(Uri.parse("takingcare://agua"));
            var open = PendingIntent.getActivity(c, 90, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            for (int id : manager.getAppWidgetIds(new ComponentName(c, VictusWidget.class))) {
                var v = new RemoteViews(c.getPackageName(), R.layout.victus_widget);
                v.setTextViewText(R.id.victus_title, "VICTUS · " + (en ? "WATER" : "ÁGUA"));
                v.setTextViewText(R.id.victus_message, ready ? message : (en ? "Open Taking Care" : "Abra a Taking Care"));
                v.setTextViewText(R.id.victus_total, ready ? consumed + " / " + goal + " ml" : "");
                v.setImageViewResource(R.id.victus_face, face);
                v.setProgressBar(R.id.victus_progress, 100, Math.min(100, (int)(100.0 * consumed / goal)), false);
                v.setViewVisibility(R.id.victus_actions, ready ? View.VISIBLE : View.GONE);
                v.setOnClickPendingIntent(R.id.victus_root, open);
                int[] buttons = {R.id.victus_cup0, R.id.victus_cup1};
                for (int i = 0; i < buttons.length; i++) {
                    boolean show = ready && cups != null && cups.length() > i;
                    v.setViewVisibility(buttons[i], show ? View.VISIBLE : View.GONE);
                    if (show) {
                        var cup = cups.getJSONObject(i);
                        String label = "+" + cup.optInt("ml") + " ml\n" + cup.optString("label");
                        v.setTextViewText(buttons[i], label); v.setContentDescription(buttons[i], label);
                        v.setOnClickPendingIntent(buttons[i], action(c, "ADD", state.optString("owner"), cup, i));
                    }
                }
                v.setTextViewText(R.id.victus_more, en ? "More" : "Mais"); v.setOnClickPendingIntent(R.id.victus_more, open);
                v.setTextViewText(R.id.victus_status, !ready ? "" : count > 0 ? (en ? count + " pending · open app" : count + " pendentes · abra a app") : !VictusStore.day().equals(s.optString("day")) ? (en ? "Open app to refresh goal" : "Abra a app para atualizar meta") : (en ? "Synced with app" : "Atualizado pela app"));
                v.setViewVisibility(R.id.victus_undo, count > 0 && !pending.optJSONObject(count - 1).optBoolean("attempted") ? View.VISIBLE : View.GONE);
                v.setTextViewText(R.id.victus_undo, en ? "Undo" : "Desfazer");
                v.setOnClickPendingIntent(R.id.victus_undo, action(c, "UNDO", state.optString("owner"), null, 80));
                manager.updateAppWidget(id, v);
            }
        } catch (Exception ignored) { }
    }
}
