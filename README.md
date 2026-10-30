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
- Head/chest/arms/waist/legs armor with skills, slots, base and fully upgraded defense, and resistances
- A custom talisman with 2 skills and up to 3 slots
- Decoration slots: a jewel fits only if its size is at most the slot level. Rampage jewels are limited to the weapon types they allow.
- Skill sheet: total points per skill (capped at max level), wasted points, the current level's effect, and where each point comes from
- Stat sheet: attack, affinity, element, sharpness after Handicraft, effective raw and effective element, defense and resistances
- Toggles for conditional skills (Agitator, Weakness Exploit, Peak Performance, ...) and item buffs (charms, talons, petalace)
- The build saves automatically to the browser. "Copy share link" puts the whole build in the URL.

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
web/index.html            page shell
web/js/data/              GameDataRepository (indexed data access)
web/js/models/            Build, EquippedWeapon/Armor, Talisman, DecorationSocket
web/js/calc/              SkillAggregator, SkillEffectCatalog, SharpnessCalculator, StatCalculator
web/js/ui/                panels and the picker dialog
```

For local development without Docker:

```sh
python3 tools/extract_data.py mhrice.json web/data/game-data.json
python3 -m http.server 7337 -d web
```
