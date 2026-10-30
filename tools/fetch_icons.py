"""Downloads the in-game equipment icons used by the simulator from the MHRice site (mhrise.mhrice.info).

The game has no per-weapon artwork in its menus: every weapon and armor piece is shown with its
type icon, tinted by rarity color. Each icon is two 48x48 alpha masks:
  <id>.r.png  the shape that gets filled with the rarity color
  <id>.a.png  the outline drawn behind it in black
Element badges (fire.png, ...) are overlaid on weapon icons like in the game.

Usage: python tools/fetch_icons.py [output_directory]   (default: web/images)
The icons are committed to the repo, so this only needs to be re-run to refresh them.
"""

import sys
import urllib.request
from pathlib import Path

SOURCE_BASE_URL = "https://mhrise.mhrice.info/resources/"

# Icon ids as used by MHRice: 000-004 are armor slots, 015-028 weapon types.
EQUIPMENT_ICON_IDS = {
    "head": "000", "chest": "001", "arms": "002", "waist": "003", "legs": "004",
    "short_sword": "015", "great_sword": "016", "long_sword": "017", "dual_blades": "018",
    "lance": "019", "gun_lance": "020", "hammer": "021", "horn": "022", "slash_axe": "023",
    "charge_axe": "024", "insect_glaive": "025", "light_bowgun": "026", "heavy_bowgun": "027", "bow": "028",
}

# Simulator element name -> MHRice badge file name.
ELEMENT_BADGE_FILES = {
    "fire": "fire", "water": "water", "thunder": "thunder", "ice": "ice", "dragon": "dragon",
    "poison": "poison", "sleep": "sleep", "paralysis": "para", "blast": "blast",
}


class IconDownloader:
    def __init__(self, output_directory):
        self.output_directory = Path(output_directory)

    def download_all(self):
        for equipment_key, icon_id in EQUIPMENT_ICON_IDS.items():
            for layer_name in ("r", "a"):
                self._download(f"equip/{icon_id}.{layer_name}.png", f"equip/{equipment_key}.{layer_name}.png")
        for element_type, badge_file in ELEMENT_BADGE_FILES.items():
            self._download(f"{badge_file}.png", f"element/{element_type}.png")

    def _download(self, source_path, target_path):
        target_file = self.output_directory / target_path
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(SOURCE_BASE_URL + source_path, timeout=30) as response:
            target_file.write_bytes(response.read())
        print(f"Saved {target_file}")


def main():
    output_directory = sys.argv[1] if len(sys.argv) > 1 else "web/images"
    IconDownloader(output_directory).download_all()


if __name__ == "__main__":
    main()
