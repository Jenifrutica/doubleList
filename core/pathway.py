class Neuron:
    def __init__(self, uid, name, potential=-70.0, myelinated=False):
        self.uid = uid
        self.name = name
        self.potential = potential
        self.myelinated = myelinated
        self.refractory = 0
        self.prev = None
        self.next = None


class NeuralPathway:
    def __init__(self):
        self.head = None
        self.tail = None
        self.cursor = None
        self.length = 0
        self.circular = False
        self._next_uid = 1

    def _spawn(self, name, potential, myelinated):
        neuron = Neuron(self._next_uid, name, potential, myelinated)
        self._next_uid += 1
        return neuron

    def _join_ends(self):
        if self.head is None:
            return
        if self.circular:
            self.head.prev = self.tail
            self.tail.next = self.head
        else:
            self.head.prev = None
            self.tail.next = None

    def append(self, name, potential=-70.0, myelinated=False):
        neuron = self._spawn(name, potential, myelinated)
        if self.head is None:
            self.head = neuron
            self.tail = neuron
            self.cursor = neuron
        else:
            neuron.prev = self.tail
            self.tail.next = neuron
            self.tail = neuron
        self.length += 1
        self._join_ends()
        return neuron

    def prepend(self, name, potential=-70.0, myelinated=False):
        neuron = self._spawn(name, potential, myelinated)
        if self.head is None:
            self.head = neuron
            self.tail = neuron
            self.cursor = neuron
        else:
            neuron.next = self.head
            self.head.prev = neuron
            self.head = neuron
        self.length += 1
        self._join_ends()
        return neuron

    def insert_after(self, anchor, name, potential=-70.0, myelinated=False):
        if anchor is None:
            return self.append(name, potential, myelinated)
        neuron = self._spawn(name, potential, myelinated)
        follower = anchor.next
        neuron.prev = anchor
        neuron.next = follower
        anchor.next = neuron
        if follower is not None:
            follower.prev = neuron
        else:
            self.tail = neuron
        self.length += 1
        self._join_ends()
        return neuron

    def insert_before(self, anchor, name, potential=-70.0, myelinated=False):
        if anchor is None:
            return self.append(name, potential, myelinated)
        if anchor.prev is None or anchor is self.head:
            return self.prepend(name, potential, myelinated)
        return self.insert_after(anchor.prev, name, potential, myelinated)

    def _attach_head(self, neuron):
        if self.head is None:
            self.head = neuron
            self.tail = neuron
            self.cursor = neuron
        else:
            neuron.next = self.head
            self.head.prev = neuron
            self.head = neuron
        self.length += 1
        self._join_ends()

    def _attach_after(self, neuron, anchor):
        follower = anchor.next
        neuron.prev = anchor
        neuron.next = follower
        anchor.next = neuron
        if follower is not None:
            follower.prev = neuron
        else:
            self.tail = neuron
        self.length += 1
        self._join_ends()

    def insert_at(self, index, name, potential=-70.0, myelinated=False):
        if self.head is None or index <= 0:
            return self.prepend(name, potential, myelinated)
        anchor = self.at(index - 1)
        if anchor is None:
            return self.append(name, potential, myelinated)
        return self.insert_after(anchor, name, potential, myelinated)

    def move(self, neuron, to_index):
        if neuron is None or self.length <= 1:
            return neuron
        current_index = self.index_of(neuron)
        if current_index < 0:
            return neuron
        target = max(0, min(int(to_index), self.length - 1))
        if target == current_index:
            return neuron
        predecessor = neuron.prev
        follower = neuron.next
        if predecessor is not None:
            predecessor.next = follower
        if follower is not None:
            follower.prev = predecessor
        if neuron is self.head:
            self.head = follower
        if neuron is self.tail:
            self.tail = predecessor
        neuron.prev = None
        neuron.next = None
        self.length -= 1
        self._join_ends()
        if target <= 0:
            self._attach_head(neuron)
        else:
            anchor = self.at(target - 1)
            if anchor is None:
                anchor = self.tail
            self._attach_after(neuron, anchor)
        return neuron

    def rename(self, neuron, name):
        clean = (name or "").strip()
        if neuron is not None and clean:
            neuron.name = clean[:48]
        return neuron

    def remove(self, neuron):
        if neuron is None or self.length == 0:
            return None
        if self.length == 1:
            self.head = None
            self.tail = None
            self.cursor = None
            self.length = 0
            neuron.prev = None
            neuron.next = None
            return neuron
        predecessor = neuron.prev
        follower = neuron.next
        if predecessor is not None:
            predecessor.next = follower
        if follower is not None:
            follower.prev = predecessor
        if neuron is self.head:
            self.head = follower
        if neuron is self.tail:
            self.tail = predecessor
        if neuron is self.cursor:
            self.cursor = follower if follower is not None else predecessor
        neuron.prev = None
        neuron.next = None
        self.length -= 1
        self._join_ends()
        return neuron

    def step_forward(self):
        if self.cursor is None:
            return None
        if self.cursor.next is not None:
            self.cursor = self.cursor.next
        return self.cursor

    def step_backward(self):
        if self.cursor is None:
            return None
        if self.cursor.prev is not None:
            self.cursor = self.cursor.prev
        return self.cursor

    def focus(self, neuron):
        self.cursor = neuron
        return self.cursor

    def find(self, name):
        for neuron in self.traverse():
            if neuron.name == name:
                return neuron
        return None

    def traverse(self):
        found = []
        if self.head is None:
            return found
        neuron = self.head
        while neuron is not None:
            found.append(neuron)
            neuron = neuron.next
            if neuron is None or neuron is self.head:
                break
        return found

    def index_of(self, neuron):
        position = 0
        for current in self.traverse():
            if current is neuron:
                return position
            position += 1
        return -1

    def at(self, position):
        for current in self.traverse():
            if position == 0:
                return current
            position -= 1
        return None

    def reverse(self):
        if self.head is None:
            return
        neuron = self.head
        while neuron is not None:
            neuron.prev, neuron.next = neuron.next, neuron.prev
            neuron = neuron.prev
            if neuron is None or neuron is self.head:
                break
        self.head, self.tail = self.tail, self.head
        self._join_ends()

    def set_circular(self, value):
        self.circular = bool(value)
        self._join_ends()
