import argparse
import base64
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np


REFERENCE_EDGE = 490
PHOTO_EDGE = 1600
MIN_INLIERS = 13
MIN_NUMBER_SCORE = 0.68
MIN_NUMBER_MARGIN = 0.10


def load_image(path, max_edge):
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    scale = max_edge / max(image.shape[:2])
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return image


def image_points(image, sift):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    points, descriptors = sift.detectAndCompute(gray, None)
    return gray, points, descriptors


class Reference:
    def __init__(self, values, directory, sift):
        self.card = {key: values[key] for key in ("id", "name", "number", "set")}
        self.gray, self.points, descriptors = image_points(
            load_image(directory / values["image"], REFERENCE_EDGE), sift
        )
        if descriptors is None or len(descriptors) < MIN_INLIERS:
            raise ValueError(f"Insufficient detail in reference image for {self.card['id']}")
        self.matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=40))
        self.matcher.add([descriptors])
        self.matcher.train()
        height, width = self.gray.shape
        x, y, w, h = values["numberBox"]
        if not (0 <= x < x + w <= 1 and 0 <= y < y + h <= 1):
            raise ValueError(f"Invalid collector-number box for {self.card['id']}")
        self.number_box = (round(x * width), round(y * height), round((x + w) * width), round((y + h) * height))
        self.corners = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])


def projected(matrix, points):
    return cv2.perspectiveTransform(np.float32(points).reshape(-1, 1, 2), matrix).reshape(-1, 2)


def number_similarity(reference, gray, matrix):
    x1, y1, x2, y2 = reference.number_box
    number_corners = projected(matrix, [[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
    if min(np.linalg.norm(number_corners[1] - number_corners[0]),
           np.linalg.norm(number_corners[2] - number_corners[3])) < 13:
        return 0.0
    if min(np.linalg.norm(number_corners[3] - number_corners[0]),
           np.linalg.norm(number_corners[2] - number_corners[1])) < 5:
        return 0.0

    height, width = reference.gray.shape
    rectified = cv2.warpPerspective(gray, matrix, (width, height), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    expected = reference.gray[y1:y2, x1:x2]
    actual = rectified[max(0, y1 - 3):y2 + 3, max(0, x1 - 3):x2 + 3]
    if expected.size < 48 or expected.std() < 8 or actual.std() < 8:
        return 0.0
    expected = cv2.GaussianBlur(expected, (3, 3), 0.65)
    actual = cv2.GaussianBlur(actual, (3, 3), 0.65)
    return float(cv2.matchTemplate(actual, expected, cv2.TM_CCOEFF_NORMED).max())


def card_bounds(reference, gray, matrix, inliers):
    if cv2.contourArea(cv2.convexHull(inliers)) < 0.09 * reference.gray.size:
        return None

    corners = projected(matrix, reference.corners)
    height, width = gray.shape
    area = cv2.contourArea(corners) if np.isfinite(corners).all() else 0
    if area < 1100 or not cv2.isContourConvex(corners):
        return None
    if np.any(corners < -4) or np.any(corners > [width + 4, height + 4]):
        return None

    return corners


def find_cards(reference, gray, points, descriptors):
    # Query from the scene so two copies of the same artwork can both match one reference.
    pairs = reference.matcher.knnMatch(descriptors, k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance]
    source = np.float32([reference.points[match.trainIdx].pt for match in good])
    target = np.float32([points[match.queryIdx].pt for match in good])

    while len(source) >= MIN_INLIERS:
        matrix, mask = cv2.findHomography(source, target, cv2.RANSAC, 3.0)
        if matrix is None or int(mask.sum()) < MIN_INLIERS:
            break
        inliers = mask.ravel().astype(bool)
        corners = card_bounds(reference, gray, matrix, source[inliers])
        source, target = source[~inliers], target[~inliers]
        if corners is not None:
            score = number_similarity(reference, gray, matrix)
            yield {"card": reference.card, "corners": corners, "score": score}


def overlaps(first, second):
    area, _ = cv2.intersectConvexConvex(first, second)
    return area > 0.62 * min(cv2.contourArea(first), cv2.contourArea(second))


def crop_evidence(image, corners):
    x, y, width, height = cv2.boundingRect(corners)
    photo_height, photo_width = image.shape[:2]
    content = image[max(0, y):min(photo_height, y + height), max(0, x):min(photo_width, x + width)]
    scale = min(1.0, 300 / max(content.shape[:2]))
    if scale < 1.0:
        content = cv2.resize(content, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    _, encoded = cv2.imencode(".jpg", content, [cv2.IMWRITE_JPEG_QUALITY, 83])
    return base64.b64encode(encoded).decode("ascii")


def scan_photo(image, references, sift, photo_number):
    gray, points, descriptors = image_points(image, sift)
    if descriptors is None or len(descriptors) < 2:
        return []
    candidates = [candidate for ref in references for candidate in find_cards(ref, gray, points, descriptors)]

    hits = []
    for candidate in candidates:
        corners, score = candidate["corners"], candidate["score"]
        if score < MIN_NUMBER_SCORE:
            continue
        ambiguous = any(other["card"]["id"] != candidate["card"]["id"] and other["score"] >= score - MIN_NUMBER_MARGIN
                        and overlaps(corners, other["corners"]) for other in candidates)
        if ambiguous:
            continue
        hits.append({
            "card": candidate["card"],
            "photoNumber": photo_number,
            "cropJpeg": crop_evidence(image, corners),
            "score": round(score, 3),
        })
    return hits


def build_index(manifest_path):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("mode") not in {"demo", "pilot"}:
        raise ValueError("Index mode must be 'demo' or 'pilot'")
    directory = manifest_path.parent
    cv2.setNumThreads(2)
    cv2.setRNGSeed(42)
    sift = cv2.SIFT_create(nfeatures=3600)
    references = [Reference(ref, directory, sift) for ref in manifest["references"]]
    ids = {ref.card["id"] for ref in references}
    if len(ids) != len(references):
        raise ValueError("Reference card IDs must be unique")

    entries = []
    for item in manifest["listings"]:
        matches = {}
        for position, file in enumerate(item["photos"], start=1):
            for hit in scan_photo(load_image(directory / file, PHOTO_EDGE), references, sift, position):
                card_id = hit["card"]["id"]
                if card_id not in matches or hit["score"] > matches[card_id]["score"]:
                    matches[card_id] = hit
        listing = {key: item[key] for key in ("id", "title", "url", "bid", "currency", "endTime")}
        entries.append({"listing": listing, "matches": list(matches.values())})
    return {"mode": manifest["mode"], "indexedAt": datetime.now(timezone.utc).isoformat(), "entries": entries}


def write_index(index, path):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as output:
        temporary_path = Path(output.name)
        try:
            json.dump(index, output, separators=(",", ":"))
            output.close()
            os.replace(temporary_path, path)
        finally:
            temporary_path.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build a searchable index from local card references and lot photos")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    write_index(build_index(args.manifest), args.output)
