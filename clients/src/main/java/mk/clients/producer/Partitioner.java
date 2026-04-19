package mk.clients.producer;

/**
 * v3+ partitioner interface. The record's partition field overrides this.
 *
 * - {@link Hash}: Kafka's legacy murmur2-style keyed partitioning analogue (uses {@code Arrays.hashCode}).
 * - {@link RoundRobin}: used when key is null.
 * - {@link Sticky}: Kafka's sticky partitioner approximation — stays on one partition until
 *   the next rotate() call (scenarios manipulate directly).
 */
public interface Partitioner {
    int partition(String topic, byte[] key, byte[] value, int partitionCount);

    final class Hash implements Partitioner {
        public int partition(String t, byte[] k, byte[] v, int n) {
            if (k == null) return 0;
            int h = java.util.Arrays.hashCode(k);
            return Math.floorMod(h, n);
        }
    }

    final class RoundRobin implements Partitioner {
        private int next = 0;
        public int partition(String t, byte[] k, byte[] v, int n) {
            int p = Math.floorMod(next, n);
            next++;
            return p;
        }
    }

    final class Sticky implements Partitioner {
        private int sticky = 0;
        public int partition(String t, byte[] k, byte[] v, int n) {
            return Math.floorMod(sticky, Math.max(1, n));
        }
        public void rotate(int n) { sticky = (sticky + 1) % Math.max(1, n); }
    }

    /**
     * Kafka 2.4+ default: key → hash, null key → sticky.
     */
    final class Default implements Partitioner {
        private final Hash hash = new Hash();
        private final Sticky sticky = new Sticky();
        public int partition(String t, byte[] k, byte[] v, int n) {
            return k != null ? hash.partition(t, k, v, n) : sticky.partition(t, k, v, n);
        }
    }
}
