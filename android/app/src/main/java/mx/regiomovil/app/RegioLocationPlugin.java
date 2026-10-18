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
import java.util.HashSet;
import java.util.Set;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Foreground location only, without background services, storage or network calls. */
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
    private PluginCall watchCall;
    private LocationListener watchListener;
    private Runnable watchTimeout;
    private volatile boolean foreground = true;
    private final Set<String> awaitingWatchIds = new HashSet<>();
    private final Set<String> cancelledWatchIds = new HashSet<>();

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void watchPosition(PluginCall call) {
        if (getPermissionState("coarse") != PermissionState.GRANTED && getPermissionState("fine") != PermissionState.GRANTED) {
            synchronized (awaitingWatchIds) { awaitingWatchIds.add(call.getCallbackId()); }
            requestPermissionForAliases(new String[] { "coarse", "fine" }, call, "watchPermission");
        } else startWatch(call);
    }

    @PermissionCallback
    private void watchPermission(PluginCall call) {
        synchronized (awaitingWatchIds) {
            awaitingWatchIds.remove(call.getCallbackId());
            if (cancelledWatchIds.remove(call.getCallbackId())) {
                call.reject("Se canceló el seguimiento de ubicación.", "LOCATION_CANCELLED");
                return;
            }
        }
        if (getPermissionState("coarse") == PermissionState.GRANTED || getPermissionState("fine") == PermissionState.GRANTED) startWatch(call);
        else call.reject("No se concedió acceso a la ubicación. Puedes avanzar manualmente.", "LOCATION_DENIED");
    }

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    private void startWatch(PluginCall call) {
        synchronized (awaitingWatchIds) { awaitingWatchIds.add(call.getCallbackId()); }
        main.post(() -> {
            synchronized (awaitingWatchIds) {
                awaitingWatchIds.remove(call.getCallbackId());
                boolean cancelled = cancelledWatchIds.remove(call.getCallbackId());
                if (!foreground || cancelled) {
                    call.reject("Se canceló el seguimiento de ubicación.", "LOCATION_CANCELLED");
                    return;
                }
            }
            if (watchCall != null) { call.reject("Ya hay un trayecto usando la ubicación.", "LOCATION_BUSY"); return; }
            manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (manager == null) { call.reject("Este dispositivo no ofrece ubicación.", "LOCATION_UNAVAILABLE"); return; }
            call.setKeepAlive(true);
            bridge.saveCall(call);
            watchCall = call;
            watchListener = new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    if (watchCall == null || location == null || !location.hasAccuracy()) return;
                    long age = (SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos()) / 1000000L;
                    if (age < 0 || age > 30000) return;
                    if (watchTimeout != null) { main.removeCallbacks(watchTimeout); watchTimeout = null; }
                    JSObject result = new JSObject();
                    result.put("lat", location.getLatitude());
                    result.put("lng", location.getLongitude());
                    result.put("accuracy", location.getAccuracy());
                    result.put("timestamp", System.currentTimeMillis() - age);
                    if (location.hasSpeed()) result.put("speed", location.getSpeed());
                    if (location.hasBearing()) result.put("heading", location.getBearing());
                    watchCall.resolve(result);
                }
                @Override public void onProviderEnabled(String provider) { }
                @Override public void onProviderDisabled(String provider) { }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
            };
            boolean requested = false;
            try {
                String[] providers = getPermissionState("fine") == PermissionState.GRANTED
                    ? new String[] { LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER }
                    : new String[] { LocationManager.NETWORK_PROVIDER };
                for (String provider : providers) {
                    if (!manager.isProviderEnabled(provider)) continue;
                    manager.requestLocationUpdates(provider, 3000, 8, watchListener, Looper.getMainLooper());
                    requested = true;
                }
                if (!requested) endWatch("Activa la ubicación del dispositivo o avanza manualmente.", "LOCATION_DISABLED");
                else {
                    watchTimeout = () -> endWatch("No tenemos una ubicación reciente. Revisa el GPS o avanza manualmente.", "LOCATION_TIMEOUT");
                    main.postDelayed(watchTimeout, 20000);
                }
            } catch (SecurityException error) { endWatch("No se concedió acceso a la ubicación.", "LOCATION_DENIED"); }
            catch (RuntimeException error) { endWatch("No pudimos seguir la ubicación. Puedes avanzar manualmente.", "LOCATION_UNAVAILABLE"); }
        });
    }

    @PluginMethod
    public void stopWatching(PluginCall call) {
        main.post(() -> {
            String id = call.getString("id");
            synchronized (awaitingWatchIds) {
                if (id != null && awaitingWatchIds.contains(id)) cancelledWatchIds.add(id);
            }
            if (watchCall != null && watchCall.getCallbackId().equals(id)) {
                endWatch(null, null);
                synchronized (awaitingWatchIds) { cancelledWatchIds.remove(id); }
            }
            call.resolve();
        });
    }

    private void endWatch(String message, String code) {
        PluginCall call = watchCall;
        watchCall = null;
        if (watchTimeout != null) { main.removeCallbacks(watchTimeout); watchTimeout = null; }
        if (manager != null && watchListener != null) {
            try { manager.removeUpdates(watchListener); } catch (RuntimeException ignored) { }
        }
        watchListener = null;
        if (call != null) {
            call.setKeepAlive(false);
            if (message != null) call.reject(message, code);
            // Final response releases the JavaScript callback as well as its native call.
            else { JSObject result = new JSObject(); result.put("stopped", true); call.resolve(result); }
            bridge.releaseCall(call);
        }
    }

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
        if (manager != null && listener != null) {
            try { manager.removeUpdates(listener); } catch (RuntimeException ignored) { }
        }
        pending = null; listener = null; timeout = null;
    }

    private void leaveForeground() {
        foreground = false;
        synchronized (awaitingWatchIds) { cancelledWatchIds.addAll(awaitingWatchIds); }
    }
    @Override protected void handleOnResume() { foreground = true; }
    @Override protected void handleOnPause() { leaveForeground(); main.post(() -> { fail("Se interrumpió la lectura de ubicación. Vuelve a intentarlo al regresar.", "LOCATION_CANCELLED"); endWatch("Guía en pausa. Vuelve a iniciarla al regresar a la aplicación.", "LOCATION_PAUSED"); }); }
    @Override protected void handleOnDestroy() { leaveForeground(); main.post(() -> { fail("Se cerró el lector de ubicación.", "LOCATION_CANCELLED"); endWatch("Se cerró el seguimiento de ubicación.", "LOCATION_CANCELLED"); }); }
}
