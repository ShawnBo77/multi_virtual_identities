import asyncio
import logging

# Define a unified text layout blueprint for timestamps and severity levels
log_formatter = logging.Formatter("%(asctime)s [%(levelname)s] (ForwardProxy) %(message)s")

# File Logger (Persists history metrics inside a local file)
file_handler = logging.FileHandler("proxy_server.log", encoding="utf-8")
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO)

# Console Logger (Prints live tracking packets straight onto the active Terminal)
# console_handler = logging.StreamHandler()
# console_handler.setFormatter(log_formatter)
# console_handler.setLevel(logging.INFO)

# Apply both pipeline handlers globally onto the Root Logger context
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(file_handler)
# logger.addHandler(console_handler)


async def pipe(src_reader: asyncio.StreamReader, dest_writer: asyncio.StreamWriter, description: str):
    """
    Bidirectional streaming pipeline that pumps raw data bytes between source and destination sockets.
    Handles asynchronous data transfers for a single connection side.
    """
    try:
        while True:
            # Read streaming bytes up to 8KB per loop iteration
            chunk = await src_reader.read(8192)
            if not chunk:
                # No more data present, EOF stream detected from source
                break
            dest_writer.write(chunk)
            await dest_writer.drain()

    except (ConnectionResetError, BrokenPipeError, asyncio.CancelledError) as net_err:
        # Standard routine disconnections (e.g., user reloads tab, closes window, or navigates away)
        # Logged as DEBUG to prevent console spamming since this is standard network noise
        logging.debug(f"Standard disconnect noticed during streaming [{description}]: {net_err}")

    except Exception as e:
        # Unexpected fatal network drops or socket level out-of-memory states
        # Prints full stack trace traceback logs onto console for diagnostic tracking
        logging.error(f"CRITICAL failure occurred inside streaming pipe [{description}]: {e}", exc_info=True)

    finally:
        # Synchronously initiate the connection tear-down process
        dest_writer.close()
        try:
            # Asynchronously await the socket resource cleanup and connection release by the OS kernel
            await dest_writer.wait_closed()
        except Exception as close_err:
            # Suppress downstream failures if the pipe was already completely dead
            logging.debug(f"Silent ignore during connection tear-down [{description}]: {close_err}")


async def handle_tunnel(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    """
    Main proxy routing traffic interceptor.
    Parses initial inbound headers and forks logic flows based on HTTP or HTTPS connection methods.
    """
    # Track the inbound browser client source port data details
    client_peer = writer.get_extra_info("peername")

    try:
        # Read the initial request payload up to 4KB to intercept the routing headers
        data = await reader.read(4096)
        if not data:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return

        # Decode byte stream to string characters and isolate the primary start line rule
        line = data.decode("utf-8", errors="ignore").split("\r\n")[0]
        # print("proxy: ", line)
        words = line.split()
        if len(words) < 2:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return

        method, url = words[0], words[1]

        # ----------------------------------------------------------------------
        # HTTPS Encrypted Blind Tunneling (CONNECT Method)
        # ----------------------------------------------------------------------
        if method == "CONNECT":
            host, port = url.split(":")
            port = int(port)

            logging.info(f"Establishing HTTPS Tunnel to -> {host}:{port} (Requested by tab {client_peer})")

            # Initiate a real backend socket outbound connection targeting remote endpoint via host server NIC
            remote_reader, remote_writer = await asyncio.open_connection(host, port)

            # Send standard proxy authentication acknowledgment back to the browser tab
            writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await writer.drain()

        # ----------------------------------------------------------------------
        # Unencrypted HTTP Request Forwarding
        # ----------------------------------------------------------------------
        else:
            if "://" in url:
                url = url.split("://", 1)[1]
            if "/" in url:
                host_port, _ = url.split("/", 1)
            else:
                host_port = url

            if ":" in host_port:
                host, port = host_port.split(":")
                port = int(port)
            else:
                host, port = host_port, 80

            logging.info(f"Forwarding plain HTTP request to -> {host}:{port}")

            # Link connection outward to target HTTP host server
            remote_reader, remote_writer = await asyncio.open_connection(host, port)

            # Re-push the initial read data payload containing headers back into the forwarding stream
            remote_writer.write(data)
            await remote_writer.drain()

        # Concurrent execution launcher for both pipeline directions
        # Forward browser client input requests directly out to remote host destination
        asyncio.create_task(pipe(reader, remote_writer, f"Tab {client_peer} -> {host}:{port}"))

        # Push remote server layout responses back into active browser client tab
        asyncio.create_task(pipe(remote_reader, writer, f"{host}:{port} -> Tab {client_peer}"))

    except asyncio.CancelledError:
        if remote_writer:
            remote_writer.close()
            try:
                await remote_writer.wait_closed()
            except Exception:
                pass
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        raise
    except Exception as main_err:
        # Catches failures inside the handshake phases (e.g., Target Host Server DNS lookup failure or timed out)
        logging.error(f"Handshake connection failure for client {client_peer}: {main_err}", exc_info=True)
        if remote_writer:
            remote_writer.close()
            try:
                await remote_writer.wait_closed()
            except Exception:
                pass
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def start_proxy_server(host: str = "0.0.0.0", port: int = 8888):
    """
    Main service entryway. Spawns the native non-blocking asynchronous TCP server worker loop listener.
    """
    server = await asyncio.start_server(handle_tunnel, host, port)
    logging.info(f"Proxy channel initialized on http://{host}:{port}")

    # Keeps server listening and active indefinitely under managing lifecycle hooks
    async with server:
        await server.serve_forever()
