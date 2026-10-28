package lol.d2survivors.offline;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * How much of each act and hero the kept game files cover, read from the
 * game's own manifests: an act needs its monsters' sprites, its areas'
 * floor tiles and its music; for a hero it counts the gear sheets kept.
 */
final class Readiness {
    // The animations the game loads for monsters (df in the site's code); it never fetches the rest.
    private static final Set<String> MONSTER_MODES = new HashSet<>(Arrays.asList("NU", "WL", "A1", "S1", "DT"));
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
            // A hero is drawn from gear sheets, one per part, look, animation and weapon class:
            // over a thousand a hero, most never worn, so a count says more than a share.
            out.append("직업별 저장된 외형 조각\n");
            for (int i = 0; i < CLASSES.length; i++) {
                String[] kept = new File(dir, "sprites/gear/" + CLASSES[i]).list();
                int n = 0;
                if (kept != null) for (String k : kept) if (k.endsWith(".bin")) n++;
                out.append(String.format(Locale.ROOT, "%s  %d개\n", CLASS_NAMES[i], n));
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
     * One count per page of the sprite's sheets, for the animations the game loads. A sprite never
     * shown has no sheet list yet; it counts as one missing page per such animation in monsters.json.
     */
    private void monster(String sprite, JSONObject sizes, int[] have) throws IOException, JSONException {
        JSONObject sheets = json("sprites/monsters/" + sprite + ".json");
        if (sheets == null) {
            JSONObject modes = sizes == null ? null : sizes.optJSONObject(sprite);
            int n = 0;
            if (modes != null) for (Iterator<String> it = modes.keys(); it.hasNext(); ) if (MONSTER_MODES.contains(it.next())) n++;
            have[1] += Math.max(1, n);
            return;
        }
        Iterator<String> modes = sheets.keys();
        while (modes.hasNext()) {
            String mode = modes.next();
            if (!MONSTER_MODES.contains(mode)) continue;
            JSONObject sheet = sheets.optJSONObject(mode);
            JSONArray pages = sheet == null ? null : sheet.optJSONArray("pages");
            if (pages != null) for (int i = 0; i < pages.length(); i++) count(pages.optString(i), have);
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
