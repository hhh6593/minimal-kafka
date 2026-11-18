package local.baramsurvivors;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;

/**
 * Background music played natively, without asking Android for audio focus.
 *
 * In the WebView an <audio> element takes the audio focus when it plays, so a YouTube video
 * watched in picture-in-picture beside the game stopped when the game's music started, and the
 * game's music stopped when the video was resumed. A MediaPlayer that never requests focus
 * mixes with the other app instead (sound effects already go through Web Audio, which takes
 * no focus). The music comes from the game's own local server, like everything else.
 */
public class NativeMusic {
    private static final String TAG = "NativeMusic";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final String base;
    private MediaPlayer player;
    private String url;
    private float volume = 0.5f;
    private boolean wanted; // the game wants it playing
    private boolean ready;
    private boolean held;   // the app is in the background

    NativeMusic(String base) {
        this.base = base;
    }

    @JavascriptInterface
    public void play(final String path, final float vol) {
        main.post(() -> {
            volume = vol;
            wanted = true;
            String u = base + path;
            if (player != null && u.equals(url)) {
                player.setVolume(volume, volume);
                if (ready && !held && !player.isPlaying()) player.start();
                return;
            }
            release();
            url = u;
            ready = false;
            try {
                MediaPlayer p = new MediaPlayer();
                p.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_GAME)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                p.setLooping(true);
                p.setDataSource(u);
                p.setOnPreparedListener(mp -> {
                    if (mp != player) return;
                    ready = true;
                    mp.setVolume(volume, volume);
                    if (wanted && !held) mp.start();
                });
                p.setOnErrorListener((mp, what, extra) -> {
                    Log.w(TAG, "music error " + what + "/" + extra + " " + url);
                    return true;
                });
                player = p;
                p.prepareAsync();
            } catch (Exception e) {
                Log.w(TAG, "cannot play " + u, e);
                release();
            }
        });
    }

    @JavascriptInterface
    public void pause() {
        main.post(() -> {
            wanted = false;
            if (player != null && ready && player.isPlaying()) player.pause();
        });
    }

    @JavascriptInterface
    public void stop() {
        main.post(() -> {
            wanted = false;
            release();
        });
    }

    @JavascriptInterface
    public void setVolume(final float vol) {
        main.post(() -> {
            volume = vol;
            if (player != null && ready) player.setVolume(volume, volume);
        });
    }

    /** The activity left or came back to the screen. */
    void hold(boolean on) {
        held = on;
        if (player == null || !ready) return;
        if (on && player.isPlaying()) player.pause();
        else if (!on && wanted && !player.isPlaying()) player.start();
    }

    void release() {
        if (player != null) {
            try { player.release(); } catch (Exception ignored) { }
        }
        player = null;
        url = null;
        ready = false;
    }
}
