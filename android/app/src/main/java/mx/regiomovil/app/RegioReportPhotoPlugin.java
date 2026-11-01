package mx.regiomovil.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.UUID;
import java.util.Arrays;
import java.util.Comparator;

/** User-selected images only. No broad camera/storage permission or gallery export. */
@CapacitorPlugin(name = "RegioReportPhoto")
public class RegioReportPhotoPlugin extends Plugin {
    private static final long MAX_BYTES = 8_000_000;
    private static final long CACHE_TTL = 24L * 60 * 60 * 1000;
    private AlertDialog chooser;
    private volatile boolean selecting;

    private File folder() throws Exception {
        File directory = new File(getContext().getCacheDir(), "shared/reports");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception("cache unavailable");
        return directory;
    }

    private void prune() throws Exception {
        File[] files = folder().listFiles();
        if (files == null) return;
        long before = System.currentTimeMillis() - CACHE_TTL;
        for (File file : files) if (file.isFile() && file.lastModified() < before) file.delete();
        files = folder().listFiles(File::isFile);
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
        // At most two older, unfinished transfers plus the next selected image.
        for (int index = 2; index < files.length; index++) files[index].delete();
    }

    private File imageFile() throws Exception {
        return File.createTempFile("report-", ".jpg", folder());
    }

    private File ownedFile(String path) throws Exception {
        if (path == null) return null;
        File file = new File(Uri.parse(path).getPath()).getCanonicalFile();
        return folder().getCanonicalFile().equals(file.getParentFile()) && file.getName().startsWith("report-")
            ? file : null;
    }

    @PluginMethod
    public void choose(PluginCall call) {
        String requestId = call.getString("requestId", "");
        try { UUID.fromString(requestId); } catch (Exception invalid) {
            call.reject("Invalid request", "INVALID_REQUEST");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (selecting) {
                call.reject("Selection already open", "PICKER_BUSY");
                return;
            }
            selecting = true;
            chooser = new AlertDialog.Builder(getActivity())
                .setTitle("Añadir foto")
                .setItems(new String[] { "Cámara", "Galería", "Archivos" }, (dialog, selected) -> {
                    chooser = null;
                    launch(call, selected);
                })
                .setNegativeButton("Cancelar", (dialog, which) -> {
                    chooser = null;
                    cancelled(call);
                })
                .setOnCancelListener(dialog -> {
                    chooser = null;
                    cancelled(call);
                })
                .create();
            chooser.show();
        });
    }

    private void launch(PluginCall call, int selected) {
        try {
            prune();
            Intent intent;
            if (selected == 0) {
                File file = imageFile();
                call.getData().put("capturePath", Uri.fromFile(file).toString());
                Uri output = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                intent.putExtra(MediaStore.EXTRA_OUTPUT, output);
                intent.setClipData(ClipData.newRawUri("report-photo", output));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } else {
                intent = new Intent(selected == 1 && Build.VERSION.SDK_INT >= 33
                    ? MediaStore.ACTION_PICK_IMAGES
                    : selected == 1 ? Intent.ACTION_GET_CONTENT : Intent.ACTION_OPEN_DOCUMENT);
                intent.setType("image/*");
                if (selected == 2) intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            // Capacitor persists this call + requestId while the external activity is open.
            startActivityForResult(call, intent, "photoResult");
        } catch (Exception unavailable) {
            deleteCapture(call);
            failed(call, "PICKER_UNAVAILABLE");
        }
    }

    private void cancelled(PluginCall call) {
        selecting = false;
        JSObject result = new JSObject();
        result.put("requestId", call.getString("requestId"));
        result.put("cancelled", true);
        call.resolve(result);
    }

    private void failed(PluginCall call, String code) {
        selecting = false;
        JSObject result = new JSObject();
        result.put("requestId", call.getString("requestId"));
        result.put("errorCode", code);
        call.resolve(result);
    }

    private void deleteCapture(PluginCall call) {
        try {
            File file = ownedFile(call.getString("capturePath"));
            if (file != null) file.delete();
        } catch (Exception ignored) { /* Temporary files also expire on the next selection. */ }
    }

    @ActivityCallback
    private void photoResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            deleteCapture(call);
            cancelled(call);
            return;
        }
        // Copy a single selected URI in a worker, never hold the whole original in Java memory.
        getBridge().execute(() -> {
            File file = null;
            try {
                file = ownedFile(call.getString("capturePath"));
                if (file == null) {
                    Uri source = activityResult.getData() == null ? null : activityResult.getData().getData();
                    if (source == null || !"content".equals(source.getScheme())) throw new Exception("invalid selection");
                    file = imageFile();
                    try (InputStream input = getContext().getContentResolver().openInputStream(source);
                         FileOutputStream output = new FileOutputStream(file)) {
                        if (input == null) throw new Exception("image unavailable");
                        byte[] buffer = new byte[16384];
                        long total = 0;
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            total += count;
                            if (total > MAX_BYTES) throw new Exception("image too large");
                            output.write(buffer, 0, count);
                        }
                    }
                }
                if (file.length() == 0 || file.length() > MAX_BYTES) throw new Exception("image size");
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
                String mime = bounds.outMimeType;
                if (bounds.outWidth < 1 || bounds.outHeight < 1 ||
                    (long) bounds.outWidth * bounds.outHeight > 24_000_000 ||
                    Math.max(bounds.outWidth, bounds.outHeight) > 16000 ||
                    !("image/jpeg".equals(mime) || "image/png".equals(mime) || "image/webp".equals(mime))) {
                    throw new Exception("unsupported image");
                }
                JSObject result = new JSObject();
                result.put("requestId", call.getString("requestId"));
                result.put("uri", Uri.fromFile(file).toString());
                result.put("mime", mime);
                selecting = false;
                call.resolve(result);
            } catch (Exception invalidImage) {
                if (file != null) file.delete();
                failed(call, "INVALID_IMAGE");
            }
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        try {
            File file = ownedFile(call.getString("uri"));
            if (file != null) file.delete();
        } catch (Exception ignored) { /* Cache is bounded by expiration. */ }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (chooser != null) {
            chooser.dismiss();
            chooser = null;
        }
        super.handleOnDestroy();
    }
}
