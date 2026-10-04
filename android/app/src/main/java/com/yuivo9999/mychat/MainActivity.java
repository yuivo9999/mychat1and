package com.yuivo9999.mychat;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MyChatRuntimePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
