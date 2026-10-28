package lol.d2survivors.offline;

import android.app.Activity;
import android.content.Intent;
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
    private static final int PICK_FOLDER = 1;
    // How deep under the picked folder to look for the .mpq files, as the setup page does.
    private static final int SEARCH_DEPTH = 3;

    private static LocalServer server;

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
        // A game, not a document: no text-selection popups, haptic buzz or
        // overscroll glow when a finger holds or drags on the screen.
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);
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
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getAuthority())) return false;
                // Links to other sites (Discord, Ko-fi, ...) open in the browser when online.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    Log.w(TAG, "no handler for " + u);
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
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
            web.loadUrl(START_URL);
        }
    }

    private boolean startServer() {
        try {
            if (server == null) {
                Updater updater = new Updater(new File(getFilesDir(), "site"));
                updater.applyPending();
                LocalServer.Files files = siteFiles(updater.current());
                final GameFileCache gameFiles = new GameFileCache(new File(getFilesDir(), "d2"));
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
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
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
