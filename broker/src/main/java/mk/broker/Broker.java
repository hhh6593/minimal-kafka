package mk.broker;

import mk.broker.api.ApiHandler;
import mk.broker.config.KafkaConfig;
import mk.broker.log.LogManager;
import mk.broker.network.Acceptor;

import java.io.IOException;

/** Broker facade. Wires log manager + api handler + network acceptor. */
public final class Broker implements AutoCloseable {

    private final KafkaConfig config;
    private final LogManager logs;
    private final ApiHandler api;
    private final Acceptor acceptor;

    public Broker(KafkaConfig config) {
        this.config = config;
        this.logs = new LogManager(config.logConfig());
        this.api = new ApiHandler(logs);
        this.acceptor = new Acceptor(config, api);
    }

    public void start() throws IOException {
        acceptor.start();
    }

    public int boundPort() { return acceptor.boundPort(); }
    public KafkaConfig config() { return config; }
    public LogManager logs() { return logs; }
    public ApiHandler api() { return api; }

    @Override
    public void close() {
        acceptor.close();
        logs.close();
    }

    /** v2 scenario hook: SIGKILL-like unclean shutdown. */
    public void kill() {
        acceptor.close();
        logs.uncleanClose();
    }
}
