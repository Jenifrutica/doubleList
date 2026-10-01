REFRACTORY_TICKS = 2
SALTATORY_VELOCITY = 120.0
CONTINUOUS_VELOCITY = 2.0


class Simulator:
    def __init__(self, pathway):
        self.pathway = pathway
        self.log = []
        self.tick = 0
        self.total_delay = 0.0
        self.last_run = []
        self.last_direction = 1

    def record(self, text):
        self.tick += 1
        self.log.append({"tick": self.tick, "text": text})
        while len(self.log) > 80:
            del self.log[0]

    def decay(self):
        for neuron in self.pathway.traverse():
            if neuron.refractory > 0:
                neuron.refractory -= 1

    def velocity(self, neuron):
        if neuron is not None and neuron.myelinated:
            return SALTATORY_VELOCITY
        return CONTINUOUS_VELOCITY

    def fire(self, direction=1, steps=None):
        pathway = self.pathway
        start = pathway.cursor
        if start is None:
            return []
        self.decay()
        limit = pathway.length if steps is None or steps <= 0 else min(steps, pathway.length)
        visited = []
        current = start
        amplitude = 1.0
        delay = 0.0
        count = 0
        while current is not None and count < limit:
            visited.append(current)
            delay += 0.15 if current.myelinated else 0.75
            amplitude *= 0.94
            count += 1
            if amplitude < 0.06:
                break
            follower = current.next if direction >= 0 else current.prev
            if follower is None or follower is start:
                break
            current = follower
        for node in visited:
            node.refractory = REFRACTORY_TICKS
        self.total_delay += delay
        self.last_run = [node.uid for node in visited]
        self.last_direction = 1 if direction >= 0 else -1
        heading = "orthodromic" if direction >= 0 else "antidromic"
        self.record(
            "Action potential fired %s through %d neuron(s); total delay %.2f ms."
            % (heading, len(visited), delay)
        )
        return self.last_run

    def rest(self):
        self.decay()
        self.record("Pathway at rest; membranes recovering.")

    def reset_metrics(self):
        self.total_delay = 0.0
        self.last_run = []
        self.log = []
        self.tick = 0
