package com.waterline.household;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WaterlineAuthPlugin.class);
        registerPlugin(PhoneAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
