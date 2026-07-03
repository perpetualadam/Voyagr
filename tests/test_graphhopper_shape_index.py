"""Tests for GraphHopper shape index remapping after polyline re-encode."""

import unittest

from voyagr.utils.graphhopper import remap_shape_index_after_reencode


class TestGraphhopperShapeIndexRemap(unittest.TestCase):
    def test_remaps_to_nearest_vertex_on_reencoded_polyline(self):
        src = [(53.0, -1.0), (53.01, -1.01), (53.02, -1.02)]
        # Denser polyline (simulates P5 -> P6 re-encode with extra points)
        dst = [
            (53.0, -1.0),
            (53.005, -1.005),
            (53.01, -1.01),
            (53.015, -1.015),
            (53.02, -1.02),
        ]
        self.assertEqual(remap_shape_index_after_reencode(src, dst, 0), 0)
        self.assertEqual(remap_shape_index_after_reencode(src, dst, 1), 2)
        self.assertEqual(remap_shape_index_after_reencode(src, dst, 2), 4)

    def test_empty_dst_returns_zero(self):
        self.assertEqual(remap_shape_index_after_reencode([(1.0, 2.0)], [], 0), 0)


if __name__ == '__main__':
    unittest.main()
