package com.colorduet.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Insets;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 双环取色 · 安卓壳
 *
 * 职责：
 *   1. 全屏 WebView 加载 assets/www（与 PC 端同源）；
 *   2. 原生选图：不走 WebView 的 <input type=file>（各 ROM 行为不一致），
 *      改为 ACTION_OPEN_DOCUMENT → 解码 → 缩放 → JPEG → base64 → 回传 JS；
 *   3. Android 15（API 35）强制沉浸式，这里读 window insets 给内容加避让。
 */
public class MainActivity extends Activity {

    private static final int REQ_WEB_FILE = 1001;    /* WebView 自带选图的回落 */
    private static final int REQ_NATIVE_PICK = 1002; /* 原生选图 */

    private static final int MAX_EDGE = 1800;        /* 解码后的最大边长 */
    private static final int JPEG_QUALITY = 86;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    /* ---------------------------------------------------------------- 生命周期 */

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#16181C"));
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                /* 兜底：万一 JS 走了 <input type=file> */
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, REQ_WEB_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        web.addJavascriptInterface(new PickBridge(), "AndroidPick");

        setContentView(web);
        applyInsetsPadding();
        web.loadUrl("file:///android_asset/www/index.html");
    }

    /**
     * 避让状态栏 / 刘海 / 导航栏。
     *
     * Android 15（targetSdk 35）起强制沉浸式，内容会画到系统栏下面，必须自己让位；
     * 低版本默认不是沉浸式，这时 insets 已经有系统栏高度、而视图本身也已经让开了，
     * 直接加 padding 会重复。所以统一用「insets - 视图在窗口里的位置」算差额：
     *   · 沉浸式：视图位于 0，差额 = 状态栏高度 → 补上；
     *   · 非沉浸式：视图已从状态栏下沿开始，差额 = 0 → 不动。
     */
    private void applyInsetsPadding() {
        web.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int top, bottom, left, right;
                if (Build.VERSION.SDK_INT >= 30) {
                    Insets b = insets.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = b.top;
                    bottom = b.bottom;
                    left = b.left;
                    right = b.right;
                } else {
                    top = insets.getSystemWindowInsetTop();
                    bottom = insets.getSystemWindowInsetBottom();
                    left = insets.getSystemWindowInsetLeft();
                    right = insets.getSystemWindowInsetRight();
                }

                int[] loc = new int[2];
                v.getLocationInWindow(loc);
                View root = v.getRootView();

                int padTop = Math.max(0, top - loc[1]);
                int padLeft = Math.max(0, left - loc[0]);
                int padBottom = Math.max(0, loc[1] + v.getHeight() + bottom - root.getHeight());
                int padRight = Math.max(0, loc[0] + v.getWidth() + right - root.getWidth());

                if (padTop != v.getPaddingTop() || padBottom != v.getPaddingBottom()
                        || padLeft != v.getPaddingLeft() || padRight != v.getPaddingRight()) {
                    v.setPadding(padLeft, padTop, padRight, padBottom);
                }
                return insets;
            }
        });
        web.requestApplyInsets();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.removeAllViews();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /* ---------------------------------------------------------------- 原生选图 */

    public class PickBridge {
        @JavascriptInterface
        public void pick() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startNativePick();
                }
            });
        }
    }

    private void startNativePick() {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            startActivityForResult(intent, REQ_NATIVE_PICK);
        } catch (Exception e) {
            toast("打不开系统相册：" + e.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_WEB_FILE) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }

        if (requestCode == REQ_NATIVE_PICK) {
            if (resultCode != RESULT_OK || data == null) {
                return;
            }
            final List<Uri> uris = new ArrayList<>();
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                for (int i = 0; i < n; i++) {
                    uris.add(data.getClipData().getItemAt(i).getUri());
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            if (uris.isEmpty()) {
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    decodeAndDeliver(uris);
                }
            }).start();
            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 逐张解码 → 缩放 → 纠正 EXIF 方向 → JPEG → base64，一次性回传 JS。 */
    private void decodeAndDeliver(List<Uri> uris) {
        JSONArray out = new JSONArray();
        int index = 0;

        for (Uri uri : uris) {
            index++;
            Bitmap bmp = null;
            try {
                BitmapFactory.Options probe = new BitmapFactory.Options();
                probe.inJustDecodeBounds = true;
                InputStream is0 = getContentResolver().openInputStream(uri);
                if (is0 == null) {
                    continue;
                }
                BitmapFactory.decodeStream(is0, null, probe);
                is0.close();

                if (probe.outWidth <= 0 || probe.outHeight <= 0) {
                    continue;
                }

                int sample = 1;
                while (Math.max(probe.outWidth, probe.outHeight) / sample > MAX_EDGE) {
                    sample *= 2;
                }

                BitmapFactory.Options opt = new BitmapFactory.Options();
                opt.inSampleSize = sample;
                opt.inPreferredConfig = Bitmap.Config.ARGB_8888;
                InputStream is1 = getContentResolver().openInputStream(uri);
                if (is1 == null) {
                    continue;
                }
                bmp = BitmapFactory.decodeStream(is1, null, opt);
                is1.close();
                if (bmp == null) {
                    continue;
                }

                bmp = rotateByExif(uri, bmp);

                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, bos);
                String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
                bos.close();

                JSONObject item = new JSONObject();
                item.put("name", nameOf(uri, index));
                item.put("dataUrl", "data:image/jpeg;base64," + b64);
                item.put("w", bmp.getWidth());
                item.put("h", bmp.getHeight());
                out.put(item);
            } catch (Exception e) {
                /* 单张失败不影响其它 */
            } finally {
                if (bmp != null && !bmp.isRecycled()) {
                    bmp.recycle();
                }
            }
        }

        if (out.length() == 0) {
            toastOnUi("这些图片读不出来，换一张试试");
            return;
        }

        final String js = "window.AndroidPickResult && window.AndroidPickResult(" + out + ")";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(js, null);
                }
            }
        });
    }

    private Bitmap rotateByExif(Uri uri, Bitmap src) {
        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) {
                return src;
            }
            ExifInterface exif = new ExifInterface(is);
            int orientation = exif.getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            is.close();

            int degree = 0;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) {
                degree = 90;
            } else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) {
                degree = 180;
            } else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) {
                degree = 270;
            }
            if (degree == 0) {
                return src;
            }
            android.graphics.Matrix m = new android.graphics.Matrix();
            m.postRotate(degree);
            Bitmap rotated = Bitmap.createBitmap(src, 0, 0,
                    src.getWidth(), src.getHeight(), m, true);
            if (rotated != src) {
                src.recycle();
            }
            return rotated;
        } catch (Exception e) {
            return src;
        }
    }

    private String nameOf(Uri uri, int index) {
        try {
            String last = uri.getLastPathSegment();
            if (last != null) {
                int slash = last.lastIndexOf('/');
                if (slash >= 0) {
                    last = last.substring(slash + 1);
                }
                int dot = last.lastIndexOf('.');
                if (dot > 0) {
                    last = last.substring(0, dot);
                }
                if (last.length() > 0) {
                    return last;
                }
            }
        } catch (Exception ignored) {
            /* fallthrough */
        }
        return "图片 " + index;
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    private void toastOnUi(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                toast(msg);
            }
        });
    }
}
