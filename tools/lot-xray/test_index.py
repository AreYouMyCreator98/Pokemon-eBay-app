import argparse
import json
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from build_index import build_index, write_index


def synthetic_card(seed, number):
    image = np.full((410, 290, 3), (217, 222, 224), dtype=np.uint8)
    rng = np.random.default_rng(seed)
    palette = rng.integers(30, 240, (125, 3)).tolist()
    for color in palette:
        x, y = rng.integers([12, 30], [275, 348]).tolist()
        radius = int(rng.integers(4, 22))
        cv2.circle(image, (x, y), radius, color, -1, cv2.LINE_AA)
        cv2.line(image, (x, y), (x + radius, y - radius), (250, 250, 250), 2, cv2.LINE_AA)
    for x in range(20, 255, 52):
        cv2.putText(image, str(seed), (x, 366), cv2.FONT_HERSHEY_DUPLEX, 0.45, (30, 30, 30), 1, cv2.LINE_AA)
    cv2.putText(image, number, (20, 397), cv2.FONT_HERSHEY_DUPLEX, 0.62, (25, 25, 25), 1, cv2.LINE_AA)
    return image


def insert(photo, image, corners):
    height, width = image.shape[:2]
    matrix = cv2.getPerspectiveTransform(np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]), np.float32(corners))
    photo_height, photo_width = photo.shape[:2]
    cv2.warpPerspective(image, matrix, (photo_width, photo_height), dst=photo, borderMode=cv2.BORDER_TRANSPARENT)


def make_fixture(directory, alternate_number="183/167"):
    # Deliberately reuse the same art for two printings with different numbers.
    cards = [synthetic_card(4, "203/193"), synthetic_card(4, alternate_number), synthetic_card(5, "080/193")]
    names = ["Prototype Fish", "Prototype Fish", "Prototype Fox"]
    numbers = ["203/193", alternate_number, "080/193"]
    refs = []
    for index, (card, name, number) in enumerate(zip(cards, names, numbers)):
        filename = f"ref-{index}.png"
        cv2.imwrite(str(directory / filename), card)
        refs.append(dict(id=str(index), name=name, number=number, set="Test Set", image=filename,
                         numberBox=[17 / 290, 380 / 410, 94 / 290, 20 / 410]))

    photo = np.full((730, 980, 3), (52, 54, 58), dtype=np.uint8)
    insert(photo, cards[1], [[84, 65], [300, 83], [294, 353], [97, 350]])
    insert(photo, cards[2], [[377, 71], [592, 69], [600, 346], [390, 368]])
    cv2.imwrite(str(directory / "page-1.jpg"), photo, [cv2.IMWRITE_JPEG_QUALITY, 78])

    insert(photo, cards[0], [[352, 387], [557, 400], [563, 681], [365, 687]])
    # Glare across the art preserves the collector number.
    glare = photo.copy()
    cv2.line(glare, (370, 502), (558, 464), (236, 239, 247), 13, cv2.LINE_AA)
    cv2.addWeighted(glare, 0.40, photo, 0.60, 0, dst=photo)
    cv2.imwrite(str(directory / "page-2.jpg"), photo, [cv2.IMWRITE_JPEG_QUALITY, 78])

    unreadable = cards[0].copy()
    unreadable[378:402, 14:114] = 215
    insert(photo, unreadable, [[352, 387], [557, 400], [563, 681], [365, 687]])
    cv2.imwrite(str(directory / "page-3.jpg"), photo)

    def lot(lot_id, photos):
        return dict(id=lot_id, title="Binder collection, assorted cards", url=None, bid=None,
                    currency="AUD", endTime=None, photos=photos)

    manifest = {"mode": "demo", "references": refs, "listings": [
        lot("sample-with-fish", ["page-1.jpg", "page-2.jpg"]), lot("sample-with-unreadable-number", ["page-3.jpg"]),
    ]}
    path = directory / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path


class IndexTests(unittest.TestCase):
    def test_links_only_readable_exact_printing_to_source_photo(self):
        with tempfile.TemporaryDirectory() as temporary:
            index = build_index(make_fixture(Path(temporary)))
        first, second = index["entries"]
        matches = {entry["card"]["number"]: entry for entry in first["matches"]}
        self.assertEqual(set(matches), {"203/193", "183/167", "080/193"})
        self.assertEqual(matches["203/193"]["photoNumber"], 2)
        self.assertTrue(matches["203/193"]["cropJpeg"])
        self.assertNotIn("203/193", {entry["card"]["number"] for entry in second["matches"]})

    def test_does_not_report_the_other_printing_when_one_digit_differs(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest = make_fixture(Path(temporary), alternate_number="208/193")
            values = json.loads(manifest.read_text(encoding="utf-8"))
            values["listings"][0]["photos"] = ["page-1.jpg"]
            manifest.write_text(json.dumps(values), encoding="utf-8")
            index = build_index(manifest)
        self.assertNotIn("203/193", {entry["card"]["number"] for entry in index["entries"][0]["matches"]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-index", type=Path)
    args = parser.parse_args()
    if args.sample_index:
        with tempfile.TemporaryDirectory() as temporary:
            write_index(build_index(make_fixture(Path(temporary))), args.sample_index)
    else:
        unittest.main(argv=[__file__])
