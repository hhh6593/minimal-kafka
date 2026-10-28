package lol.d2survivors.offline;

import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Keeps the game files (/d2/...) the site sends while the player plays
 * online, so the same parts of the game play offline later. It works like a
 * browser cache: it stores only what the game itself asks for, one file at
 * a time, and never fetches ahead.
 */
final class GameFileCache {
    private static final String TAG = "D2SGameFiles";
    private static final String ORIGIN = "https://d2survivors.lol";
    // Beside each file, the ?h= version the site served it under.
    private static final String VERSION_SUFFIX = ".d2sver";

    private final File dir;
    // One lock per file, kept for the process's life, so a file is never downloaded twice at once.
    private final ConcurrentHashMap<String, Object> locks = new ConcurrentHashMap<>();

    GameFileCache(File dir) {
        this.dir = dir;
    }

    /**
     * The file for path (which starts with /d2/): the stored copy when it is
     * current, else a fresh one from the site, else (offline) whatever copy
     * is stored. Null when there is none.
     */
    File get(String path, String query) {
        String rel = path.substring("/d2/".length());
        File file = new File(dir, rel);
        File version = new File(dir, rel + VERSION_SUFFIX);
        String want = query == null ? "" : query;
        Object lock = locks.computeIfAbsent(rel, k -> new Object());
        synchronized (lock) {
            try {
                if (file.isFile() && want.equals(readVersion(version))) return file;
                download(path, query, file, version, want);
                return file;
            } catch (FileNotFoundException e) {
                return null;
            } catch (IOException e) {
                // Offline, or the site is down: an older copy still plays.
                Log.d(TAG, "using stored " + rel + ": " + e.getMessage());
                return file.isFile() ? file : null;
            }
        }
    }

    private static void download(String path, String query, File file, File version, String want)
            throws IOException {
        URL url = new URL(ORIGIN + path + (query == null ? "" : "?" + query));
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(6000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "D2SurvivorsOffline/1.4 (Android)");
        try {
            int code = c.getResponseCode();
            if (code == 404 || code == 410) throw new FileNotFoundException(path);
            if (code != 200) throw new IOException("HTTP " + code);
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                throw new IOException("cannot create " + parent);
            }
            File part = new File(file.getPath() + ".part");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } catch (IOException e) {
                part.delete();
                throw e;
            }
            if (!part.renameTo(file)) {
                part.delete();
                throw new IOException("cannot store " + file);
            }
            try (OutputStream out = new FileOutputStream(version)) {
                out.write(want.getBytes(StandardCharsets.UTF_8));
            }
        } finally {
            c.disconnect();
        }
    }

    /** How many game files are kept, and their total size in bytes. */
    long[] stats() {
        long[] total = new long[2];
        count(dir, total);
        return total;
    }

    private static void count(File d, long[] total) {
        File[] kids = d.listFiles();
        if (kids == null) return;
        for (File k : kids) {
            if (k.isDirectory()) {
                count(k, total);
            } else if (!k.getName().endsWith(VERSION_SUFFIX) && !k.getName().endsWith(".part")) {
                total[0]++;
                total[1] += k.length();
            }
        }
    }

    private static String readVersion(File version) {
        if (!version.isFile()) return null;
        try (InputStream in = new FileInputStream(version)) {
            return new String(Updater.readAll(in), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }
}
