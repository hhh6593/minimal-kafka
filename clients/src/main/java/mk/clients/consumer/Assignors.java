package mk.clients.consumer;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v8 — Minimal partition assignor implementations run by the group leader.
 *
 * Input: for each topic, the number of partitions, and the list of member subscriptions
 * (ordered list of memberIds, each with their subscribed topics).
 *
 * Output: map memberId -> list of "topic:partition" strings.
 *
 * Simplifications vs. real Kafka:
 *   - no rack awareness
 *   - sticky and cooperative-sticky here both preserve the previous assignment by
 *     running a single-pass "keep what you had, give away the rest" pass. Real
 *     cooperative-sticky returns a plan in two rounds (revoke, then assign); we fold it.
 */
public final class Assignors {
    private Assignors() {}

    public static Map<String, List<String>> range(Map<String, Integer> topicPartitionCounts,
                                                  List<String> members,
                                                  Map<String, List<String>> subscriptions) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String m : members) out.put(m, new ArrayList<>());

        for (Map.Entry<String, Integer> e : topicPartitionCounts.entrySet()) {
            String topic = e.getKey();
            int partitions = e.getValue();
            List<String> subs = membersSubscribedTo(topic, members, subscriptions);
            if (subs.isEmpty()) continue;
            int perMember = partitions / subs.size();
            int extra = partitions % subs.size();
            int cursor = 0;
            for (int i = 0; i < subs.size(); i++) {
                int give = perMember + (i < extra ? 1 : 0);
                for (int p = 0; p < give; p++) {
                    out.get(subs.get(i)).add(topic + ":" + (cursor++));
                }
            }
        }
        return out;
    }

    public static Map<String, List<String>> roundRobin(Map<String, Integer> topicPartitionCounts,
                                                       List<String> members,
                                                       Map<String, List<String>> subscriptions) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String m : members) out.put(m, new ArrayList<>());

        List<String> allParts = new ArrayList<>();
        for (Map.Entry<String, Integer> e : topicPartitionCounts.entrySet()) {
            for (int p = 0; p < e.getValue(); p++) allParts.add(e.getKey() + ":" + p);
        }
        int i = 0;
        for (String tp : allParts) {
            String topic = tp.substring(0, tp.lastIndexOf(':'));
            List<String> subs = membersSubscribedTo(topic, members, subscriptions);
            if (subs.isEmpty()) continue;
            out.get(subs.get(i % subs.size())).add(tp);
            i++;
        }
        return out;
    }

    public static Map<String, List<String>> sticky(Map<String, Integer> topicPartitionCounts,
                                                   List<String> members,
                                                   Map<String, List<String>> subscriptions,
                                                   Map<String, List<String>> previous) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String m : members) out.put(m, new ArrayList<>());

        int totalPartitions = 0;
        for (int v : topicPartitionCounts.values()) totalPartitions += v;
        int targetMin = members.isEmpty() ? 0 : totalPartitions / members.size();
        int targetMax = targetMin + (totalPartitions % Math.max(1, members.size()) == 0 ? 0 : 1);

        // seed from previous, but only up to targetMax partitions per member (revoke excess)
        java.util.Set<String> placed = new java.util.HashSet<>();
        java.util.List<String> revoked = new java.util.ArrayList<>();
        if (previous != null) {
            for (Map.Entry<String, List<String>> e : previous.entrySet()) {
                if (!out.containsKey(e.getKey())) continue;
                int kept = 0;
                for (String tp : e.getValue()) {
                    String topic = tp.substring(0, tp.lastIndexOf(':'));
                    int part = Integer.parseInt(tp.substring(tp.lastIndexOf(':') + 1));
                    Integer n = topicPartitionCounts.get(topic);
                    if (n == null || part >= n) continue;
                    if (!subscriptions.getOrDefault(e.getKey(), List.of()).contains(topic)) continue;
                    if (kept < targetMax) {
                        out.get(e.getKey()).add(tp);
                        placed.add(tp);
                        kept++;
                    } else {
                        revoked.add(tp);
                    }
                }
            }
        }

        // remaining partitions = those never placed + revoked
        List<String> remaining = new ArrayList<>(revoked);
        for (Map.Entry<String, Integer> e : topicPartitionCounts.entrySet()) {
            for (int p = 0; p < e.getValue(); p++) {
                String tp = e.getKey() + ":" + p;
                if (!placed.contains(tp) && !remaining.contains(tp)) remaining.add(tp);
            }
        }
        for (String tp : remaining) {
            String topic = tp.substring(0, tp.lastIndexOf(':'));
            String pick = null;
            int pickLoad = Integer.MAX_VALUE;
            for (String m : members) {
                if (!subscriptions.getOrDefault(m, List.of()).contains(topic)) continue;
                int load = out.get(m).size();
                if (load < pickLoad) { pick = m; pickLoad = load; }
            }
            if (pick != null) out.get(pick).add(tp);
        }
        return out;
    }

    private static List<String> membersSubscribedTo(String topic, List<String> members,
                                                    Map<String, List<String>> subscriptions) {
        List<String> out = new ArrayList<>();
        for (String m : members) {
            if (subscriptions.getOrDefault(m, List.of()).contains(topic)) out.add(m);
        }
        return out;
    }
}
