package com.family.tasks;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FocusAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
