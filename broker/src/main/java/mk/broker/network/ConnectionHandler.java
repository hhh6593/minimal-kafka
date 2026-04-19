package mk.broker.network;

import com.fasterxml.jackson.databind.JsonNode;
import mk.broker.api.ApiHandler;
import mk.broker.protocol.Wire;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.EOFException;
import java.io.IOException;
import java.nio.channels.SocketChannel;

/**
 * v1 per-connection loop. Blocking I/O, one request at a time on the connection.
 * Real kafka multiplexes pipelined requests per connection; v1 skips that to keep the
 * control flow linear and readable.
 */
public final class ConnectionHandler implements Runnable {

    private static final Logger LOG = LoggerFactory.getLogger(ConnectionHandler.class);

    private final SocketChannel channel;
    private final ApiHandler api;

    public ConnectionHandler(SocketChannel channel, ApiHandler api) {
        this.channel = channel;
        this.api = api;
    }

    @Override
    public void run() {
        String peer = remote();
        LOG.debug("connection opened peer={}", peer);
        try (SocketChannel ch = channel) {
            ch.configureBlocking(true);
            while (ch.isOpen()) {
                JsonNode req;
                try {
                    req = Wire.readFrameBlocking(ch);
                } catch (EOFException eof) {
                    break;
                }
                JsonNode resp = api.handle(req);
                Wire.writeFrameBlocking(ch, resp);
            }
        } catch (IOException io) {
            LOG.debug("connection closed peer={} reason={}", peer, io.toString());
        } finally {
            LOG.debug("connection closed peer={}", peer);
        }
    }

    private String remote() {
        try {
            return String.valueOf(channel.getRemoteAddress());
        } catch (IOException ignored) {
            return "?";
        }
    }
}
