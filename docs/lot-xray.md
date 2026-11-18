# Lot X-Ray prototype

Lot X-Ray serves a search-only page at `/lot-xray`. An offline job finds specific card printings in supplied lot photos, then the dashboard searches the finished index by card name, set, or collector number. Results are grouped by listing and include a crop from the matched photo. Active auction links open the original listing on eBay.

## Try the sample

Run these commands from the repository root on a machine with Node and Python 3.10 or newer.

```sh
python3 -m venv /tmp/lot-xray-venv
/tmp/lot-xray-venv/bin/pip install -r tools/lot-xray/requirements.txt
/tmp/lot-xray-venv/bin/python tools/lot-xray/test_index.py --sample-index /tmp/lot-xray-index.json
LOT_XRAY_INDEX=/tmp/lot-xray-index.json npm start
```

Open `http://localhost:3000/lot-xray` and search `203/193`. The sample finds the exact printing in the second photo of a mock binder lot. It also contains a different printing with identical art and a second lot where the target number is obscured. Sample results carry a label and omit auction links and bids.

Run `npm run check` and `/tmp/lot-xray-venv/bin/python tools/lot-xray/test_index.py` to verify the search and scanner.

## Index a local gallery

Use a JSON manifest with paths relative to the manifest file. Supply a flat reference image for each printing and mark the collector-number rectangle as `[left, top, width, height]` in fractions of the image size. Keep the rectangle tight to the visible number. Include references for visually similar printings so the scanner can suppress ambiguous matches.

```json
{
  "mode": "demo",
  "references": [
    {
      "id": "sv2-203",
      "name": "Magikarp",
      "number": "203/193",
      "set": "Paldea Evolved",
      "image": "magikarp.png",
      "numberBox": [0.148, 0.943, 0.137, 0.030]
    }
  ],
  "listings": [
    {
      "id": "sample-binder",
      "title": "Pokémon binder collection",
      "url": null,
      "bid": null,
      "currency": "AUD",
      "endTime": null,
      "photos": ["cover.jpg", "binder-page.jpg"]
    }
  ]
}
```

Build the index with `/tmp/lot-xray-venv/bin/python tools/lot-xray/build_index.py manifest.json /tmp/lot-xray-index.json`. The scanner replaces the output atomically so the server can read a refreshed index while serving requests.

## Live integration

The branch has no recurring eBay ingestion job. For a live pilot, the existing Browse integration would discover eligible AU auctions, retrieve the full galleries, update rescanned lots when photos change, and refresh auction metadata separately. Before connecting it, verify the account's access to those photos and the permitted handling of the images, derived matches and result crops. Live index records use `mode: "pilot"` with an eBay listing URL and the actual auction end time. The search excludes ended auctions and links outside eBay. The page labels bids as snapshots.
