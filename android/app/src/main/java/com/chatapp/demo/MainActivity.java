package com.chatapp.demo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String CHAT_URL = "https://chatapp-c4a7.onrender.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Google sign-in requires a browser, and calls use the hosted HTTPS origin.
        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(CHAT_URL));
        browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(browserIntent);
            finish();
        } catch (ActivityNotFoundException error) {
            TextView message = new TextView(this);
            message.setText("To use Kids WhatsApp 2026 - Dunes Kids WhatsApp, install a web browser and open:\n\n" + CHAT_URL);
            message.setTextIsSelectable(true);
            int padding = (int) (24 * getResources().getDisplayMetrics().density);
            message.setPadding(padding, padding, padding, padding);
            setContentView(message);
        }
    }
}
