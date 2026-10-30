"""Downloads in-game weapon renders from the Monster Hunter Wiki (monsterhunter.fandom.com).

Weapons in the same upgrade line share a 3D model, so renders are matched per model:
  1. The wiki's API lists every "MHRise-/MHRS-<Weapon Type> Render" image and the weapon pages that use it.
  2. Those page titles (e.g. "Kamura Warrior Rapier (MHRS)") are matched by name to weapons in game-data.json.
  3. Each model id gets the render matched by the most of its weapons; every weapon with that model shows it.
Images are shrunk to WebP and written to web/images/weapons/<type>/<modelId>.webp, with an index in
web/images/weapons/renders.json. A report lists models that got no render (those weapons keep their icon).

Requires Pillow. Example (no local install needed):
  docker run --rm -v "$PWD":/work -w /work python:3.12-slim \
    sh -c "pip install -q pillow && python tools/fetch_weapon_renders.py"
"""

import io
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

WIKI_API_URL = "https://monsterhunter.fandom.com/api.php"
USER_AGENT = "RiseArmorSimulator-render-fetcher/1.0 (personal build planner; one-time download)"
SECONDS_BETWEEN_DOWNLOADS = 0.25
RENDER_MAX_WIDTH = 256
WEBP_QUALITY = 82

WIKI_TYPE_NAMES = {
    "great_sword": "Great_Sword", "long_sword": "Long_Sword", "short_sword": "Sword_and_Shield",
    "dual_blades": "Dual_Blades", "hammer": "Hammer", "horn": "Hunting_Horn", "lance": "Lance",
    "gun_lance": "Gunlance", "slash_axe": "Switch_Axe", "charge_axe": "Charge_Blade",
    "insect_glaive": "Insect_Glaive", "light_bowgun": "Light_Bowgun", "heavy_bowgun": "Heavy_Bowgun", "bow": "Bow",
}
WIKI_GAME_PREFIXES = ["MHRise", "MHRS"]


class WeaponNameNormalizer:
    """Makes wiki page titles and in-game names comparable ("Kamura's Legacy (MHRS)" == "Kamura’s Legacy")."""

    TITLE_SUFFIX_PATTERN = re.compile(r"\s*\((MHRise|MHRS|MHR|MHRise Sunbreak)\)\s*$", re.IGNORECASE)

    @classmethod
    def normalize(cls, name):
        name = cls.TITLE_SUFFIX_PATTERN.sub("", name)
        name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
        return re.sub(r"[^a-z0-9+]", "", name.lower())


class WikiApiClient:
    def __init__(self):
        self.request_count = 0

    def get_json(self, parameters):
        query_string = urllib.parse.urlencode({**parameters, "format": "json"})
        request = urllib.request.Request(f"{WIKI_API_URL}?{query_string}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            self.request_count += 1
            return json.load(response)

    def list_renders_with_usage(self, file_prefix):
        """Returns {render file title: {"url": image url, "usedOn": [page titles]}} for every matching image."""
        renders = {}
        continuation = {}
        while True:
            response = self.get_json({
                "action": "query", "generator": "allimages", "gaiprefix": file_prefix, "gailimit": 50,
                "prop": "imageinfo|fileusage", "iiprop": "url", "fulimit": 500, **continuation,
            })
            for page in response.get("query", {}).get("pages", {}).values():
                render = renders.setdefault(page["title"], {"url": None, "usedOn": []})
                if page.get("imageinfo"):
                    render["url"] = page["imageinfo"][0]["url"]
                render["usedOn"].extend(usage["title"] for usage in page.get("fileusage", []))
            if "continue" not in response:
                return renders
            continuation = {key: value for key, value in response["continue"].items()}

    def download(self, url):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()


class RenderMatcher:
    """Picks the best wiki render for each weapon model of one weapon type."""

    def __init__(self, weapons_of_type):
        self.model_ids_by_normalized_name = defaultdict(set)
        for weapon in weapons_of_type:
            self.model_ids_by_normalized_name[WeaponNameNormalizer.normalize(weapon["name"])].add(weapon["modelId"])
        self.all_model_ids = {weapon["modelId"] for weapon in weapons_of_type}

    def match(self, renders):
        """Returns {model id: render title} by majority vote of name matches."""
        votes_by_model = defaultdict(Counter)
        for render_title, render in renders.items():
            if not render["url"]:
                continue
            for page_title in render["usedOn"]:
                for model_id in self.model_ids_by_normalized_name.get(WeaponNameNormalizer.normalize(page_title), ()):
                    votes_by_model[model_id][render_title] += 1
        return {model_id: votes.most_common(1)[0][0] for model_id, votes in votes_by_model.items()}


class WeaponRenderFetcher:
    def __init__(self, game_data_path, output_directory):
        self.game_data = json.loads(Path(game_data_path).read_text(encoding="utf-8"))
        self.output_directory = Path(output_directory)
        self.wiki_api_client = WikiApiClient()

    def run(self):
        render_index = {}
        report_lines = []
        for weapon_type_key, wiki_type_name in WIKI_TYPE_NAMES.items():
            weapons_of_type = [weapon for weapon in self.game_data["weapons"] if weapon["type"] == weapon_type_key]
            renders = {}
            for game_prefix in WIKI_GAME_PREFIXES:
                renders.update(self.wiki_api_client.list_renders_with_usage(f"{game_prefix}-{wiki_type_name}_Render"))
            matcher = RenderMatcher(weapons_of_type)
            render_title_by_model = matcher.match(renders)

            for model_id, render_title in sorted(render_title_by_model.items()):
                relative_path = f"weapons/{weapon_type_key}/{model_id}.webp"
                self._save_render(renders[render_title]["url"], self.output_directory / relative_path)
                render_index[f"{weapon_type_key}:{model_id}"] = relative_path

            unmatched_models = matcher.all_model_ids - set(render_title_by_model)
            unmatched_weapon_names = sorted(weapon["name"] for weapon in weapons_of_type if weapon["modelId"] in unmatched_models)
            summary = (f"{weapon_type_key}: {len(render_title_by_model)}/{len(matcher.all_model_ids)} models matched "
                       f"from {len(renders)} renders; weapons without a render: {len(unmatched_weapon_names)}")
            print(summary)
            report_lines.append(summary)
            report_lines.extend(f"    {weapon_name}" for weapon_name in unmatched_weapon_names)

        index_path = self.output_directory / "weapons" / "renders.json"
        index_path.write_text(json.dumps({
            "source": "Monster Hunter Wiki (monsterhunter.fandom.com), weapon renders",
            "renders": render_index,
        }, indent=1, sort_keys=True), encoding="utf-8")
        report_path = self.output_directory / "weapons" / "unmatched-report.txt"
        report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
        weapon_coverage = sum(
            1 for weapon in self.game_data["weapons"] if f"{weapon['type']}:{weapon['modelId']}" in render_index)
        print(f"Saved {len(render_index)} renders covering {weapon_coverage}/{len(self.game_data['weapons'])} weapons "
              f"({self.wiki_api_client.request_count} API requests). Report: {report_path}")

    def _save_render(self, url, target_path):
        if target_path.exists():
            return
        target_path.parent.mkdir(parents=True, exist_ok=True)
        image = Image.open(io.BytesIO(self.wiki_api_client.download(url))).convert("RGBA")
        if image.width > RENDER_MAX_WIDTH:
            image = image.resize((RENDER_MAX_WIDTH, round(image.height * RENDER_MAX_WIDTH / image.width)), Image.LANCZOS)
        image.save(target_path, "WEBP", quality=WEBP_QUALITY, method=6)
        time.sleep(SECONDS_BETWEEN_DOWNLOADS)


def main():
    game_data_path = sys.argv[1] if len(sys.argv) > 1 else "web/data/game-data.json"
    output_directory = sys.argv[2] if len(sys.argv) > 2 else "web/images"
    WeaponRenderFetcher(game_data_path, output_directory).run()


if __name__ == "__main__":
    main()
