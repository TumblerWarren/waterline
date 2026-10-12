package com.waterline.household;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WaterlineAuthPlugin.class);
        registerPlugin(PhoneAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
