package com.waterline.household;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
public class WaterlineMessagingService extends MessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        if("waterline_alarm".equals(message.getData().get("kind"))) PhoneAlarmService.receive(this,message.getData());
        else super.onMessageReceived(message);
    }
}
