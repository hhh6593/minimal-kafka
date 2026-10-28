package lol.d2survivors.offline;

import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Refreshes the app's copy of the site while the phone is online, so a new
 * game build needs no new APK. The new copy is mirrored and patched into
 * files/site/next and swapped in as files/site/current on the next launch;
 * any failure leaves the copy in use untouched.
 *
 * Mirrors tools/mirror.py and applies the patches of tools/patch_offline.py;
 * keep the three in step.
 */
final class Updater {
    interface Listener {
        void onUpdateReady(String build);
    }

    private static final String TAG = "D2SUpdater";
    private static final String BASE = "https://d2survivors.lol/";
    private static final String[] SKIP = {"/d2/", "/download/", "/api/", "/next/", "/cdn-cgi/", "/fonts-ko/"};
    private static final String[] SEEDS = {"", "play/", "play/setup.html", "faq/", "legal/", "privacy/",
            "leaderboards/", "sw.js", "manifest.json", "favicon-32.png", "favicon-48.png", "icon-512.png",
            "apple-touch-icon.png", "build.json", "changelog.json"};
    private static final String[] REQUIRED = {"play/index.html", "play/setup.html", "sw.js", "build.json",
            "import/worker.js"};
    private static final Pattern REF = Pattern.compile(
            "(?:src|href|content)=[\"']([^\"'#]+)[\"']"
                    + "|url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)"
                    + "|[\"'`]((?:\\.{0,2}/)?(?:[\\w@~.-]+/)*[\\w@~.-]+\\.(?:js|mjs|css|json|wasm|png|webp|jpg|svg"
                    + "|woff2?|ttf|otf|m4a|wav|txt|html|ico|webmanifest))(?:\\?[^\"'`]*)?[\"'`]");
    private static final Pattern BUILD = Pattern.compile("\"build\"\\s*:\\s*\"([^\"]*)\"");

    /** One source patch: regex -> replacement, and how an already patched file reads. */
    private static final class Patch {
        final String prefix;
        final Pattern find;
        final String replace;
        final Pattern done;

        Patch(String prefix, String find, String replace, String done) {
            this.prefix = prefix;
            this.find = Pattern.compile(find);
            this.replace = replace;
            this.done = Pattern.compile(done);
        }
    }

    private static final Patch[] PATCHES = {
            new Patch("assets/game-",
                    "function ([\\w$]+)\\(\\)\\{return matchMedia\\(`\\(pointer: coarse\\)`\\)\\.matches"
                            + "&&!matchMedia\\(`\\(pointer: fine\\)`\\)\\.matches\\}",
                    "function $1(){return!1}",
                    "function [\\w$]+\\(\\)\\{return!1\\}async function"),
            new Patch("assets/setup-",
                    "var ([\\w$]+)=\\(\\)=>window\\.showDirectoryPicker;",
                    "var $1=()=>void 0;",
                    "var [\\w$]+=\\(\\)=>void 0;function"),
            new Patch("assets/setup-",
                    "([\\w$]+)\\.webkitdirectory=!0",
                    "$1.webkitdirectory=!1",
                    "\\.webkitdirectory=!1"),
            new Patch("assets/Game-",
                    "if\\(([\\w$]+)\\.pointerType===`touch`\\)\\{if\\(this\\.stick\\)return;",
                    "if($1.pointerType===`touch`){if(this.stick){if(window.__d2sTouch?.has(this.stick.id))return;"
                            + "this.dropStick()}",
                    "window\\.__d2sTouch\\?\\.has\\(this\\.stick\\.id\\)"),
    };
    private static final Pattern BEACON = Pattern.compile(
            "<script[^>]*cloudflareinsights[^>]*></script>|<script[^>]*src=\"/cdn-cgi/[^\"]*\"[^>]*></script>");

    private final File siteDir;

    Updater(File siteDir) {
        this.siteDir = siteDir;
    }

    File current() {
        return new File(siteDir, "current");
    }

    /** Swaps a finished download in; call before the server starts serving. */
    void applyPending() {
        File next = new File(siteDir, "next");
        if (!new File(next, ".complete").isFile()) return;
        File old = new File(siteDir, "old");
        delete(old);
        File cur = current();
        if (cur.exists() && !cur.renameTo(old)) return;
        if (!next.renameTo(cur)) {
            old.renameTo(cur);
            return;
        }
        delete(old);
    }

    /** Checks for a new build in the background; installedBuild is the build.json in use. */
    void checkAsync(final String installedBuild, final Listener listener) {
        Thread t = new Thread(() -> {
            try {
                String build = check(installedBuild);
                if (build != null) listener.onUpdateReady(build);
            } catch (Exception e) {
                Log.i(TAG, "no update: " + e);
            }
        }, "d2s-update");
        t.setDaemon(true);
        t.start();
    }

    String check(String installedBuild) throws Exception {
        String remote = buildOf(new String(get(BASE + "build.json"), StandardCharsets.UTF_8));
        if (remote == null || remote.equals(buildOf(installedBuild))) return null;
        File pending = new File(new File(siteDir, "next"), "build.json");
        if (new File(siteDir, "next/.complete").isFile() && pending.isFile()
                && remote.equals(buildOf(new String(readFile(pending), StandardCharsets.UTF_8)))) {
            return remote; // already downloaded, waiting for a restart
        }
        File work = new File(siteDir, "work");
        delete(work);
        mirror(work);
        for (String r : REQUIRED) {
            if (!new File(work, r).isFile()) throw new IOException("mirror lacks " + r);
        }
        if (!playsHostedFiles(new File(work, "assets"))) {
            // The site has announced that hosted files go away; a build without them could
            // not play the files GameFileCache kept, so the app stays on the build it has.
            throw new IOException("the new build no longer plays hosted files");
        }
        patch(work);
        File next = new File(siteDir, "next");
        delete(next);
        if (!work.renameTo(next)) throw new IOException("cannot stage update");
        new FileOutputStream(new File(next, ".complete")).close();
        return remote;
    }

    static String buildOf(String json) {
        if (json == null) return null;
        Matcher m = BUILD.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    private void mirror(final File out) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            Set<String> seen = new HashSet<>();
            List<String> frontier = new ArrayList<>();
            for (String s : SEEDS) frontier.add(BASE + s);
            while (!frontier.isEmpty()) {
                List<String> batch = new ArrayList<>();
                for (String u : frontier) {
                    u = strip(u);
                    if (u == null || !u.startsWith(BASE) || skipped(u) || !seen.add(u)) continue;
                    batch.add(u);
                }
                frontier = new ArrayList<>();
                List<Future<byte[]>> results = new ArrayList<>();
                for (final String u : batch) results.add(pool.submit(() -> fetchOrNull(u)));
                for (int i = 0; i < batch.size(); i++) {
                    byte[] data = results.get(i).get();
                    if (data == null) continue; // 404: a guess at a path that isn't there
                    String u = batch.get(i);
                    String rel = localPath(u);
                    File f = new File(out, rel);
                    f.getParentFile().mkdirs();
                    try (FileOutputStream o = new FileOutputStream(f)) {
                        o.write(data);
                    }
                    if (rel.matches(".*\\.(js|mjs|css|html|json)$")) {
                        boolean js = rel.endsWith(".js") || rel.endsWith(".mjs");
                        Matcher m = REF.matcher(new String(data, StandardCharsets.UTF_8));
                        while (m.find()) {
                            String ref = m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : m.group(3);
                            if (ref.startsWith("data:") || ref.startsWith("mailto:") || ref.startsWith("blob:")
                                    || ref.startsWith("javascript:")) continue;
                            String abs = resolve(u, ref);
                            if (abs != null) frontier.add(abs);
                            if (js && !ref.startsWith("/") && !ref.startsWith(".") && !ref.startsWith("http")) {
                                frontier.add(BASE + ref);
                                frontier.add(BASE + "assets/" + ref);
                                frontier.add(BASE + "play/" + ref);
                            }
                        }
                    }
                }
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private static boolean playsHostedFiles(File assets) throws IOException {
        File[] files = assets.listFiles();
        if (files == null) return false;
        for (File f : files) {
            if (f.getName().endsWith(".js")
                    && new String(readFile(f), StandardCharsets.UTF_8).contains("hostedFiles")) {
                return true;
            }
        }
        return false;
    }

    private static void patch(File root) throws IOException {
        for (Patch p : PATCHES) {
            boolean hit = false;
            File dir = new File(root, p.prefix.substring(0, p.prefix.lastIndexOf('/')));
            String name = p.prefix.substring(p.prefix.lastIndexOf('/') + 1);
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (!f.getName().startsWith(name) || !f.getName().endsWith(".js")) continue;
                    String text = new String(readFile(f), StandardCharsets.UTF_8);
                    Matcher m = p.find.matcher(text);
                    if (m.find()) {
                        writeFile(f, m.replaceAll(p.replace));
                        hit = true;
                    } else if (p.done.matcher(text).find()) {
                        hit = true;
                    }
                }
            }
            if (!hit) throw new IOException("the new build no longer matches patch " + p.find.pattern());
        }
        new File(root, "robots.txt").delete();
        stripBeacons(root);
    }

    private static void stripBeacons(File dir) throws IOException {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                stripBeacons(f);
            } else if (f.getName().endsWith(".html")) {
                String text = new String(readFile(f), StandardCharsets.UTF_8);
                String clean = BEACON.matcher(text).replaceAll("");
                if (!clean.equals(text)) writeFile(f, clean);
            }
        }
    }

    private static boolean skipped(String u) {
        String path;
        try {
            path = new URI(u).getPath();
        } catch (URISyntaxException e) {
            return true; // text that only looked like a path
        }
        if (path == null) return true;
        for (String s : SKIP) if (path.startsWith(s)) return true;
        return false;
    }

    private static String strip(String u) {
        int i = u.indexOf('#');
        if (i >= 0) u = u.substring(0, i);
        i = u.indexOf('?');
        return i >= 0 ? u.substring(0, i) : u;
    }

    private static String resolve(String base, String ref) {
        try {
            String u = URI.create(base).resolve(ref).normalize().toString();
            // Like a browser, ".." never climbs above the site's root.
            while (u.startsWith(BASE + "../")) u = BASE + u.substring(BASE.length() + 3);
            return u;
        } catch (IllegalArgumentException e) {
            return null; // text that only looked like a path
        }
    }

    private static String localPath(String u) {
        String p = URI.create(u).getPath();
        if (p.endsWith("/")) p += "index.html";
        return p.substring(1);
    }

    private static byte[] fetchOrNull(String u) throws IOException {
        IOException last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                return get(u);
            } catch (FileNotFoundException e) {
                return null;
            } catch (IOException e) {
                last = e;
            }
        }
        throw last;
    }

    private static byte[] get(String u) throws IOException {
        URL url = new URL(u);
        // HttpURLConnection does not follow 308, which the site uses for moved pages.
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(8000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "D2SurvivorsOffline/1.1 (Android)");
            try {
                int code = c.getResponseCode();
                if (code == 400 || code == 404 || code == 410) throw new FileNotFoundException(u);
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                    url = new URL(url, c.getHeaderField("Location"));
                    if (!url.toString().startsWith(BASE)) throw new FileNotFoundException(u);
                    continue;
                }
                if (code != 200) throw new IOException("HTTP " + code + " for " + u);
                try (InputStream in = c.getInputStream()) {
                    return readAll(in);
                }
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("too many redirects for " + u);
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(64 * 1024);
        byte[] chunk = new byte[64 * 1024];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        return buf.toByteArray();
    }

    private static byte[] readFile(File f) throws IOException {
        try (InputStream in = new java.io.FileInputStream(f)) {
            return readAll(in);
        }
    }

    private static void writeFile(File f, String text) throws IOException {
        try (FileOutputStream o = new FileOutputStream(f)) {
            o.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }
}
