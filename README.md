# Rise Armor Simulator

A Monster Hunter Rise: Sunbreak build planner, generated from the `mhrice.json` game data dump.

## Run

```sh
docker compose up -d --build
```

Then open http://localhost:7337.

Without compose:

```sh
docker build -t mhrise-armor-sim .
docker run -d -p 7337:7337 mhrise-armor-sim
```

The image build has two stages. The first stage runs `tools/extract_data.py`, which cuts the 124 MB dump down to a
~2 MB `game-data.json`. The second stage is nginx serving the static site on port 7337. The raw dump is
not included in the final image.

## Features

- Weapons of all 14 types (LR/HR/MR), with sharpness, element, slots, rampage skills and rampage decoration slots
- Head/chest/arms/waist/legs armor with skills, slots, resistances, and a per-piece upgrade slider (base to max defense)
- Weapon and armor search by name, skill or monster, plus filters (rarity, slots, element, sharpness, ...) and sorting
- In-game renders of each weapon in the search list and on the equipped weapon
- A custom talisman with 2 skills and up to 3 slots
- Decoration slots: a jewel fits only if its size is at most the slot level. Rampage jewels are limited to the weapon types they allow.
- Skill sheet: total points per skill (capped at max level), wasted points, the current level's effect, and where each point comes from
- Stat sheet: attack, affinity, element, sharpness after Handicraft, effective raw and effective element, defense and resistances
- Toggles for conditional skills (Agitator, Weakness Exploit, Peak Performance, ...) and item buffs (charms, talons, petalace)
- The build saves automatically to the browser. "Copy share link" puts the whole build in the URL.

## Equipment icons

The game has no unique artwork per weapon in its menus. Every weapon and armor piece is shown with
its type icon, tinted by rarity color, and the simulator does the same. The icon masks and element badges in
`web/images/` were downloaded from the [MHRice](https://mhrise.mhrice.info) site with:

```sh
python3 tools/fetch_icons.py
```

They're committed to the repo, so building the image doesn't need network access. Re-run the script only to refresh them.

## Weapon renders

In-game renders of the weapons come from the [Monster Hunter Wiki](https://monsterhunter.fandom.com/wiki/MHRS:_Weapons).
Weapons in one upgrade line share a 3D model, so renders are matched per model. The wiki's API reports which
weapon pages use each render, and those names are matched to weapons in the game data. The renders are converted
to WebP and committed under `web/images/weapons/`; `unmatched-report.txt` lists the weapons that got no render
(they show their icon only). To refresh them (needs Pillow, so this runs in a throwaway container):

```sh
docker run --rm -v "$PWD":/work -w /work python:3.12-slim \
  sh -c "pip install -q pillow && python tools/fetch_weapon_renders.py"
```

## Monster search

The extractor tags each weapon and armor piece with the monsters it is crafted from, so you can search or
filter by monster (e.g. "Rathalos"). A recipe counts toward a monster when the recipe is unlocked by that monster,
when a material's name contains the monster's name, or when the drop tables show a material comes from only
that monster. Weapons also carry the main monster of their upgrade line, and an upgrade that uses only generic
materials (e.g. anomaly "Afflicted" parts) keeps the monster of the weapon it was upgraded from.

## Damage math

- Attack = round(weapon attack x (product of % bonuses) + flat skill bonuses + item bonuses)
- Affinity is capped at +/-100%. Crits deal x1.25 by default (Critical Boost: 1.30 / 1.35 / 1.40). Negative crits deal x0.75.
- Effective raw = attack x raw sharpness multiplier x (1 + affinity x (crit multiplier - 1))
- Effective element = element x element sharpness multiplier x (1 + affinity x Critical Element bonus)
- Sharpness multipliers (red to purple): raw 0.50 / 0.75 / 1.00 / 1.05 / 1.20 / 1.32 / 1.39, element 0.25 / 0.50 / 0.75 / 1.00 / 1.0625 / 1.15 / 1.25
- Defense = (armor + weapon bonus + items) x Defense Boost % + flat skill bonuses

Per-level skill values come from the in-game skill detail text in the data, and live in
`web/js/calc/SkillEffectCatalog.js`. Skills that don't affect these stats (for example Evade Window) still show in the
skill sheet. They just aren't tagged "in stats".

## Project layout

```
tools/extract_data.py     raw dump -> compact game data (runs during docker build)
tools/fetch_icons.py      downloads the equipment icons into web/images (already committed)
tools/fetch_weapon_renders.py  downloads in-game weapon renders into web/images/weapons (already committed)
web/index.html            page shell
web/js/data/              GameDataRepository (indexed data access)
web/js/models/            Build, EquippedWeapon/Armor, Talisman, DecorationSocket
web/js/calc/              SkillAggregator, SkillEffectCatalog, SharpnessCalculator, StatCalculator
web/js/ui/                panels and the picker dialog
```

For local development without Docker:

```sh
python3 tools/extract_data.py mhrice.json.xz web/data/game-data.json
python3 -m http.server 7337 -d web
```
