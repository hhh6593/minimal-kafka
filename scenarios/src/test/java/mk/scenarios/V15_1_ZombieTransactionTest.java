package mk.scenarios;

import mk.broker.producer.TransactionalProducer;
import mk.broker.producer.TransactionalProducer.State;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v15-1 — Zombie transactional producer (pre-KIP-890 vs with-fix).
 *
 * Background: KIP-890 bumps the producer epoch on every transaction commit/abort. Without the
 * bump, a delayed send from an already-committed transaction can be accepted by the broker with
 * the same PID+epoch, silently writing extra records into the next transaction.
 *
 * Sources referenced in docs/ROADMAP.md:
 *   KIP-890, KAFKA-14402.
 */
class V15_1_ZombieTransactionTest {

    @Test
    void preKIP890_zombieSendAcceptedAfterCommit() {
        TransactionalProducer tp = new TransactionalProducer();
        tp.bumpEpochOnCommit = false; // simulate pre-4.0 behavior
        State s = tp.initProducerId();

        tp.beginTxn(s);
        int delayedSenderEpoch = s.epoch;
        tp.commit(s);

        // delayed send from txn 1 arrives AFTER commit; epoch unchanged → not fenced
        boolean accepted = tp.send(s, delayedSenderEpoch, "t", 0);
        assertFalse(accepted, "send outside an in-progress txn should fail state check");
        // but the epoch check passed — KIP-890 pre-fix: the side-effect (seq bump) happens
        assertEquals(1, s.sentPerPartition.getOrDefault("t:0", 0));
    }

    @Test
    void withKIP890_zombieSendFencedByEpochBump() {
        TransactionalProducer tp = new TransactionalProducer();
        tp.bumpEpochOnCommit = true; // KIP-890 behavior
        State s = tp.initProducerId();

        tp.beginTxn(s);
        int delayedSenderEpoch = s.epoch;
        tp.commit(s);

        boolean accepted = tp.send(s, delayedSenderEpoch, "t", 0);
        assertFalse(accepted, "epoch bumped on commit — zombie send is fenced");
        assertEquals(0, s.sentPerPartition.getOrDefault("t:0", 0),
                "no partition side-effects from a fenced send");
    }
}
