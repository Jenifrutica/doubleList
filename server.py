import json
import os
import posixpath
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from core.pathway import NeuralPathway
from core.conduction import Simulator

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")

LOCK = threading.Lock()

insert_counter = {"value": 0}


def classify(neuron):
    if neuron.refractory > 0:
        return "recovering"
    if neuron.potential > -55.0:
        return "excited"
    if neuron.potential < -75.0:
        return "inhibited"
    return "resting"


def build_pathway():
    pathway = NeuralPathway()
    pathway.append("Ia afferent", -70.0, True)
    pathway.append("Interneuron", -70.0, False)
    pathway.append("Motor neuron α", -70.0, True)
    pathway.append("Renshaw cell", -70.0, False)
    pathway.append("Motor unit", -70.0, True)
    pathway.cursor = pathway.head
    return pathway


pathway = build_pathway()
simulator = Simulator(pathway)
simulator.record("Plate prepared: a five-neuron monosynaptic reflex arc. head.prev is null, tail.next is null.")


def snapshot():
    neurons = pathway.traverse()
    registry = []
    cursor_index = -1
    position = 0
    myelinated_count = 0
    for neuron in neurons:
        if neuron is pathway.cursor:
            cursor_index = position
        if neuron.myelinated:
            myelinated_count += 1
        registry.append({
            "uid": neuron.uid,
            "name": neuron.name,
            "potential": round(neuron.potential, 1),
            "myelinated": neuron.myelinated,
            "refractory": neuron.refractory,
            "state": classify(neuron),
        })
        position += 1
    cursor = pathway.cursor
    metrics = {
        "length": pathway.length,
        "cursor_index": cursor_index,
        "cursor_uid": cursor.uid if cursor else None,
        "cursor_name": cursor.name if cursor else None,
        "potential": round(cursor.potential, 1) if cursor else None,
        "myelinated_count": myelinated_count,
        "velocity": simulator.velocity(cursor),
        "total_delay": round(simulator.total_delay, 2),
        "last_run": simulator.last_run,
        "last_direction": simulator.last_direction,
        "circular": pathway.circular,
    }
    return {
        "neurons": registry,
        "metrics": metrics,
        "log": simulator.log[-12:],
        "tick": simulator.tick,
    }


def next_name():
    insert_counter["value"] += 1
    return "Neuron %d" % insert_counter["value"]


def find_uid(uid):
    try:
        wanted = int(uid)
    except (TypeError, ValueError):
        return None
    for neuron in pathway.traverse():
        if neuron.uid == wanted:
            return neuron
    return None


def apply_operation(op, payload):
    global pathway, simulator
    cursor = pathway.cursor
    if op == "move":
        direction = int(payload.get("direction", 1))
        if direction >= 0:
            pathway.step_forward()
        else:
            pathway.step_backward()
        simulator.record("Cursor moved %s to %s."
                         % ("forward" if direction >= 0 else "backward",
                            pathway.cursor.name if pathway.cursor else "—"))
    elif op == "focus":
        if "uid" in payload:
            for neuron in pathway.traverse():
                if neuron.uid == int(payload["uid"]):
                    pathway.focus(neuron)
                    break
        elif "index" in payload:
            pathway.focus(pathway.at(int(payload["index"])))
    elif op == "append":
        neuron = pathway.append(payload.get("name") or next_name())
        pathway.focus(neuron)
        simulator.record("Appended %s at the tail (%s.next rewired from None)."
                         % (neuron.name, pathway.tail.name if pathway.tail else "—"))
    elif op == "prepend":
        neuron = pathway.prepend(payload.get("name") or next_name())
        simulator.record("Prepended %s at the head." % neuron.name)
    elif op == "insert_before":
        if cursor is not None:
            neuron = pathway.insert_before(cursor, payload.get("name") or next_name())
            pathway.focus(neuron)
            simulator.record("Inserted %s before %s; two pointers rewritten."
                             % (neuron.name, cursor.name))
    elif op == "insert_after":
        if cursor is not None:
            neuron = pathway.insert_after(cursor, payload.get("name") or next_name())
            pathway.focus(neuron)
            simulator.record("Inserted %s after %s; two pointers rewritten."
                             % (neuron.name, cursor.name))
    elif op in ("delete", "lesion"):
        if cursor is not None:
            name = cursor.name
            pathway.remove(cursor)
            simulator.record("Lesioned %s; neighbouring pointers rejoined." % name)
    elif op == "toggle_myelin":
        if cursor is not None:
            cursor.myelinated = not cursor.myelinated
            simulator.record("%s myelin sheath %s."
                             % (cursor.name,
                                "formed" if cursor.myelinated else "removed"))
    elif op == "excite":
        if cursor is not None:
            cursor.potential = -50.0
            simulator.record("%s depolarised to threshold." % cursor.name)
    elif op == "inhibit":
        if cursor is not None:
            cursor.potential = -80.0
            simulator.record("%s hyperpolarised; firing suppressed." % cursor.name)
    elif op == "create":
        name = (payload.get("name") or "").strip() or next_name()
        position = payload.get("position", "end")
        if position == "before" and cursor is not None:
            neuron = pathway.insert_before(cursor, name)
        elif position == "after" and cursor is not None:
            neuron = pathway.insert_after(cursor, name)
        elif position == "start":
            neuron = pathway.prepend(name)
        else:
            neuron = pathway.append(name)
        pathway.focus(neuron)
        simulator.record("Neuron “%s” created." % neuron.name)
    elif op == "rename":
        target = find_uid(payload.get("uid"))
        name = (payload.get("name") or "").strip()
        if target is not None and name:
            previous = target.name
            pathway.rename(target, name)
            simulator.record("“%s” renamed to “%s”." % (previous, target.name))
    elif op == "reorder":
        target = find_uid(payload.get("uid"))
        if target is not None:
            to_index = int(payload.get("to_index", 0))
            pathway.move(target, to_index)
            simulator.record("“%s” dragged to position %d." % (target.name, to_index + 1))
    elif op == "reverse":
        pathway.reverse()
        simulator.record("Whole pathway reversed: every prev/next pair swapped.")
    elif op == "circle":
        value = payload.get("value")
        if value is None:
            value = not pathway.circular
        pathway.set_circular(bool(value))
        simulator.record("Reflex arc %s; head and tail %s."
                         % ("closed" if pathway.circular else "opened",
                            "linked" if pathway.circular else "unlinked"))
    elif op == "fire":
        direction = int(payload.get("direction", 1))
        steps = payload.get("steps")
        simulator.fire(direction, int(steps) if steps else None)
    elif op == "rest":
        simulator.rest()
    elif op == "reset":
        pathway = build_pathway()
        simulator = Simulator(pathway)
        insert_counter["value"] = 0
        simulator.record("Plate reset to the monosynaptic reflex arc.")
    return snapshot()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        if not os.path.isfile(path):
            self.send_error(404, "Not found")
            return
        extension = os.path.splitext(path)[1].lower()
        types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".woff2": "font/woff2",
            ".svg": "image/svg+xml",
            ".json": "application/json; charset=utf-8",
        }
        with open(path, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", types.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        if route == "/api/state":
            with LOCK:
                self._send_json(snapshot())
            return
        if route == "/" or route == "/index.html":
            self._send_file(os.path.join(WEB_DIR, "index.html"))
            return
        safe = posixpath.normpath(route).lstrip("/")
        candidate = os.path.join(WEB_DIR, safe)
        if os.path.commonpath([os.path.abspath(candidate), WEB_DIR]) != WEB_DIR:
            self.send_error(403, "Forbidden")
            return
        self._send_file(candidate)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/op":
            self.send_error(404, "Not found")
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except ValueError:
            self._send_json({"error": "invalid json"}, 400)
            return
        op = payload.get("op", "")
        with LOCK:
            state = apply_operation(op, payload)
        self._send_json(state)


def main():
    base_port = int(os.environ.get("NODUS_PORT", "8765"))
    server = None
    port = base_port
    for attempt in range(20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            port = base_port + attempt + 1
    if server is None:
        raise SystemExit("No free port found near %d. Set NODUS_PORT." % base_port)
    if port != base_port:
        print("Port %d was busy; using %d instead." % (base_port, port))
    print("NODUS — open http://127.0.0.1:%d" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
