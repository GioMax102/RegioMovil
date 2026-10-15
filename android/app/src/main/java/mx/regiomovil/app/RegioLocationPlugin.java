package mx.regiomovil.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** One foreground position, without background services, storage or network calls. */
@CapacitorPlugin(name = "RegioLocation", permissions = {
    @Permission(alias = "coarse", strings = { Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "fine", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
})
public class RegioLocationPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private LocationManager manager;
    private LocationListener listener;
    private PluginCall pending;
    private Runnable timeout;

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (getPermissionState("coarse") != PermissionState.GRANTED && getPermissionState("fine") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "coarse", "fine" }, call, "locationPermission");
        } else start(call);
    }

    @PermissionCallback
    private void locationPermission(PluginCall call) {
        if (getPermissionState("coarse") == PermissionState.GRANTED || getPermissionState("fine") == PermissionState.GRANTED) start(call);
        else call.reject("No se concedió acceso a la ubicación. Puedes elegir una parada.", "LOCATION_DENIED");
    }

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private void start(PluginCall call) {
        main.post(() -> {
            if (pending != null) { call.reject("Ya estamos buscando tu ubicación.", "LOCATION_BUSY"); return; }
            manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (manager == null) { call.reject("Este dispositivo no ofrece ubicación.", "LOCATION_UNAVAILABLE"); return; }
            pending = call;
            listener = new LocationListener() {
                @Override public void onLocationChanged(Location location) { complete(location); }
                @Override public void onProviderEnabled(String provider) { }
                @Override public void onProviderDisabled(String provider) { }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
            };
            boolean requested = false;
            try {
                // Approximate permission still works through the network provider.
                String[] providers = getPermissionState("fine") == PermissionState.GRANTED
                    ? new String[] { LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER }
                    : new String[] { LocationManager.NETWORK_PROVIDER };
                for (String provider : providers) {
                    if (!manager.isProviderEnabled(provider)) continue;
                    Location cached = manager.getLastKnownLocation(provider);
                    if (cached != null && SystemClock.elapsedRealtimeNanos() - cached.getElapsedRealtimeNanos() <= 30_000_000_000L && cached.hasAccuracy() && cached.getAccuracy() <= 100) {
                        complete(cached); return;
                    }
                    manager.requestLocationUpdates(provider, 1000, 0, listener, Looper.getMainLooper());
                    requested = true;
                }
                if (!requested) { fail("Activa la ubicación del dispositivo o elige una parada.", "LOCATION_DISABLED"); return; }
                timeout = () -> fail("No pudimos obtener una ubicación precisa. Elige una parada o vuelve a intentar.", "LOCATION_TIMEOUT");
                main.postDelayed(timeout, 20000);
            } catch (SecurityException error) { fail("No se concedió acceso a la ubicación. Puedes elegir una parada.", "LOCATION_DENIED"); }
            catch (RuntimeException error) { fail("La ubicación no está disponible. Puedes elegir una parada.", "LOCATION_UNAVAILABLE"); }
        });
    }

    private void complete(Location location) {
        if (pending == null || location == null || !location.hasAccuracy()) return;
        // Reject stale callbacks and fixes too broad to select a transit connection.
        if (SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos() > 60_000_000_000L || location.getAccuracy() > 1500) return;
        PluginCall call = pending;
        cleanup();
        JSObject result = new JSObject();
        result.put("lat", location.getLatitude());
        result.put("lng", location.getLongitude());
        result.put("accuracy", location.getAccuracy());
        call.resolve(result);
    }

    private void fail(String message, String code) {
        PluginCall call = pending;
        cleanup();
        if (call != null) call.reject(message, code);
    }

    private void cleanup() {
        if (timeout != null) main.removeCallbacks(timeout);
        if (manager != null && listener != null) manager.removeUpdates(listener);
        pending = null; listener = null; timeout = null;
    }

    @Override protected void handleOnPause() { main.post(() -> fail("Se interrumpió la lectura de ubicación. Vuelve a intentarlo al regresar.", "LOCATION_CANCELLED")); }
    @Override protected void handleOnDestroy() { main.post(() -> fail("Se cerró el lector de ubicación.", "LOCATION_CANCELLED")); }
}
