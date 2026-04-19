package mk.scenarios;

import mk.clients.consumer.Assignors;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v8 — Compare partition assignors.
 *
 * Each test inputs the same (topics, members, subscriptions) and checks how Range / RoundRobin /
 * Sticky differ.
 *
 * Takeaways:
 *   - Range can produce heavy skew when the partition count is not divisible by the member count.
 *   - RoundRobin spreads more evenly across topics.
 *   - Sticky preserves existing assignments, minimizing work on rebalance.
 */
class V08_AssignorsTest {

    @Test
    void rangeAssignor_concentratesSkewOnEarlyMembers() {
        Map<String, Integer> topics = Map.of("t1", 7);
        List<String> members = List.of("c1", "c2", "c3");
        Map<String, List<String>> subs = Map.of(
                "c1", List.of("t1"), "c2", List.of("t1"), "c3", List.of("t1"));

        Map<String, List<String>> plan = Assignors.range(topics, members, subs);
        // 7 = 2*3 + 1 — first member gets the extra
        assertEquals(3, plan.get("c1").size());
        assertEquals(2, plan.get("c2").size());
        assertEquals(2, plan.get("c3").size());
    }

    @Test
    void roundRobin_spreadsAcrossTopicsEvenly() {
        Map<String, Integer> topics = Map.of("t1", 3, "t2", 3);
        List<String> members = List.of("c1", "c2", "c3");
        Map<String, List<String>> subs = Map.of(
                "c1", List.of("t1", "t2"), "c2", List.of("t1", "t2"), "c3", List.of("t1", "t2"));

        Map<String, List<String>> plan = Assignors.roundRobin(topics, members, subs);
        for (List<String> v : plan.values()) assertEquals(2, v.size());
    }

    @Test
    void sticky_preservesPreviousAssignmentWhenMemberRejoins() {
        Map<String, Integer> topics = Map.of("t1", 6);
        List<String> members = List.of("c1", "c2", "c3");
        Map<String, List<String>> subs = Map.of(
                "c1", List.of("t1"), "c2", List.of("t1"), "c3", List.of("t1"));

        Map<String, List<String>> first = Assignors.sticky(topics, members, subs, null);
        // remove c2, then re-add
        Map<String, List<String>> afterRemove = Assignors.sticky(topics, List.of("c1", "c3"), Map.of(
                "c1", List.of("t1"), "c3", List.of("t1")), first);
        Map<String, List<String>> afterReadd = Assignors.sticky(topics, members, subs, afterRemove);

        // c1's assignment after c2 leaves then rejoins should substantially preserve prior plan
        long keptByC1 = first.get("c1").stream().filter(afterReadd.get("c1")::contains).count();
        assertTrue(keptByC1 >= 1, "sticky should retain at least part of prior plan");
    }

    @Test
    void sticky_fillsNewMemberByRobbingLeastNeeded() {
        Map<String, Integer> topics = Map.of("t1", 6);
        Map<String, List<String>> initial = Map.of(
                "c1", List.of("t1:0", "t1:1", "t1:2"),
                "c2", List.of("t1:3", "t1:4", "t1:5"));

        List<String> afterJoin = List.of("c1", "c2", "c3");
        Map<String, List<String>> subs = Map.of(
                "c1", List.of("t1"), "c2", List.of("t1"), "c3", List.of("t1"));

        Map<String, List<String>> plan = Assignors.sticky(topics, afterJoin, subs, initial);
        assertEquals(2, plan.get("c1").size());
        assertEquals(2, plan.get("c2").size());
        assertEquals(2, plan.get("c3").size());
    }
}
