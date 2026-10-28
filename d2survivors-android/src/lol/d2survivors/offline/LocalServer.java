package lol.d2survivors.offline;

import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny static file server bound to the loopback interface. It serves the
 * mirrored site from the APK's assets/www folder so the page runs on
 * http://127.0.0.1:PORT, a secure context where service workers and the
 * origin private file system (where the game keeps its extracted files) work.
 */
final class LocalServer {
    private static final String TAG = "D2SLocalServer";
    private static final String ROOT = "www";
    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("js", "text/javascript; charset=utf-8");
        TYPES.put("mjs", "text/javascript; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("webmanifest", "application/manifest+json");
        TYPES.put("txt", "text/plain; charset=utf-8");
        TYPES.put("xml", "application/xml");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("jpeg", "image/jpeg");
        TYPES.put("webp", "image/webp");
        TYPES.put("gif", "image/gif");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("woff", "font/woff");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("ttf", "font/ttf");
        TYPES.put("otf", "font/otf");
        TYPES.put("wasm", "application/wasm");
        TYPES.put("wav", "audio/wav");
        TYPES.put("m4a", "audio/mp4");
        TYPES.put("mp3", "audio/mpeg");
        TYPES.put("ogg", "audio/ogg");
    }

    /** Where the site's files come from: the APK's assets on a device. */
    interface Files {
        InputStream open(String path) throws IOException;

        String[] list(String path) throws IOException;
    }

    /** Served at APP_CSS and linked into every page: fits the site to a phone held sideways. */
    private static final String APP_CSS_PATH = "/__app/mobile.css";
    private static final byte[] APP_CSS = (""
            // Taps should feel like a game's buttons, not a web page's links.
            + "*{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}"
            + "#d2s-app{position:fixed;z-index:100;top:calc(env(safe-area-inset-top) + 8px);"
            + "left:calc(env(safe-area-inset-left) + 8px);width:44px;height:44px;padding:0;font-size:24px;"
            + "line-height:42px;color:#c7b377;background:#000000a6;border:1px solid #6e5e3e;border-radius:6px}"
            + "#d2s-app[hidden]{display:none}"
            // The life and mana globes and the bars only show numbers; on a touch screen they
            // sat where the left thumb starts the stick, so let touches through to the game.
            + "@media (pointer:coarse){#ctrlpnl .globe,#ctrlpnl .bar,#ctrlpnl .glass{pointer-events:none!important}}"
            + "button,a,[role=button]{-webkit-user-select:none;user-select:none;touch-action:manipulation}"
            // Offline the leaderboards, Discord and Ko-fi cannot load: keep them out of reach.
            + ".site-boards,.site-discord,.site-kofi,.site-footer a[href^=http],.site-footer a[href*=leaderboards]"
            + "{display:none!important}"
            // A phone held sideways: the setup's big icon and title pushed its buttons off the screen.
            + "@media (orientation:landscape) and (max-height:540px){"
            + ".site-bar-in{min-height:0!important;padding-top:4px!important;padding-bottom:4px!important}"
            + ".site-mark{width:28px!important;height:28px!important}"
            // The bar above already names the game.
            + ".stage main>header{display:none!important}"
            + ".page p{margin-top:.3em!important;margin-bottom:.3em!important}"
            + ".stage main{padding-top:8px!important;margin-top:0!important}"
            + ".stage{min-height:0!important;padding-top:0!important}"
            + "#heading{margin-top:4px!important}"
            // Whatever the setup says above them, its buttons stay on screen.
            + "#actions{position:sticky;bottom:0;z-index:5;padding:8px 0 10px!important;margin-bottom:0!important;"
            + "background:linear-gradient(transparent,rgba(12,8,5,.92) 30%)}"
            + "}"
            + "@media (orientation:landscape) and (max-height:400px){"
            + "#lines{font-size:.9em!important}"
            + "#heading{font-size:1.4em!important}"
            + "}").getBytes(StandardCharsets.UTF_8);
    /** Served at APP_JS_PATH and loaded before the game's modules: touch fixes for a phone. */
    private static final String APP_JS_PATH = "/__app/touch.js";
    private static final byte[] APP_JS = (""
            + "(()=>{"
            // The touch pointers on the screen now, for the game's stick (see patch_offline.py).
            + "const down=new Set();window.__d2sTouch=down;"
            + "addEventListener('pointerdown',e=>{if(e.pointerType==='touch')down.add(e.pointerId)},true);"
            + "for(const t of['pointerup','pointercancel'])addEventListener(t,e=>down.delete(e.pointerId),true);"
            + "for(const t of['touchend','touchcancel'])addEventListener(t,e=>{if(!e.touches.length)down.clear()},true);"
            // A held finger is a held stick, not a request for a context menu: answering the
            // long press here keeps WebView from cancelling the touch.
            + "addEventListener('contextmenu',e=>{if(down.size)e.preventDefault()},true);"
            // Every sound context, so the app can silence the game while it is in the background
            // and bring back only the ones that were playing.
            + "const AC=window.AudioContext,ctxs=new Set(),was=new Set();"
            + "if(AC){window.AudioContext=class extends AC{constructor(...a){super(...a);ctxs.add(this)}};"
            + "if(window.webkitAudioContext)window.webkitAudioContext=window.AudioContext}"
            + "window.__d2sAudio=on=>{for(const c of ctxs){if(!on){if(c.state==='running'){was.add(c);"
            + "c.suspend().catch(()=>{})}}else if(was.has(c)){was.delete(c);c.resume().catch(()=>{})}}};"
            // The app's settings button, on the game's menus only.
            + "if(location.pathname.startsWith('/play/')&&window.D2SApp)addEventListener('DOMContentLoaded',()=>{"
            + "const b=document.createElement('button');b.id='d2s-app';b.type='button';b.textContent='\u2699';"
            + "b.setAttribute('aria-label','App settings');b.tabIndex=-1;"
            // Never take focus: a focused button kept the game's menus from hearing the next tap.
            + "b.onpointerdown=e=>{e.preventDefault();e.stopPropagation()};"
            + "b.onclick=e=>{e.preventDefault();e.stopPropagation();b.blur();D2SApp.openSettings()};"
            + "document.body.append(b);const sync=()=>{b.hidden=!document.body.classList.contains('no-run')};"
            + "new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});sync()});"
            + "})();").getBytes(StandardCharsets.UTF_8);
    private static final byte[] APP_CSS_LINK =
            ("<link rel=\"stylesheet\" href=\"" + APP_CSS_PATH + "\"><script src=\"" + APP_JS_PATH
                    + "\"></script>").getBytes(StandardCharsets.UTF_8);

    // The site's own switch: the game streams its files from the server (here, GameFileCache).
    private static final byte[] SITE_JSON = "{ \"hostedFiles\": true }\n".getBytes(StandardCharsets.UTF_8);

    private final Files assets;
    private final GameFileCache gameFiles;
    private final int port;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private ServerSocket server;

    LocalServer(Files assets, GameFileCache gameFiles, int port) {
        this.assets = assets;
        this.gameFiles = gameFiles;
        this.port = port;
    }

    synchronized void start() throws IOException {
        if (server != null) return;
        server = new ServerSocket(port, 64, InetAddress.getByName("127.0.0.1"));
        server.setReuseAddress(true);
        Thread accept = new Thread(this::acceptLoop, "d2s-http");
        accept.setDaemon(true);
        accept.start();
    }

    synchronized void stop() {
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
        }
        server = null;
    }

    private void acceptLoop() {
        ServerSocket s = server;
        while (s != null && !s.isClosed()) {
            try {
                Socket client = s.accept();
                pool.execute(() -> handle(client));
            } catch (IOException e) {
                if (!s.isClosed()) Log.w(TAG, "accept failed", e);
            }
        }
    }

    private void handle(Socket client) {
        try (Socket c = client) {
            c.setSoTimeout(30000);
            InputStream in = new BufferedInputStream(c.getInputStream());
            OutputStream out = new BufferedOutputStream(c.getOutputStream(), 64 * 1024);
            // One request per connection keeps the server simple; loopback reconnects are cheap.
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String header;
            while ((header = readLine(in)) != null && !header.isEmpty()) {
                // Headers are not needed: assets are small and served whole.
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                send(out, 400, "Bad Request", "text/plain", null, false);
                return;
            }
            String method = parts[0];
            boolean head = method.equals("HEAD");
            if (!head && !method.equals("GET")) {
                send(out, 405, "Method Not Allowed", "text/plain", null, false);
                return;
            }
            serve(out, parts[1], head);
            out.flush();
        } catch (IOException e) {
            Log.d(TAG, "request failed: " + e.getMessage());
        }
    }

    private void serve(OutputStream out, String target, boolean head) throws IOException {
        String path = target;
        int h = path.indexOf('#');
        if (h >= 0) path = path.substring(0, h);
        String query = null;
        int q = path.indexOf('?');
        if (q >= 0) {
            query = path.substring(q + 1);
            path = path.substring(0, q);
        }
        path = URLDecoder.decode(path.replace("+", "%2B"), "UTF-8");
        if (!path.startsWith("/") || path.contains("..")) {
            send(out, 400, "Bad Request", "text/plain", null, head);
            return;
        }
        if (path.equals("/")) {
            // The app opens straight into the game, like the site's PWA start_url.
            redirect(out, "/play/");
            return;
        }
        if (path.equals(APP_CSS_PATH)) {
            send(out, 200, "OK", "text/css; charset=utf-8", APP_CSS, head);
            return;
        }
        if (path.equals(APP_JS_PATH)) {
            send(out, 200, "OK", "text/javascript; charset=utf-8", APP_JS, head);
            return;
        }
        if (path.equals("/site.json")) {
            send(out, 200, "OK", "application/json; charset=utf-8", SITE_JSON, head);
            return;
        }
        if (path.startsWith("/api/")) {
            // The leaderboard and the report form are off in the app.
            send(out, 404, "Not Found", "text/plain; charset=utf-8",
                    "Off in the offline app".getBytes(StandardCharsets.UTF_8), head);
            return;
        }
        if (path.startsWith("/d2/")) {
            File f = gameFiles.get(path, query);
            if (f == null) {
                send(out, 404, "Not Found", "text/plain; charset=utf-8",
                        "Not played online yet".getBytes(StandardCharsets.UTF_8), head);
            } else {
                sendFile(out, typeOf(path), f, head);
            }
            return;
        }
        String rel = path.substring(1);
        if (rel.endsWith("/")) rel += "index.html";
        byte[] body = read(rel);
        if (body == null && !rel.endsWith("index.html") && isDirectory(rel)) {
            redirect(out, path + "/");
            return;
        }
        if (body == null) {
            send(out, 404, "Not Found", "text/plain; charset=utf-8",
                    "Not available offline".getBytes(StandardCharsets.UTF_8), head);
            return;
        }
        if (rel.endsWith(".html")) body = withAppCss(body);
        send(out, 200, "OK", typeOf(rel), body, head);
    }

    private static byte[] withAppCss(byte[] html) {
        String text = new String(html, StandardCharsets.UTF_8);
        int at = text.indexOf("</head>");
        if (at < 0) return html;
        byte[] before = text.substring(0, at).getBytes(StandardCharsets.UTF_8);
        byte[] after = text.substring(at).getBytes(StandardCharsets.UTF_8);
        byte[] out = new byte[before.length + APP_CSS_LINK.length + after.length];
        System.arraycopy(before, 0, out, 0, before.length);
        System.arraycopy(APP_CSS_LINK, 0, out, before.length, APP_CSS_LINK.length);
        System.arraycopy(after, 0, out, before.length + APP_CSS_LINK.length, after.length);
        return out;
    }

    private byte[] read(String rel) {
        try (InputStream s = assets.open(ROOT + "/" + rel)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream(Math.max(s.available(), 8192));
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = s.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toByteArray();
        } catch (FileNotFoundException e) {
            return null;
        } catch (IOException e) {
            // Opening a directory as a file lands here too.
            return null;
        }
    }

    private boolean isDirectory(String rel) {
        try {
            String[] list = assets.list(ROOT + "/" + rel);
            return list != null && list.length > 0;
        } catch (IOException e) {
            return false;
        }
    }

    private static String typeOf(String rel) {
        int dot = rel.lastIndexOf('.');
        String ext = dot < 0 ? "" : rel.substring(dot + 1).toLowerCase(Locale.ROOT);
        String t = TYPES.get(ext);
        return t != null ? t : "application/octet-stream";
    }

    private static void redirect(OutputStream out, String location) throws IOException {
        String head = "HTTP/1.1 302 Found\r\nLocation: " + location
                + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
    }

    private static void send(OutputStream out, int code, String reason, String type,
                             byte[] body, boolean head) throws IOException {
        int len = body == null ? 0 : body.length;
        String headers = "HTTP/1.1 " + code + " " + reason + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + len + "\r\n"
                + "Cache-Control: no-cache\r\n"
                + "Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.ISO_8859_1));
        if (!head && body != null) out.write(body);
    }

    private static void sendFile(OutputStream out, String type, File f, boolean head) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            String headers = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + type + "\r\n"
                    + "Content-Length: " + f.length() + "\r\n"
                    + "Cache-Control: no-cache\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(headers.getBytes(StandardCharsets.ISO_8859_1));
            if (head) return;
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') break;
            if (b != '\r') sb.append((char) b);
            if (sb.length() > 16384) throw new IOException("header too long");
        }
        return b == -1 && sb.length() == 0 ? null : sb.toString();
    }
}
