package mk.broker.network;

import mk.broker.api.ApiHandler;
import mk.broker.config.KafkaConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * v1 acceptor: blocking accept loop, dispatches each connection to a fixed IO thread pool.
 *
 * Real kafka separates network threads (read/write bytes, no business logic) from IO threads
 * (execute API handlers). v1 merges both into one pool to keep the picture simple.
 */
public final class Acceptor implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(Acceptor.class);

    private final KafkaConfig config;
    private final ApiHandler api;
    private final AtomicBoolean running = new AtomicBoolean(false);

    private ServerSocketChannel server;
    private ExecutorService acceptLoop;
    private ExecutorService ioPool;
    private int boundPort = -1;

    public Acceptor(KafkaConfig config, ApiHandler api) {
        this.config = config;
        this.api = api;
    }

    public void start() throws IOException {
        if (!running.compareAndSet(false, true)) throw new IllegalStateException("already started");
        server = ServerSocketChannel.open();
        server.socket().setReuseAddress(true);
        server.bind(new InetSocketAddress(config.host(), config.port()));
        boundPort = server.socket().getLocalPort();
        server.configureBlocking(true);

        ioPool = Executors.newFixedThreadPool(config.numIoThreads(), namedFactory("mk-io"));
        acceptLoop = Executors.newSingleThreadExecutor(namedFactory("mk-acceptor"));
        acceptLoop.submit(this::loop);

        LOG.info("broker listening on {}:{} (brokerId={})", config.host(), boundPort, config.brokerId());
    }

    public int boundPort() {
        return boundPort;
    }

    private void loop() {
        while (running.get()) {
            try {
                SocketChannel ch = server.accept();
                ioPool.submit(new ConnectionHandler(ch, api));
            } catch (IOException e) {
                if (running.get()) LOG.warn("accept failed", e);
                return;
            }
        }
    }

    @Override
    public void close() {
        if (!running.compareAndSet(true, false)) return;
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        if (acceptLoop != null) acceptLoop.shutdownNow();
        if (ioPool != null) ioPool.shutdownNow();
        LOG.info("broker stopped");
    }

    private static java.util.concurrent.ThreadFactory namedFactory(String prefix) {
        return r -> {
            Thread t = new Thread(r);
            t.setName(prefix + "-" + t.getId());
            t.setDaemon(true);
            return t;
        };
    }
}
