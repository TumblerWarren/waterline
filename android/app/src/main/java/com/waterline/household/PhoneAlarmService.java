package com.waterline.household;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.os.*;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.*;
import java.util.*;

/** Local audio only. This service never acknowledges or sends commands to the board. */
public class PhoneAlarmService extends Service {
    private static final String CHANNEL = "waterline_phone_ring_v1";
    private static final int ID = 4201;
    private static PhoneAlarmService running;
    private MediaPlayer player;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (player == null) return;
        if (change == AudioManager.AUDIOFOCUS_GAIN) player.start();
        else if (player.isPlaying()) player.pause();
    };

    static android.content.SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("waterline-phone-alarm", Context.MODE_PRIVATE);
    }
    static JSONObject read(Context c, String key) {
        try { return new JSONObject(prefs(c).getString(key, "{}")); }
        catch (JSONException e) { return new JSONObject(); }
    }
    static void save(Context c, String key, JSONObject value) { prefs(c).edit().putString(key,value.toString()).apply(); }
    static String key(String device, String level, String episode) { return device+":"+level+":"+episode; }

    static boolean quiet(Context c) {
        if(!prefs(c).getBoolean("dnd_enabled",false))return false;
        Calendar now=Calendar.getInstance(TimeZone.getTimeZone(prefs(c).getString("dnd_timezone",TimeZone.getDefault().getID())));
        int minute=now.get(Calendar.HOUR_OF_DAY)*60+now.get(Calendar.MINUTE),start=prefs(c).getInt("dnd_start",1320),end=prefs(c).getInt("dnd_end",420);
        return start<end ? minute>=start && minute<end : minute>=start || minute<end;
    }
    static void applyQuiet(Context c) {
        if(quiet(c)) {
            prefs(c).edit().putBoolean("suspended",true).apply();
            ((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).cancel(ID);
            if(running!=null){running.stopForeground(STOP_FOREGROUND_REMOVE);running.stopSelf();}
        }
    }
    private final Runnable quietBoundary=new Runnable() {
        @Override public void run() {
            if(quiet(PhoneAlarmService.this)){applyQuiet(PhoneAlarmService.this);return;}
            handler.postDelayed(this,Math.max(1000,60000-System.currentTimeMillis()%60000));
        }
    };

    public static void receive(Context context, Map<String,String> data) {
        Context c = context.getApplicationContext();
        new Handler(Looper.getMainLooper()).post(() -> {
            String device=data.getOrDefault("device",""), level=data.getOrDefault("level",""), episode=data.getOrDefault("episode","");
            if (device.isEmpty() || !episode.matches("[a-f0-9]{32}") || !level.matches("20|50|80|100")) return;
            String id=key(device,level,episode);
            if ("stop".equals(data.get("action"))) { finish(c,Collections.singleton(id)); return; }
            long expires;
            try { expires=Long.parseLong(data.getOrDefault("expiresAt","0")); } catch (NumberFormatException e) { return; }
            if (expires<System.currentTimeMillis() || !prefs(c).getBoolean("enabled",false)) return;
            JSONObject closed=read(c,"closed"), active=read(c,"active");
            if (closed.has(id)) return;
            if(active.has(id)) {
                if(!quiet(c)){prefs(c).edit().putBoolean("suspended",false).apply();resumeIfNeeded(c);}
                return;
            }
            try {
                JSONObject entry=new JSONObject();
                entry.put("episode",episode); entry.put("title",data.getOrDefault("title","Waterline alarm"));
                entry.put("body",data.getOrDefault("body","Check your tank"));
                entry.put("at",Long.parseLong(data.getOrDefault("eventAt",String.valueOf(System.currentTimeMillis()))));
                active.put(id,entry); save(c,"active",active);
                if(quiet(c)){applyQuiet(c);return;}
                prefs(c).edit().putBoolean("suspended",false).apply();
                ContextCompat.startForegroundService(c,new Intent(c,PhoneAlarmService.class));
            } catch (Exception e) {
                // If Android disallows background playback, retain a visible ordinary alert.
                show(c,false,"Open Waterline to sound or dismiss the phone alarm.");
            }
        });
    }
    static void finish(Context c, Collection<String> ids) {
        JSONObject active=read(c,"active"), closed=read(c,"closed");
        long now=System.currentTimeMillis();
        List<String> old=new ArrayList<>();
        closed.keys().forEachRemaining(k -> { if(closed.optLong(k)<now-7*86400000L) old.add(k); });
        old.forEach(closed::remove);
        for(String id:ids) { active.remove(id); try {closed.put(id,now);} catch(JSONException ignored){} }
        save(c,"active",active); save(c,"closed",closed);
        if (running!=null) running.refresh();
        else if(active.length()==0) ((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).cancel(ID);
    }
    static void silence(Context c) {
        List<String> ids=new ArrayList<>(); read(c,"active").keys().forEachRemaining(ids::add); finish(c,ids);
    }
    static void resumeIfNeeded(Context c) {
        if(running==null && !quiet(c) && !prefs(c).getBoolean("suspended",false) && prefs(c).getBoolean("enabled",false) && read(c,"active").length()>0) {
            try {ContextCompat.startForegroundService(c,new Intent(c,PhoneAlarmService.class));} catch(Exception ignored){}
        }
    }
    static void reconcile(Context c, Set<String> episodes, long measuredAt) {
        JSONObject active=read(c,"active"); List<String> ended=new ArrayList<>();
        active.keys().forEachRemaining(id -> {
            JSONObject entry=active.optJSONObject(id);
            if(!id.startsWith("phone-test:") && entry!=null && measuredAt>=entry.optLong("at") && !episodes.contains(entry.optString("episode"))) ended.add(id);
        });
        if(!ended.isEmpty()) finish(c,ended);
    }
    static Notification notification(Context c, String extra) {
        NotificationManager manager=(NotificationManager)c.getSystemService(NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26) {
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Continuous water alarm",NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(null,null); channel.setDescription("Ringing is controlled by the phone alarm service"); manager.createNotificationChannel(channel);
        }
        JSONObject active=read(c,"active"); String title="Waterline phone alarm", body="Check the Alarm tab. The board alarm is independent.";
        Iterator<String> keys=active.keys();
        if(keys.hasNext()) { JSONObject entry=active.optJSONObject(keys.next()); if(entry!=null){title=entry.optString("title",title);body=entry.optString("body",body);} }
        Intent open=new Intent(c,MainActivity.class).putExtra("phone_alarm_page",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent view=PendingIntent.getActivity(c,4202,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent stop=new Intent(c,PhoneAlarmReceiver.class).setAction("silence");
        PendingIntent silence=PendingIntent.getBroadcast(c,4203,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        PendingIntent dismiss=PendingIntent.getBroadcast(c,4204,new Intent(c,PhoneAlarmReceiver.class).setAction("dismiss"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_waterline_notification)
            .setContentTitle(title).setContentText(extra.isEmpty()?body:extra).setStyle(new NotificationCompat.BigTextStyle().bigText(extra.isEmpty()?body:extra))
            .setContentIntent(view).setDeleteIntent(dismiss).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .addAction(0,"Silence phone",silence).addAction(0,"Dismiss",dismiss).build();
    }
    static void show(Context c, boolean ongoing, String extra) {
        if(quiet(c))return;
        Notification n=notification(c,extra);
        if(!ongoing) n.flags &= ~Notification.FLAG_ONGOING_EVENT;
        try { ((NotificationManager)c.getSystemService(NOTIFICATION_SERVICE)).notify(ID,n); } catch(SecurityException ignored){}
    }
    @Override public void onCreate() { super.onCreate(); running=this; }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(quiet(this) || read(this,"active").length()==0 || !prefs(this).getBoolean("enabled",false)) {stopSelf();return START_NOT_STICKY;}
        if(Build.VERSION.SDK_INT>=29) startForeground(ID,notification(this,""),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID,notification(this,""));
        if(player==null) {
            try {
                audio=(AudioManager)getSystemService(AUDIO_SERVICE);
                AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
                if(Build.VERSION.SDK_INT>=26) {
                focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener,handler).build();
                if(audio.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw new IllegalStateException("Audio focus unavailable");
                } else if(audio.requestAudioFocus(focusListener,AudioManager.STREAM_ALARM,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw new IllegalStateException("Audio focus unavailable");
                player=new MediaPlayer(); player.setAudioAttributes(attributes);
                android.net.Uri tone=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if(tone==null) tone=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                player.setDataSource(this,tone); player.setLooping(true); player.prepare(); player.start();
                prefs(this).edit().remove("error").apply();
            } catch(Exception e) { prefs(this).edit().putString("error","Phone alarm audio unavailable. Check Android alarm volume and sound settings.").apply(); }
        }
        handler.removeCallbacks(quietBoundary);handler.post(quietBoundary);
        return START_NOT_STICKY;
    }
    private void refresh() {
        if(read(this,"active").length()==0) { stopForeground(STOP_FOREGROUND_REMOVE);stopSelf(); }
        else show(this,true,"");
    }
    @Override public void onDestroy() {
        handler.removeCallbacks(quietBoundary);
        if(player!=null){player.release();player=null;}
        if(audio!=null) {if(Build.VERSION.SDK_INT>=26 && focus!=null) audio.abandonAudioFocusRequest(focus);else audio.abandonAudioFocus(focusListener);}
        running=null;super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
