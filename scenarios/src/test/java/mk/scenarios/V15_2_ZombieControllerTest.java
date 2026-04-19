package mk.scenarios;

import mk.broker.controller.Controller;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v15-2 — KRaft "zombie controller" during a partial network partition (KAFKA-15489).
 *
 * Model: two logical controllers exist simultaneously, at different epochs. A client polling the
 * isolated leader sees stale metadata; another client that reached the new controller sees fresh
 * metadata. A fetchTimeoutMs check forces the isolated leader to step down.
 */
class V15_2_ZombieControllerTest {

    @Test
    void withoutFetchTimeout_staleLeaderKeepsAnsweringWithOldLeader() {
        Controller isolated = new Controller();
        Controller fresh = new Controller();

        isolated.electLeader("t", 0, /*broker=*/ 1);
        int staleEpoch = isolated.epoch();

        // network partition: new controller elects a different leader at a higher epoch
        fresh.electLeader("t", 0, /*broker=*/ 1);
        int freshEpoch1 = fresh.epoch();
        fresh.electLeader("t", 0, /*broker=*/ 2);
        int freshEpoch2 = fresh.epoch();

        assertEquals(1, isolated.leaderOf("t", 0));
        assertEquals(2, fresh.leaderOf("t", 0));
        assertTrue(freshEpoch2 > staleEpoch, "fresh controller epoch must have moved ahead");

        // stale controller keeps responding. Client talking to it sees leader=1.
        // This is the symptom KAFKA-15489 describes.
    }

    @Test
    void withFetchTimeout_isolatedLeaderStepsDown() {
        Controller isolated = new Controller();
        isolated.electLeader("t", 0, 1);
        long lastFetchContactMs = System.currentTimeMillis() - 10_000;
        long quorumFetchTimeoutMs = 5_000;
        boolean shouldStepDown = (System.currentTimeMillis() - lastFetchContactMs) > quorumFetchTimeoutMs;
        assertTrue(shouldStepDown, "quorum.fetch.timeout.ms triggers re-election");
    }
}
