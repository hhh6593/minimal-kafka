package mk.clients.common;

import com.fasterxml.jackson.databind.JsonNode;
import mk.broker.protocol.Wire;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;

/**
 * Blocking request/response client. Shared by producer and consumer for v1-v3.
 * No connection pooling, no retries, no metadata cache — all arrive in later versions.
 */
public final class WireClient implements AutoCloseable {

    private final Socket socket;
    private final InputStream in;
    private final OutputStream out;

    public WireClient(String host, int port) throws IOException {
        this.socket = new Socket(host, port);
        this.socket.setTcpNoDelay(true);
        this.in = new BufferedInputStream(socket.getInputStream());
        this.out = new BufferedOutputStream(socket.getOutputStream());
    }

    public JsonNode send(JsonNode request) throws IOException {
        Wire.writeFrame(out, request);
        return Wire.readFrame(in);
    }

    @Override
    public void close() throws IOException {
        socket.close();
    }
}
