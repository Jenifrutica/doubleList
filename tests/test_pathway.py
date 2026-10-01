import unittest

from core.pathway import NeuralPathway
from core.conduction import Simulator, SALTATORY_VELOCITY, CONTINUOUS_VELOCITY


class TestPointerSurgery(unittest.TestCase):
    def setUp(self):
        self.pathway = NeuralPathway()
        self.a = self.pathway.append("A")
        self.b = self.pathway.append("B")
        self.c = self.pathway.append("C")

    def names(self):
        return [neuron.name for neuron in self.pathway.traverse()]

    def test_append_wires_prev_and_next(self):
        self.assertIs(self.pathway.head, self.a)
        self.assertIs(self.pathway.tail, self.c)
        self.assertIsNone(self.a.prev)
        self.assertIsNone(self.c.next)
        self.assertIs(self.a.next, self.b)
        self.assertIs(self.b.prev, self.a)
        self.assertIs(self.b.next, self.c)
        self.assertIs(self.c.prev, self.b)
        self.assertEqual(self.pathway.length, 3)

    def test_prepend_moves_head_and_relinks(self):
        z = self.pathway.prepend("Z")
        self.assertIs(self.pathway.head, z)
        self.assertIs(z.next, self.a)
        self.assertIs(self.a.prev, z)
        self.assertIsNone(z.prev)
        self.assertEqual(self.names(), ["Z", "A", "B", "C"])

    def test_insert_after_rewires_four_links(self):
        x = self.pathway.insert_after(self.a, "X")
        self.assertIs(self.a.next, x)
        self.assertIs(x.prev, self.a)
        self.assertIs(x.next, self.b)
        self.assertIs(self.b.prev, x)
        self.assertEqual(self.names(), ["A", "X", "B", "C"])

    def test_insert_after_tail_updates_tail(self):
        x = self.pathway.insert_after(self.c, "X")
        self.assertIs(self.pathway.tail, x)
        self.assertIs(x.next, None)
        self.assertEqual(self.names(), ["A", "B", "C", "X"])

    def test_insert_before_head_updates_head(self):
        x = self.pathway.insert_before(self.a, "X")
        self.assertIs(self.pathway.head, x)
        self.assertIs(x.prev, None)
        self.assertIs(x.next, self.a)
        self.assertIs(self.a.prev, x)

    def test_remove_head_middle_and_tail(self):
        self.pathway.remove(self.a)
        self.assertIs(self.pathway.head, self.b)
        self.assertIsNone(self.b.prev)
        self.assertEqual(self.names(), ["B", "C"])

        self.pathway.remove(self.b)
        self.assertIs(self.pathway.head, self.c)
        self.assertIs(self.pathway.tail, self.c)
        self.assertEqual(self.pathway.length, 1)

        self.pathway.remove(self.c)
        self.assertIsNone(self.pathway.head)
        self.assertIsNone(self.pathway.tail)
        self.assertIsNone(self.pathway.cursor)
        self.assertEqual(self.pathway.length, 0)

    def test_remove_middle_joins_neighbours(self):
        self.pathway.remove(self.b)
        self.assertIs(self.a.next, self.c)
        self.assertIs(self.c.prev, self.a)
        self.assertIsNone(self.b.prev)
        self.assertIsNone(self.b.next)

    def test_cursor_moves_both_directions(self):
        self.pathway.cursor = self.a
        self.pathway.step_forward()
        self.assertIs(self.pathway.cursor, self.b)
        self.pathway.step_backward()
        self.assertIs(self.pathway.cursor, self.a)
        self.pathway.step_backward()
        self.assertIs(self.pathway.cursor, self.a)

    def test_reverse_swaps_every_link(self):
        self.pathway.reverse()
        self.assertIs(self.pathway.head, self.c)
        self.assertIs(self.pathway.tail, self.a)
        self.assertEqual(self.names(), ["C", "B", "A"])
        self.assertIs(self.c.prev, None)
        self.assertIs(self.a.next, None)

    def test_index_of_and_at(self):
        self.assertEqual(self.pathway.index_of(self.b), 1)
        self.assertIs(self.pathway.at(2), self.c)
        self.assertIsNone(self.pathway.at(9))

    def test_find_by_name(self):
        self.assertIs(self.pathway.find("C"), self.c)
        self.assertIsNone(self.pathway.find("Z"))


class TestCircularReflexArc(unittest.TestCase):
    def setUp(self):
        self.pathway = NeuralPathway()
        self.a = self.pathway.append("A")
        self.b = self.pathway.append("B")
        self.c = self.pathway.append("C")
        self.pathway.set_circular(True)

    def test_ends_are_joined(self):
        self.assertIs(self.pathway.head.prev, self.pathway.tail)
        self.assertIs(self.pathway.tail.next, self.pathway.head)

    def test_traverse_terminates_and_is_complete(self):
        self.assertEqual([n.name for n in self.pathway.traverse()], ["A", "B", "C"])

    def test_cursor_wraps_both_ways(self):
        self.pathway.cursor = self.c
        self.pathway.step_forward()
        self.assertIs(self.pathway.cursor, self.a)
        self.pathway.step_backward()
        self.assertIs(self.pathway.cursor, self.c)

    def test_remove_in_circle_keeps_ring(self):
        self.pathway.remove(self.b)
        self.assertIs(self.a.next, self.c)
        self.assertIs(self.c.prev, self.a)
        self.assertIs(self.pathway.head.prev, self.pathway.tail)
        self.assertIs(self.pathway.tail.next, self.pathway.head)

    def test_reverse_in_circle(self):
        self.pathway.reverse()
        self.assertEqual([n.name for n in self.pathway.traverse()], ["C", "B", "A"])
        self.assertIs(self.pathway.head.prev, self.pathway.tail)
        self.assertIs(self.pathway.tail.next, self.pathway.head)

    def test_open_circle_restores_nulls(self):
        self.pathway.set_circular(False)
        self.assertIsNone(self.pathway.head.prev)
        self.assertIsNone(self.pathway.tail.next)


class TestConduction(unittest.TestCase):
    def setUp(self):
        self.pathway = NeuralPathway()
        self.pathway.append("myelinated", -70.0, True)
        self.pathway.append("bare", -70.0, False)
        self.simulator = Simulator(self.pathway)
        self.pathway.cursor = self.pathway.head

    def test_velocity_depends_on_myelin(self):
        self.assertEqual(self.simulator.velocity(self.pathway.head), SALTATORY_VELOCITY)
        self.assertEqual(self.simulator.velocity(self.pathway.tail), CONTINUOUS_VELOCITY)

    def test_forward_volley_follows_next(self):
        run = self.simulator.fire(1)
        self.assertEqual(run, [1, 2])

    def test_backward_volley_follows_prev(self):
        self.pathway.cursor = self.pathway.tail
        run = self.simulator.fire(-1)
        self.assertEqual(run, [2, 1])

    def test_volley_sets_refractory_and_decays(self):
        self.simulator.fire(1)
        self.assertTrue(all(n.refractory > 0 for n in self.pathway.traverse()))
        self.simulator.rest()
        self.assertTrue(all(n.refractory < 2 for n in self.pathway.traverse()))

    def test_attenuation_stops_a_long_chain(self):
        long_path = NeuralPathway()
        for index in range(120):
            long_path.append("n%d" % index, -70.0, False)
        long_path.cursor = long_path.head
        run = Simulator(long_path).fire(1)
        self.assertLess(len(run), 120)


if __name__ == "__main__":
    unittest.main()
