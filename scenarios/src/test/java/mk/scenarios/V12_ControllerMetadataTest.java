package mk.scenarios;

import mk.broker.controller.Controller;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v12 — Controller + metadata.
 *
 * Checks:
 *   - leader election bumps the controller epoch
 *   - client-side stale-metadata simulation: a fresh lookup returns the new leader
 */
class V12_ControllerMetadataTest {

    @Test
    void leaderElection_bumpsEpochAndRecordsLeader() {
        Controller c = new Controller();
        int e1 = c.electLeader("t", 0, 1);
        int e2 = c.electLeader("t", 0, 2);
        assertTrue(e2 > e1);
        assertEquals(2, c.leaderOf("t", 0));
    }

    @Test
    void unelectedPartitionReturnsNullLeader() {
        Controller c = new Controller();
        assertNull(c.leaderOf("nope", 0));
    }
}
