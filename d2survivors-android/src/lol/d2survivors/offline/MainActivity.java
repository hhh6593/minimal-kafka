package lol.d2survivors.offline;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Message;
import android.webkit.JavascriptInterface;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String TAG = "D2SOffline";
    // A fixed port keeps the origin, and so the extracted game files and saves, stable across launches.
    private static final int PORT = 47811;
    private static final String HOST = "127.0.0.1:" + PORT;
    private static final String START_URL = "http://" + HOST + "/play/";
    // The game's own test switches (see tn in the site's code): no damage taken, fifty times the
    // damage dealt, and the game clock sped up so the acts go by fast while their files load.
    // The game never ranks a run played with them.
    private static final String STRONG_QUERY = "?god&power=50&speed=";
    private static final int[] SPEEDS = {2, 4, 8, 16};
    private static final String PREFS = "app";
    private static final String PREF_STRONG = "strongMode";
    private static final String PREF_SPEED = "strongSpeed";
    private static final int PICK_FOLDER = 1;
    // How deep under the picked folder to look for the .mpq files, as the setup page does.
    private static final int SEARCH_DEPTH = 3;

    private static LocalServer server;
    private static GameFileCache gameFiles;
    private static File gameFilesDir;

    private WebView web;
    private ValueCallback<Uri[]> pendingChooser;
    private long lastBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        if (!startServer()) return;
        // Lets chrome://inspect attach to the page when something misbehaves on a phone.
        WebView.setWebContentsDebuggingEnabled(true);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        // A game, not a document: no haptic buzz or overscroll glow when a finger holds or
        // drags. Long presses are answered inside the page (/__app/touch.js): handling them
        // here made WebView cancel the touch that was steering the stick.
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
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        // The phone's font size setting would scale the game's text and push its UI apart.
        s.setTextZoom(100);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        web.addJavascriptInterface(new AppBridge(), "D2SApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getAuthority())) {
                    // The game's pages move between themselves without the strong mode's switches.
                    if (strongMode() && isGamePage(u) && u.getQueryParameter("god") == null) {
                        view.loadUrl(startUrl());
                        return true;
                    }
                    return false;
                }
                openOutside(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // window.open(): the game's WEBSITE, DISCORD and NEWS buttons. Catch the address
                // with a throwaway view and hand it to the browser.
                WebView probe = new WebView(MainActivity.this);
                probe.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        openOutside(r.getUrl());
                        v.destroy();
                        return true;
                    }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(probe);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingChooser != null) pendingChooser.onReceiveValue(null);
                pendingChooser = callback;
                // The setup asks for the Diablo II folder. WebView cannot pick one, so
                // the app opens Android's folder picker and hands the page the .mpq
                // files it finds there.
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                if (Build.VERSION.SDK_INT >= 26) {
                    // Start in internal storage's Download/diablo2: folders reached through the
                    // picker's "Downloads" shortcut can never be picked, the same folder here can.
                    pick.putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri(
                            "com.android.externalstorage.documents", "primary:Download/diablo2"));
                }
                try {
                    startActivityForResult(pick, PICK_FOLDER);
                    Toast.makeText(MainActivity.this,
                            "내장 저장공간 > Download > diablo2 폴더에서 하단의 '이 폴더 사용'을 누르세요"
                                    + " (왼쪽 메뉴의 '다운로드' 바로가기로 들어가면 선택이 막힙니다)",
                            Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    pendingChooser = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrl());
        }
    }

    private String startUrl() {
        return strongMode() ? START_URL + STRONG_QUERY + strongSpeed() : START_URL;
    }

    private int strongSpeed() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getInt(PREF_SPEED, 4);
    }

    private static boolean isGamePage(Uri u) {
        String p = u.getPath();
        return "/play/".equals(p) || "/play/index.html".equals(p);
    }

    private boolean strongMode() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_STRONG, false);
    }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    /** Other sites open in the browser; offline there is nothing to open them with. */
    private void openOutside(Uri u) {
        if (!online()) {
            Toast.makeText(this, "오프라인에서는 열 수 없습니다", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
            Log.w(TAG, "no handler for " + u);
        }
    }

    /** What the page may ask of the app. */
    private final class AppBridge {
        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(MainActivity.this::showSettings);
        }
    }

    private void showSettings() {
        final int was = strongMode() ? strongSpeed() : 0;
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad / 2, pad, 0);

        // One row of choices: off, or on at a speed. A separate on/off switch went unseen in
        // this theme and the speed was dropped while it was off.
        TextView strongLabel = new TextView(this);
        strongLabel.setText("강해지는 모드 (무적 · 피해 50배) · 게임 속도");
        box.addView(strongLabel);
        final RadioGroup choices = new RadioGroup(this);
        choices.setOrientation(RadioGroup.HORIZONTAL);
        int[] values = new int[SPEEDS.length + 1];
        System.arraycopy(SPEEDS, 0, values, 1, SPEEDS.length);
        for (int i = 0; i < values.length; i++) {
            RadioButton r = new RadioButton(this);
            r.setText(values[i] == 0 ? "끔" : values[i] + "배");
            r.setId(i + 1);
            choices.addView(r);
            if (values[i] == was) choices.check(i + 1);
        }
        box.addView(choices);
        TextView strongNote = new TextView(this);
        strongNote.setText("고르면 바로 적용되고 게임이 처음 화면부터 다시 열립니다."
                + " 게임에 들어 있는 테스트 기능으로, 빨리 진행하며 오프라인용 파일을 모을 때 쓰세요."
                + " 빠를수록 그림이 늦게 뜰 수 있지만 파일은 그대로 저장됩니다. 리더보드는 이 앱에서 꺼져 있습니다.");
        strongNote.setTextSize(12);
        strongNote.setPadding(0, 0, 0, pad);
        box.addView(strongNote);

        final TextView report = new TextView(this);
        report.setTypeface(Typeface.MONOSPACE);
        report.setText("오프라인 준비도 계산 중…");
        box.addView(report);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);
        final AlertDialog dialog = new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                .setTitle("앱 설정")
                .setView(scroll)
                .setPositiveButton("닫기", null)
                .create();
        choices.setOnCheckedChangeListener((group, id) -> {
            int speed = values[id - 1];
            if (speed == was) return;
            SharedPreferences.Editor e = getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putBoolean(PREF_STRONG, speed > 0);
            if (speed > 0) e.putInt(PREF_SPEED, speed);
            e.apply();
            Toast.makeText(this, speed > 0 ? "강해지는 모드: 켬 · 속도 " + speed + "배" : "강해지는 모드: 끔",
                    Toast.LENGTH_SHORT).show();
            dialog.dismiss();
            web.loadUrl(startUrl());
        });
        dialog.show();
        hideSystemBars();

        new Thread(() -> {
            String text = new Readiness(gameFilesDir).report();
            long[] stats = gameFiles.stats();
            String all = String.format(Locale.ROOT, "오프라인 준비도 (저장 %d개, %.0f MB)\n\n", stats[0],
                    stats[1] / 1048576.0)
                    + (text != null ? text + "\n막: 몬스터 그림 · 지형 · 음악 기준. 보스는 만나야 저장됩니다."
                    : "아직 정보가 없습니다. 온라인에서 HOSTED FILES로 한 번 플레이하세요.");
            runOnUiThread(() -> report.setText(all));
        }, "d2s-readiness").start();
    }

    private boolean startServer() {
        try {
            if (server == null) {
                Updater updater = new Updater(new File(getFilesDir(), "site"));
                updater.applyPending();
                LocalServer.Files files = siteFiles(updater.current());
                gameFilesDir = new File(getFilesDir(), "d2");
                gameFiles = new GameFileCache(gameFilesDir);
                server = new LocalServer(files, gameFiles, PORT);
                server.start();
                reportKeptFiles(gameFiles);
                updater.checkAsync(installedBuild(files), build -> runOnUiThread(() ->
                        Toast.makeText(this, "게임 새 버전(" + build + ")을 받았습니다. 앱을 다시 시작하면 적용됩니다.",
                                Toast.LENGTH_LONG).show()));
            }
            return true;
        } catch (IOException e) {
            Log.e(TAG, "cannot start local server", e);
            server = null;
            Toast.makeText(this, "Local port " + PORT + " is busy: " + e.getMessage(),
                    Toast.LENGTH_LONG).show();
            finish();
            return false;
        }
    }

    /** Says how much of the game the app keeps for offline play: it lives in app-private storage. */
    private void reportKeptFiles(final GameFileCache gameFiles) {
        new Thread(() -> {
            long[] stats = gameFiles.stats();
            String text = stats[0] == 0
                    ? "아직 오프라인용 게임 파일이 없습니다. 온라인에서 HOSTED FILES로 플레이하면 저장됩니다."
                    : String.format(Locale.ROOT, "오프라인용 게임 파일 %d개 (%.1f MB) 저장됨",
                    stats[0], stats[1] / 1048576.0);
            runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show());
        }, "d2s-count").start();
    }

    /** The site as updated in the app's storage, else the copy built into the APK. */
    private LocalServer.Files siteFiles(final File updated) {
        if (new File(updated, "play/index.html").isFile()) {
            return new LocalServer.Files() {
                @Override
                public InputStream open(String path) throws IOException {
                    File f = new File(updated, path.substring(path.indexOf('/') + 1));
                    if (!f.isFile()) throw new FileNotFoundException(path);
                    return new FileInputStream(f);
                }

                @Override
                public String[] list(String path) {
                    String[] names = new File(updated, path.substring(path.indexOf('/') + 1)).list();
                    return names != null ? names : new String[0];
                }
            };
        }
        final AssetManager assets = getAssets();
        return new LocalServer.Files() {
            @Override
            public InputStream open(String path) throws IOException {
                return assets.open(path);
            }

            @Override
            public String[] list(String path) throws IOException {
                return assets.list(path);
            }
        };
    }

    private static String installedBuild(LocalServer.Files files) {
        try (InputStream in = files.open("www/build.json")) {
            return new String(Updater.readAll(in), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FOLDER || pendingChooser == null) return;
        final ValueCallback<Uri[]> callback = pendingChooser;
        pendingChooser = null;
        final Uri tree = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (tree == null) {
            callback.onReceiveValue(null);
            return;
        }
        // Listing a folder through the document provider can be slow: keep it off the UI thread.
        new Thread(() -> {
            List<String> names = new ArrayList<>();
            Uri[] files = findMpqs(tree, names);
            runOnUiThread(() -> {
                Toast.makeText(this, files.length == 0
                                ? "이 폴더와 하위 폴더에서 .mpq 파일을 찾지 못했습니다"
                                : ".mpq " + files.length + "개 찾음: " + TextUtils.join(", ", names),
                        Toast.LENGTH_LONG).show();
                callback.onReceiveValue(files);
            });
        }, "d2s-find-mpq").start();
    }

    /** The .mpq files in the picked folder and its subfolders, nearest first, one per name. */
    private Uri[] findMpqs(Uri tree, List<String> names) {
        List<Uri> found = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        List<String> level = new ArrayList<>();
        level.add(DocumentsContract.getTreeDocumentId(tree));
        String[] columns = {DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE};
        for (int depth = 0; depth <= SEARCH_DEPTH && !level.isEmpty(); depth++) {
            List<String> next = new ArrayList<>();
            for (String dir : level) {
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dir);
                try (Cursor c = getContentResolver().query(children, columns, null, null, null)) {
                    while (c != null && c.moveToNext()) {
                        String id = c.getString(0), name = c.getString(1), mime = c.getString(2);
                        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                            next.add(id);
                        } else if (name != null && name.toLowerCase(Locale.ROOT).endsWith(".mpq")
                                && seen.add(name.toLowerCase(Locale.ROOT))) {
                            found.add(DocumentsContract.buildDocumentUriUsingTree(tree, id));
                            names.add(name);
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "cannot list " + dir, e);
                }
            }
            level = next;
        }
        return found.toArray(new Uri[0]);
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
            // In the background the game goes quiet and still: WebView's own pause leaves
            // its sound and timers running.
            web.evaluateJavascript("window.__d2sAudio&&__d2sAudio(false)", null);
            web.onPause();
            web.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            web.evaluateJavascript("window.__d2sAudio&&__d2sAudio(true)", null);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        long now = SystemClock.uptimeMillis();
        if (now - lastBack < 1500) {
            super.onBackPressed();
            return;
        }
        lastBack = now;
        String path = Uri.parse(String.valueOf(web.getUrl())).getPath();
        if ("/play/".equals(path)) {
            // In the game, Back works like Esc: it opens or closes the game's own menu.
            web.evaluateJavascript("(()=>{for(const t of['keydown','keyup'])"
                    + "dispatchEvent(new KeyboardEvent(t,{key:'Escape',code:'Escape',bubbles:true}))})()", null);
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            web.loadUrl(START_URL);
        }
        Toast.makeText(this, "한 번 더 누르면 종료합니다", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
