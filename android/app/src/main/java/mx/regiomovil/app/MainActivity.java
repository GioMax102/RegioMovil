package mx.regiomovil.app;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        EdgeToEdge.enable(this);
        registerPlugin(RegioLocationPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setUserAgentString(settings.getUserAgentString()
                + " RegioMovil/1.0 (+https://github.com/GioMax102/RegioMovil)");
        }
        boolean debugBuild = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debugBuild && bridge != null) {
            // Debug builds may reach only the localhost API through an ADB reverse tunnel.
            bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyStationMode(intent);
    }

    /** Optional launch configuration for a managed station display. */
    private void applyStationMode(Intent intent) {
        if (intent == null || !intent.hasExtra("kiosk") || bridge == null) return;
        boolean kiosk = intent.getBooleanExtra("kiosk", false);
        if (kiosk) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        Uri.Builder url = Uri.parse(bridge.getAppUrl()).buildUpon();
        if (kiosk) {
            url.appendQueryParameter("kiosk", "1");
            url.appendQueryParameter("locked", "1");
            String station = intent.getStringExtra("station");
            if (station != null && station.matches("[a-z0-9-]{1,64}")) {
                url.appendQueryParameter("station", station);
            }
        }
        bridge.getWebView().loadUrl(url.build().toString());
    }
}
