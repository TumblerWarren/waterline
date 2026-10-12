package com.waterline.household;
import android.content.*;
public class PhoneAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i) { PhoneAlarmService.silence(c); }
}
