package local.baramsurvivors;

import android.content.res.AssetManager;
import android.util.Log;
import android.webkit.WebResourceResponse;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
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
 * A tiny static file server on the loopback interface, as in the d2survivors wrapper: it serves
 * the game from the APK's assets/www so the page runs on http://127.0.0.1:PORT, where module
 * scripts, fetch() and audio decoding work as on a web server (file:// URLs block them).
 */
final class LocalServer {
    private static final String TAG = "BaramLocalServer";
    private static final String ROOT = "www";
    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("js", "text/javascript; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("md", "text/plain; charset=utf-8");
        TYPES.put("png", "image/png");
        TYPES.put("webp", "image/webp");
        TYPES.put("gif", "image/gif");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("wav", "audio/wav");
        TYPES.put("m4a", "audio/mp4");
        TYPES.put("mp3", "audio/mpeg");
        TYPES.put("ogg", "audio/ogg");
    }

    private final AssetManager assets;
    private final int port;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private ServerSocket server;

    LocalServer(AssetManager assets, int port) {
        this.assets = assets;
        this.port = port;
    }

    synchronized void start() throws IOException {
        if (server != null) return;
        server = new ServerSocket(port, 64, InetAddress.getByName("127.0.0.1"));
        server.setReuseAddress(true);
        Thread accept = new Thread(this::acceptLoop, "baram-http");
        accept.setDaemon(true);
        accept.start();
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
                // Headers are not needed: files are small and served whole.
            }
            String[] parts = requestLine.split(" ");
            boolean head = parts.length > 0 && parts[0].equals("HEAD");
            if (parts.length < 2 || !(head || parts[0].equals("GET"))) {
                send(out, 400, "Bad Request", "text/plain", null, false);
            } else {
                serve(out, parts[1], head);
            }
            out.flush();
        } catch (IOException e) {
            Log.d(TAG, "request failed: " + e.getMessage());
        }
    }

    private void serve(OutputStream out, String target, boolean head) throws IOException {
        String path = target;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int h = path.indexOf('#');
        if (h >= 0) path = path.substring(0, h);
        path = URLDecoder.decode(path.replace("+", "%2B"), "UTF-8");
        if (!path.startsWith("/") || path.contains("..")) {
            send(out, 400, "Bad Request", "text/plain", null, head);
            return;
        }
        String rel = path.substring(1);
        if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
        byte[] body = read(rel);
        if (body == null) {
            send(out, 404, "Not Found", "text/plain; charset=utf-8",
                    "Not in this build".getBytes(StandardCharsets.UTF_8), head);
            return;
        }
        send(out, 200, "OK", typeOf(rel), body, head);
    }

    /**
     * (성능 점검 2 2026-11-28) The page's own requests answered inside the WebView (MainActivity's
     * shouldInterceptRequest), streamed from the APK: no socket, no thread, no whole file in memory
     * first. A war's start asks for 130-150 effect sheets and dozens of map pieces, each once a new
     * connection here. The URL (and so the page's origin and its saved records) stays the same;
     * this server still answers what is not taken there (the native music player, ranges).
     * Returns null for what it does not serve (the WebView then goes to the server).
     */
    WebResourceResponse intercept(String path) {
        if (path == null || !path.startsWith("/") || path.contains("..")) return null;
        String rel = path.substring(1);
        if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        String type = typeOf(rel);
        int semi = type.indexOf(';');
        String mime = semi < 0 ? type : type.substring(0, semi);
        String enc = semi < 0 ? null : "utf-8";
        try {
            InputStream in = assets.open(ROOT + "/" + rel, AssetManager.ACCESS_STREAMING);
            return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
        } catch (IOException e) {
            // (missing, or a directory: as the server's 404)
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                    new ByteArrayInputStream("Not in this build".getBytes(StandardCharsets.UTF_8)));
        }
    }

    private byte[] read(String rel) {
        try (InputStream s = assets.open(ROOT + "/" + rel)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream(Math.max(s.available(), 8192));
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = s.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toByteArray();
        } catch (IOException e) {
            // Missing files and directories both land here.
            return null;
        }
    }

    private static String typeOf(String rel) {
        int dot = rel.lastIndexOf('.');
        String ext = dot < 0 ? "" : rel.substring(dot + 1).toLowerCase(Locale.ROOT);
        String t = TYPES.get(ext);
        return t != null ? t : "application/octet-stream";
    }

    private static void send(OutputStream out, int code, String reason, String type,
                             byte[] body, boolean head) throws IOException {
        int len = body == null ? 0 : body.length;
        String headers = "HTTP/1.1 " + code + " " + reason + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + len + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(headers.getBytes(StandardCharsets.ISO_8859_1));
        if (!head && body != null) out.write(body);
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
