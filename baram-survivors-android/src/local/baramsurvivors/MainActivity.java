package local.baramsurvivors;

import android.app.Activity;
import android.content.ComponentCallbacks2;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.util.Map;

/** Full-screen, landscape WebView on the game served from the APK (see LocalServer). */
public class MainActivity extends Activity {
    private static final String TAG = "BaramSurvivors";
    // A fixed port keeps the page's origin, and so its saved records, the same across launches.
    private static final int PORT = 47823;
    private static final String START_URL = "http://127.0.0.1:" + PORT + "/";

    private static LocalServer server;

    private WebView web;
    private NativeMusic music;
    private long lastBack;
    // Renderer deaths (memory) seen lately: a WebView is rebuilt for each, up to a few a minute.
    private long goneAt;
    private int goneN;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        try {
            if (server == null) {
                server = new LocalServer(getAssets(), PORT);
                server.start();
            }
        } catch (IOException e) {
            Log.e(TAG, "cannot start local server", e);
            server = null;
            Toast.makeText(this, "포트 " + PORT + "을 쓸 수 없습니다: " + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        WebView.setWebContentsDebuggingEnabled(true);

        makeWeb();

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    /** The game's WebView, made at start and again after its renderer dies. */
    private void makeWeb() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        // A game, not a document: no haptic buzz or overscroll glow when a finger drags.
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(false);
        if (Build.VERSION.SDK_INT >= 26) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        setContentView(web);
        hideSystemBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        // The phone's font size setting would scale the game's text and push its windows apart.
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // The game's files come with the APK: never serve an older copy after an update.
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        // Music outside the WebView, so it never takes the audio focus (see NativeMusic).
        if (music == null) music = new NativeMusic(START_URL);
        web.addJavascriptInterface(music, "BaramMusic");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // The game never leaves its own page.
                return !String.valueOf(request.getUrl()).startsWith(START_URL);
            }

            // (성능 점검 2 2026-11-28) The game's own files streamed from the APK here, without the loopback
            // socket (LocalServer.intercept); a ranged request (media) and anything else goes on to the server.
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                LocalServer s = server;
                Uri u = request.getUrl();
                if (s == null || u == null || !"GET".equals(request.getMethod())) return null;
                if (!"127.0.0.1".equals(u.getHost()) || u.getPort() != PORT) return null;
                Map<String, String> h = request.getRequestHeaders();
                if (h != null && (h.containsKey("Range") || h.containsKey("range"))) return null;
                return s.intercept(u.getPath());
            }

            // The page's renderer died (on a phone, mostly out of memory). Without this the
            // whole app was killed with it, and Samsung offered to remove the WebView update.
            // Instead: a new WebView on the same page; the hero's records are in its storage.
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e(TAG, "renderer gone, crashed=" + (Build.VERSION.SDK_INT >= 26 && detail.didCrash()));
                if (view != web) return true;
                long now = SystemClock.uptimeMillis();
                goneN = now - goneAt < 60000 ? goneN + 1 : 1;
                goneAt = now;
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                web = null;
                if (goneN > 3) {
                    Toast.makeText(MainActivity.this, "메모리가 부족해 게임을 종료합니다", Toast.LENGTH_LONG).show();
                    finish();
                    return true;
                }
                makeWeb();
                web.loadUrl(START_URL);
                Toast.makeText(MainActivity.this, "메모리가 부족해 화면을 다시 불러왔습니다", Toast.LENGTH_LONG).show();
                return true;
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            // In the background the hunt pauses and goes quiet (game.js __appPause).
            web.evaluateJavascript("window.__appPause&&__appPause(true)", null);
            web.onPause();
            web.pauseTimers();
        }
        if (music != null) music.hold(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            // Sound comes back; the hunt stays on its menu until the player resumes it.
            web.evaluateJavascript("window.__appPause&&__appPause(false)", null);
        }
        if (music != null) music.hold(false);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // Back opens the game's menu or steps back through its screens; on the title, a
        // second press within 1.5 seconds leaves the app.
        web.evaluateJavascript("window.__appBack?__appBack():false", value -> {
            if ("true".equals(value)) return;
            long now = SystemClock.uptimeMillis();
            if (now - lastBack < 1500) {
                finish();
                return;
            }
            lastBack = now;
            Toast.makeText(this, "한 번 더 누르면 종료합니다", Toast.LENGTH_SHORT).show();
        });
    }

    /**
     * (성능 점검 2 2026-11-28) The phone short of memory, or the app sent to the background: the page
     * halves its picture and effect budgets for two minutes and lets go of what it is not drawing
     * (game.js __appTrim) — before the system kills the renderer for it.
     */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (web != null && level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            web.evaluateJavascript("window.__appTrim&&__appTrim(" + level + ")", null);
        }
    }

    @Override
    protected void onDestroy() {
        if (music != null) music.release();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
