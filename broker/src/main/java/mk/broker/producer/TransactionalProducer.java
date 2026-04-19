package mk.broker.producer;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * v15-1 zombie transactional producer simulator (KIP-890 context).
 *
 * Pre-4.0 behavior: epoch is bumped only on producer re-init, not on every commit/abort.
 * Modeled via {@link #bumpEpochOnCommit} toggle (default true = KIP-890 fix ON).
 *
 * "Zombie write" here = a delayed {@link #send} arriving after the transaction it belonged to
 * was already committed. With the fix, such a send is fenced because its epoch is stale.
 */
public final class TransactionalProducer {

    public enum TxnState { EMPTY, IN_TRANSACTION, COMMIT_IN_PROGRESS, ABORT_IN_PROGRESS, COMMITTED, ABORTED }

    public static final class State {
        public long pid;
        public int  epoch;
        public TxnState txnState = TxnState.EMPTY;
        public final Map<String, Integer> sentPerPartition = new HashMap<>();
    }

    public boolean bumpEpochOnCommit = true;

    private final Map<Long, State> byPid = new ConcurrentHashMap<>();
    private long nextPid = 9_000;

    public synchronized State initProducerId() {
        State s = new State();
        s.pid = ++nextPid;
        s.epoch = 0;
        byPid.put(s.pid, s);
        return s;
    }

    public synchronized void beginTxn(State s) {
        s.txnState = TxnState.IN_TRANSACTION;
        s.sentPerPartition.clear();
    }

    /** @return true if the send is accepted, false if fenced. */
    public synchronized boolean send(State s, int senderEpoch, String topic, int partition) {
        if (senderEpoch != s.epoch) return false; // fenced
        s.sentPerPartition.merge(topic + ":" + partition, 1, Integer::sum);
        return s.txnState == TxnState.IN_TRANSACTION;
    }

    public synchronized void commit(State s) {
        s.txnState = TxnState.COMMITTED;
        if (bumpEpochOnCommit) s.epoch++;
    }

    public synchronized void abort(State s) {
        s.txnState = TxnState.ABORTED;
        if (bumpEpochOnCommit) s.epoch++;
    }
}
