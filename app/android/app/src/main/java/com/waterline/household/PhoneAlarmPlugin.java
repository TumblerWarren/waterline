package com.waterline.household;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.*;
import org.json.*;
@CapacitorPlugin(name="PhoneAlarm")
public class PhoneAlarmPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call) {
        boolean enabled=call.getBoolean("enabled",false);
        PhoneAlarmService.prefs(getContext()).edit().putBoolean("enabled",enabled).remove("error").apply();
        if(!enabled) getActivity().runOnUiThread(() -> PhoneAlarmService.silence(getContext()));
        call.resolve();
    }
    @PluginMethod public void quietHours(PluginCall call) {
        String start=call.getString("start","22:00"),end=call.getString("end","07:00"),zone=call.getString("timezone",TimeZone.getDefault().getID());
        if(!start.matches("([01]\\d|2[0-3]):[0-5]\\d") || !end.matches("([01]\\d|2[0-3]):[0-5]\\d") || start.equals(end)){call.reject("Choose different valid start and end times.");return;}
        String[] a=start.split(":"),b=end.split(":");
        PhoneAlarmService.prefs(getContext()).edit().putBoolean("dnd_enabled",call.getBoolean("enabled",false))
            .putInt("dnd_start",Integer.parseInt(a[0])*60+Integer.parseInt(a[1])).putInt("dnd_end",Integer.parseInt(b[0])*60+Integer.parseInt(b[1])).putString("dnd_timezone",zone).apply();
        getActivity().runOnUiThread(()->{PhoneAlarmService.applyQuiet(getContext());call.resolve();});
    }
    @PluginMethod public void silence(PluginCall call) {
        getActivity().runOnUiThread(() -> {PhoneAlarmService.silence(getContext());call.resolve();});
    }
    @PluginMethod public void sync(PluginCall call) {
        JSArray array=call.getArray("episodes",new JSArray()); Set<String> episodes=new HashSet<>();
        for(int n=0;n<array.length();n++) episodes.add(array.optString(n));
        long measuredAt=call.getDouble("measuredAt",0.0).longValue();
        getActivity().runOnUiThread(() -> {PhoneAlarmService.reconcile(getContext(),episodes,measuredAt);call.resolve();});
    }
    @PluginMethod public void test(PluginCall call) {
        if(!PhoneAlarmService.prefs(getContext()).getBoolean("enabled",false)){call.reject("Enable phone notifications first.");return;}
        if(PhoneAlarmService.quiet(getContext())){call.reject("Phone DND is active. Turn it off before testing.");return;}
        String episode=java.util.UUID.randomUUID().toString().replace("-","");
        Map<String,String> data=new HashMap<>();data.put("device","phone-test");data.put("level","20");data.put("episode",episode);
        data.put("title","Waterline phone alarm test");data.put("body","Ten-second phone ringtone test");data.put("expiresAt",String.valueOf(System.currentTimeMillis()+10000));
        PhoneAlarmService.receive(getContext(),data);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->PhoneAlarmService.finish(getContext(),Collections.singleton(PhoneAlarmService.key("phone-test","20",episode))),10000);
        call.resolve();
    }
    @PluginMethod public void status(PluginCall call) {
        getActivity().runOnUiThread(()->PhoneAlarmService.resumeIfNeeded(getContext()));
        JSObject result=new JSObject();result.put("active",PhoneAlarmService.read(getContext(),"active").length()>0);
        result.put("quiet",PhoneAlarmService.quiet(getContext()));
        result.put("suspended",PhoneAlarmService.prefs(getContext()).getBoolean("suspended",false));
        result.put("error",PhoneAlarmService.prefs(getContext()).getString("error",""));
        boolean open=getActivity().getIntent().getBooleanExtra("phone_alarm_page",false);
        getActivity().getIntent().removeExtra("phone_alarm_page");result.put("open",open);call.resolve(result);
    }
}
