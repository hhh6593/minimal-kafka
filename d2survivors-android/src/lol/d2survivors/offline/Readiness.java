package lol.d2survivors.offline;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * How much of each act and hero the kept game files cover, read from the
 * game's own manifests: an act needs its monsters' sprites, its areas'
 * floor tiles and its music; a hero needs its sprite sheets.
 */
final class Readiness {
    static final String[] CLASSES = {"amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"};
    private static final String[] CLASS_NAMES = {"아마존", "어쌔신", "바바리안", "드루이드", "네크로맨서", "팔라딘", "소서리스"};

    private final File dir;

    Readiness(File gameFilesDir) {
        this.dir = gameFilesDir;
    }

    /** A report for people, or null when the manifests are not kept yet. */
    String report() {
        try {
            JSONObject catalog = json("monster-catalog.json");
            JSONObject tiles = json("tiles.json");
            JSONObject audio = json("audio.json");
            JSONObject classes = json("classes.json");
            JSONObject sizes = json("monsters.json");
            if (catalog == null) return null;
            StringBuilder out = new StringBuilder();
            JSONArray acts = catalog.getJSONArray("acts");
            for (int i = 0; i < acts.length(); i++) {
                JSONObject act = acts.getJSONObject(i);
                int n = act.getInt("act");
                int[] have = new int[2];
                for (String sprite : sprites(catalog, act)) monster(sprite, sizes, have);
                if (tiles != null) actTiles(tiles, n, have);
                if (audio != null) music(audio, "act" + n, have);
                out.append(String.format(Locale.ROOT, "%d막  %s\n", n, bar(have)));
            }
            out.append('\n');
            if (classes == null) {
                out.append("직업: 아직 정보 없음 (온라인에서 한 번 플레이하면 표시)\n");
            } else {
                for (int i = 0; i < CLASSES.length; i++) {
                    int[] have = new int[2];
                    JSONObject sheets = classes.optJSONObject(CLASSES[i]);
                    if (sheets != null) files(sheets, have);
                    out.append(String.format(Locale.ROOT, "%s  %s\n", CLASS_NAMES[i], bar(have)));
                }
            }
            return out.toString();
        } catch (IOException | JSONException e) {
            return null;
        }
    }

    private static String bar(int[] have) {
        if (have[1] == 0) return "-";
        int pct = (int) Math.floor(100.0 * have[0] / have[1]);
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 10; i++) b.append(i < pct / 10 ? '■' : '□');
        return b + " " + pct + "%";
    }

    /** The sprites an act shows: its monsters, its boss and its named monsters. */
    private static Set<String> sprites(JSONObject catalog, JSONObject act) throws JSONException {
        JSONObject all = catalog.optJSONObject("monsters");
        Set<String> out = new LinkedHashSet<>();
        JSONArray monsters = act.getJSONArray("monsters");
        for (int i = 0; i < monsters.length(); i++) out.add(monsters.getJSONObject(i).getString("sprite"));
        addSprite(all, act.opt("boss"), out);
        for (String key : new String[]{"superUniques", "uniques"}) {
            JSONArray list = act.optJSONArray(key);
            if (list != null) for (int i = 0; i < list.length(); i++) addSprite(all, list.opt(i), out);
        }
        return out;
    }

    private static void addSprite(JSONObject all, Object ref, Set<String> out) {
        if (ref instanceof JSONObject) {
            JSONObject o = (JSONObject) ref;
            if (o.has("sprite")) {
                out.add(o.optString("sprite"));
                return;
            }
            ref = o.optString("id", o.optString("base", null));
        }
        if (ref instanceof String && all != null) {
            JSONObject m = all.optJSONObject((String) ref);
            if (m != null && m.has("sprite")) out.add(m.optString("sprite"));
        }
    }

    /**
     * One count per page of the sprite's sheets. A sprite never shown has no sheet list yet;
     * it counts as one missing page per animation the game lists for it in monsters.json.
     */
    private void monster(String sprite, JSONObject sizes, int[] have) throws IOException, JSONException {
        JSONObject sheets = json("sprites/monsters/" + sprite + ".json");
        if (sheets == null) {
            JSONObject modes = sizes == null ? null : sizes.optJSONObject(sprite);
            have[1] += modes != null && modes.length() > 0 ? modes.length() : 1;
            return;
        }
        files(sheets, have);
    }

    /** Counts the image files a sheet manifest names ("file", "shadow" or "pages"). */
    private void files(JSONObject sheets, int[] have) {
        Iterator<String> modes = sheets.keys();
        while (modes.hasNext()) {
            JSONObject sheet = sheets.optJSONObject(modes.next());
            if (sheet == null) continue;
            JSONArray pages = sheet.optJSONArray("pages");
            if (pages != null) for (int i = 0; i < pages.length(); i++) count(pages.optString(i), have);
            if (sheet.has("file")) count(sheet.optString("file"), have);
            if (sheet.has("shadow")) count(sheet.optString("shadow"), have);
        }
    }

    private void actTiles(JSONObject tiles, int act, int[] have) throws JSONException {
        JSONObject areas = tiles.getJSONObject("areas");
        Iterator<String> names = areas.keys();
        while (names.hasNext()) {
            JSONObject area = areas.getJSONObject(names.next());
            if (area.optString("levelType").startsWith("Act " + act + " ")) count(area.optString("file"), have);
        }
    }

    private void music(JSONObject audio, String track, int[] have) {
        JSONObject music = audio.optJSONObject("music");
        JSONObject t = music == null ? null : music.optJSONObject(track);
        if (t != null) count(t.optString("file"), have);
    }

    private void count(String file, int[] have) {
        if (file == null || file.isEmpty()) return;
        have[1]++;
        if (new File(dir, file).isFile()) have[0]++;
    }

    private JSONObject json(String rel) throws IOException, JSONException {
        File f = new File(dir, rel);
        if (!f.isFile()) return null;
        try (InputStream in = new FileInputStream(f)) {
            return new JSONObject(new String(Updater.readAll(in), StandardCharsets.UTF_8));
        }
    }
}
