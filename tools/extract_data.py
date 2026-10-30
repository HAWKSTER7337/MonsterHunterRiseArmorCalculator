"""Builds a compact game-data JSON for the armor simulator from the raw mhrice.json dump.

Usage: python extract_data.py <path/to/mhrice.json[.xz]> <path/to/output.json>
The input may be plain JSON or xz-compressed (.xz), which is how it is stored in the repo.
"""

import json
import lzma
import re
import sys

ENGLISH_LANGUAGE_INDEX = 1
MASTER_RANK_ARMOR_ID_START = 300
MASTER_RANK_SKILL_OFFSET = 200
MASTER_RANK_DECORATION_OFFSET = 200

ARMOR_PART_KEYS = {
    "Head": ("head", "armor_head_name_msg"),
    "Chest": ("chest", "armor_chest_name_msg"),
    "Arm": ("arms", "armor_arm_name_msg"),
    "Waist": ("waist", "armor_waist_name_msg"),
    "Leg": ("legs", "armor_leg_name_msg"),
}

# Ordered to match the game's weapon type enum, which rampage decoration equip flags are indexed by.
WEAPON_TYPES = [
    ("great_sword", "GreatSword", "Great Sword"),
    ("slash_axe", "SlashAxe", "Switch Axe"),
    ("long_sword", "LongSword", "Long Sword"),
    ("light_bowgun", "LightBowgun", "Light Bowgun"),
    ("heavy_bowgun", "HeavyBowgun", "Heavy Bowgun"),
    ("hammer", "Hammer", "Hammer"),
    ("gun_lance", "GunLance", "Gunlance"),
    ("lance", "Lance", "Lance"),
    ("short_sword", "ShortSword", "Sword & Shield"),
    ("dual_blades", "DualBlades", "Dual Blades"),
    ("horn", "Horn", "Hunting Horn"),
    ("charge_axe", "ChargeAxe", "Charge Blade"),
    ("insect_glaive", "InsectGlaive", "Insect Glaive"),
    ("bow", "Bow", "Bow"),
]

ELEMENT_NAMES = {
    "Fire": "fire", "Water": "water", "Thunder": "thunder", "Ice": "ice", "Dragon": "dragon",
    "Poison": "poison", "Sleep": "sleep", "Paralyze": "paralysis", "Bomb": "blast",
}

PHIAL_NAMES = {
    "Power": "Power Phial", "StrongElement": "Element Phial", "Impact": "Impact Phial",
    "Element": "Element Phial", "Poison": "Poison Phial", "Paralysis": "Paralysis Phial",
    "Dragon": "Dragon Phial", "Exhaust": "Exhaust Phial", "Ice": "Ice Phial",
}


class MessageTable:
    """Looks up English strings from one or more mhrice message sections by entry name."""

    def __init__(self, raw_data, *section_names):
        self.text_by_entry_name = {}
        for section_name in section_names:
            for entry in raw_data.get(section_name, {}).get("entries", []):
                self.text_by_entry_name[entry["name"]] = entry["content"][ENGLISH_LANGUAGE_INDEX]

    def get(self, entry_name):
        text = self.text_by_entry_name.get(entry_name, "")
        if not text or "#Rejected#" in text:
            return None
        return text.replace("\r\n", " ").strip()


class TaggedId:
    """Helpers for mhrice's tagged ids such as {"Skill": 4} or {"MrSkill": 2}."""

    @staticmethod
    def split(tagged_value):
        if not isinstance(tagged_value, dict):
            return None, None
        tag, number = next(iter(tagged_value.items()))
        return tag, number

    @staticmethod
    def to_skill_id(tagged_value):
        tag, number = TaggedId.split(tagged_value)
        if tag == "Skill":
            return number
        if tag == "MrSkill":
            return number + MASTER_RANK_SKILL_OFFSET
        return None


class NestedRecord:
    """Flattens mhrice's deeply nested {"base": {"base": ...}} weapon records."""

    @staticmethod
    def flatten(record):
        flattened = {}
        for key, value in record.items():
            if key == "base" and isinstance(value, dict):
                flattened.update(NestedRecord.flatten(value))
            else:
                flattened[key] = value
        return flattened


class SlotList:
    @staticmethod
    def from_counts(counts_per_level):
        """Converts [count of lv1, count of lv2, ...] into a descending list of slot levels."""
        slot_levels = []
        for level_index, count in enumerate(counts_per_level):
            slot_levels.extend([level_index + 1] * count)
        return sorted(slot_levels, reverse=True)


class MonsterMaterialIndex:
    """
    Works out which monsters a piece of equipment is made from. A recipe counts toward a monster when:
      - the recipe itself is unlocked by that monster (its "enemy_flag"),
      - a material's name contains the monster's name ("Rathalos Ruby" -> Rathalos; the longest name wins,
        so "Royal Ludroth Claw" counts as Royal Ludroth rather than Ludroth), or
      - the drop tables show a material comes from that one monster only ("Pearl Glosshide" -> Khezu).
    Materials dropped by several monsters (e.g. "Lightning Sac") are ignored unless named after one.
    """

    DROP_TABLE_SECTIONS = ("monster_lot", "monster_lot_mr")

    def __init__(self, raw_data):
        self.monster_name_by_em_type = self._build_monster_names(raw_data)
        monster_names = set(self.monster_name_by_em_type.values())
        self.monster_patterns = [
            (monster_name, re.compile(rf"(?<![\w-]){re.escape(monster_name)}(?![\w-])", re.IGNORECASE))
            for monster_name in sorted(monster_names, key=len, reverse=True)
        ]
        self.item_names = MessageTable(raw_data, "items_name_msg", "items_name_msg_mr")
        self.sole_dropper_by_item_number = self._build_sole_droppers(raw_data)
        self.monsters_by_item_number = {}

    def _build_monster_names(self, raw_data):
        """Maps a monster's tagged type ({"Em": n} for large, {"Ems": n} for small monsters) to its English name."""
        names = MessageTable(raw_data, "monster_names", "monster_names_mr")
        monster_name_by_em_type = {}
        for monster in raw_data["monsters"] + raw_data["small_monsters"]:
            enemy_index = monster["enemy_type"]
            name = names.get(f"EnemyIndex{enemy_index:03d}") or names.get(f"EnemyIndex{enemy_index:03d}_MR")
            if name:
                monster_name_by_em_type[TaggedId.split(monster["em_type"])] = name
        return monster_name_by_em_type

    def _build_sole_droppers(self, raw_data):
        """Item number -> monster name, for items that only one monster's drop tables contain."""
        droppers_by_item_number = {}
        for section_name in self.DROP_TABLE_SECTIONS:
            for drop_table in raw_data[section_name]["param"]:
                monster_name = self.monster_name_for(drop_table["em_types"])
                if monster_name is None:
                    continue
                for field_name, field_value in drop_table.items():
                    if not field_name.endswith("_item_id_list"):
                        continue
                    for item_tag in field_value:
                        tag, item_number = TaggedId.split(item_tag)
                        if tag == "Normal":
                            droppers_by_item_number.setdefault(item_number, set()).add(monster_name)
        return {item_number: next(iter(droppers))
                for item_number, droppers in droppers_by_item_number.items() if len(droppers) == 1}

    def monster_name_for(self, em_tag):
        return self.monster_name_by_em_type.get(TaggedId.split(em_tag))

    def monsters_for_item(self, item_tag):
        tag, item_number = TaggedId.split(item_tag)
        if tag != "Normal":
            return []
        if item_number not in self.monsters_by_item_number:
            item_name = self.item_names.get(f"I_{item_number:04d}_Name") or ""
            monsters = self._find_monsters_in_name(item_name)
            sole_dropper = self.sole_dropper_by_item_number.get(item_number)
            if not monsters and sole_dropper:
                monsters = [sole_dropper]
            self.monsters_by_item_number[item_number] = monsters
        return self.monsters_by_item_number[item_number]

    def _find_monsters_in_name(self, item_name):
        found_monsters = []
        remaining_text = item_name
        for monster_name, pattern in self.monster_patterns:
            if pattern.search(remaining_text):
                found_monsters.append(monster_name)
                remaining_text = pattern.sub(" ", remaining_text)
        return found_monsters

    def monsters_for_recipes(self, recipes):
        """Monster names across all given recipe records, most-used first."""
        monster_counts = {}
        for recipe in recipes:
            recipe_monsters = [self.monster_name_for(recipe.get("enemy_flag"))]
            for item_tag in recipe.get("item", []):
                recipe_monsters.extend(self.monsters_for_item(item_tag))
            for monster_name in filter(None, recipe_monsters):
                monster_counts[monster_name] = monster_counts.get(monster_name, 0) + 1
        return sorted(monster_counts, key=lambda monster_name: -monster_counts[monster_name])


class SkillExtractor:
    def __init__(self, raw_data):
        self.raw_data = raw_data
        self.names = MessageTable(raw_data, "player_skill_name_msg", "player_skill_name_msg_mr")
        self.explanations = MessageTable(raw_data, "player_skill_explain_msg", "player_skill_explain_msg_mr")
        self.details = MessageTable(raw_data, "player_skill_detail_msg", "player_skill_detail_msg_mr")

    def extract(self):
        skills = []
        for record in self.raw_data["equip_skill"]["param"]:
            skill_id = TaggedId.to_skill_id(record["id"])
            name = self.names.get(f"PlayerSkill_{skill_id:03d}_Name")
            if skill_id is None or name is None:
                continue
            level_count = record["max_level"] + 1
            skills.append({
                "id": skill_id,
                "name": name,
                "description": self.explanations.get(f"PlayerSkill_{skill_id:03d}_Explain") or "",
                "maxLevel": level_count,
                "levelDetails": [self._level_detail(skill_id, level_index) for level_index in range(level_count)],
            })
        return skills

    def _level_detail(self, skill_id, level_index):
        return (self.details.get(f"PlayerSkill_{skill_id:03d}_{level_index:02d}_Detail")
                or self.details.get(f"PlayerSkill_{skill_id:03d}_{level_index:02d}_Detail_MR")
                or "")


class DecorationExtractor:
    def __init__(self, raw_data, valid_skill_ids):
        self.raw_data = raw_data
        self.valid_skill_ids = valid_skill_ids
        self.names = MessageTable(raw_data, "decorations_name_msg", "decorations_name_msg_mr")

    def extract(self):
        decorations = []
        for record in self.raw_data["decorations"]["param"]:
            tag, number = TaggedId.split(record["id"])
            if tag == "Deco":
                message_key, decoration_id = f"Decorations_{number:03d}_Name", f"d{number}"
            else:
                message_key, decoration_id = f"Decorations_{number + MASTER_RANK_DECORATION_OFFSET:04d}_Name", f"m{number}"
            name = self.names.get(message_key)
            skills = [
                {"skillId": TaggedId.to_skill_id(skill_tag), "level": level}
                for skill_tag, level in zip(record["skill_id_list"], record["skill_lv_list"])
                if TaggedId.to_skill_id(skill_tag) in self.valid_skill_ids and level > 0
            ]
            if name is None or not skills:
                continue
            decorations.append({
                "id": decoration_id,
                "name": name,
                "slotLevel": record["decoration_lv"],
                "rarity": record["rare"],
                "sortId": record["sort_id"],
                "skills": skills,
            })
        return sorted(decorations, key=lambda decoration: (decoration["name"]))


class RampageSkillExtractor:
    MAIN_ELEMENT_TYPE_FLAG = 0
    SUB_ELEMENT_TYPE_FLAG = 2

    def __init__(self, raw_data):
        self.raw_data = raw_data
        self.names = MessageTable(raw_data, "hyakuryu_skill_name_msg", "hyakuryu_skill_name_msg_mr")
        self.explanations = MessageTable(raw_data, "hyakuryu_skill_explain_msg", "hyakuryu_skill_explain_msg_mr")

    def extract(self):
        rampage_skills = []
        for record in self.raw_data["hyakuryu_skill"]["param"]:
            _, skill_id = TaggedId.split(record["id"])
            name = self.names.get(f"HyakuryuSkill_{skill_id:03d}_Name")
            if name is None:
                continue
            overwrite_flags = record["overwrite_flag_list"]
            rampage_skills.append({
                "id": skill_id,
                "name": name,
                "description": self.explanations.get(f"HyakuryuSkill_{skill_id:03d}_Explain") or "",
                "applyRule": record["apply_rule"],
                "attack": record["add_atk"],
                "affinity": record["add_critical_rate_list"][0],
                "defense": record["add_def_list"][0],
                "mainElement": record["add_main_element_val"],
                "subElement": record["add_sub_element_val"],
                "overwriteMainElement": self._overwrite(
                    overwrite_flags[self.MAIN_ELEMENT_TYPE_FLAG],
                    record["overwrite_main_element_type"], record["overwrite_main_element_val"]),
                "overwriteSubElement": self._overwrite(
                    overwrite_flags[self.SUB_ELEMENT_TYPE_FLAG],
                    record["overwrite_sub_element_type"], record["overwrite_sub_element_val"]),
            })
        return rampage_skills

    @staticmethod
    def _overwrite(is_enabled, element_type, element_value):
        if not is_enabled or element_type not in ELEMENT_NAMES:
            return None
        return {"type": ELEMENT_NAMES[element_type], "value": element_value}


class RampageDecorationExtractor:
    def __init__(self, raw_data):
        self.raw_data = raw_data
        self.names = MessageTable(raw_data, "hyakuryu_decos_name_msg")

    def extract(self):
        rampage_decorations = []
        for record in self.raw_data["hyakuryu_decos"]["param"]:
            _, decoration_number = TaggedId.split(record["id"])
            _, rampage_skill_id = TaggedId.split(record["hyakuryu_skill_id"])
            name = self.names.get(f"HyakuryuDeco_{decoration_number:03d}_Name")
            if name is None:
                continue
            rampage_decorations.append({
                "id": f"r{decoration_number}",
                "name": name,
                "slotLevel": record["decoration_lv"],
                "rarity": record["rare"],
                "rampageSkillId": rampage_skill_id,
                "weaponTypes": [
                    WEAPON_TYPES[type_index][0]
                    for type_index, is_allowed in enumerate(record["weapon_equip_flag"]) if is_allowed
                ],
            })
        return sorted(rampage_decorations, key=lambda decoration: decoration["name"])


class ArmorExtractor:
    def __init__(self, raw_data, valid_skill_ids, monster_material_index):
        self.raw_data = raw_data
        self.valid_skill_ids = valid_skill_ids
        self.monster_material_index = monster_material_index
        self.recipes_by_armor_id = {}
        for recipe in raw_data["armor_product"]["param"]:
            self.recipes_by_armor_id.setdefault(json.dumps(recipe["id"], sort_keys=True), []).append(recipe)
        self.series_names = MessageTable(raw_data, "armor_series_name_msg", "armor_series_name_msg_mr")
        self.part_names = {
            part_key: MessageTable(raw_data, message_section, message_section + "_mr")
            for part_key, (_, message_section) in ARMOR_PART_KEYS.items()
        }
        self.max_upgrade_bonus_by_table = self._build_upgrade_bonus_table()

    def _build_upgrade_bonus_table(self):
        """Total defense gained from level 1 to the final upgrade level of each buildup table."""
        rows_by_table = {}
        for row in self.raw_data["armor_buildup"]["param"]:
            rows_by_table.setdefault(row["table_type"], []).append(row)
        bonus_by_table = {}
        for table_type, rows in rows_by_table.items():
            total_bonus, previous_limit = 0, 1
            for row in sorted(rows, key=lambda table_row: table_row["limit_lv"]):
                total_bonus += max(0, row["limit_lv"] - previous_limit) * row["up_val"]
                previous_limit = max(previous_limit, row["limit_lv"])
            bonus_by_table[table_type] = total_bonus
        return bonus_by_table

    @staticmethod
    def _rank_for_rarity(rarity):
        if rarity <= 3:
            return "LR"
        if rarity <= 7:
            return "HR"
        return "MR"

    def extract(self):
        armor_pieces = []
        for record in self.raw_data["armor"]["param"]:
            if not record["is_valid"]:
                continue
            part_key, armor_number = TaggedId.split(record["pl_armor_id"])
            name = self.part_names[part_key].get(f"A_{part_key}_{armor_number:03d}_Name")
            if name is None:
                continue
            skills = [
                {"skillId": TaggedId.to_skill_id(skill_tag), "level": level}
                for skill_tag, level in zip(record["skill_list"], record["skill_lv_list"])
                if TaggedId.to_skill_id(skill_tag) in self.valid_skill_ids and level > 0
            ]
            series_id = record["series"]
            armor_pieces.append({
                "id": f"{part_key.lower()}{armor_number}",
                "type": ARMOR_PART_KEYS[part_key][0],
                "name": name,
                "seriesId": series_id,
                # Series names are keyed by the armor piece's own number, not its "series" field.
                "seriesName": self.series_names.get(f"ArmorSeries_Hunter_{armor_number:03d}") or "",
                "rarity": record["rare"],
                "rank": self._rank_for_rarity(record["rare"]),
                "defense": record["def_val"],
                "maxDefense": record["def_val"] + self.max_upgrade_bonus_by_table.get(record["buildup_table"], 0),
                "resistances": {
                    "fire": record["fire_reg_val"],
                    "water": record["water_reg_val"],
                    "thunder": record["thunder_reg_val"],
                    "ice": record["ice_reg_val"],
                    "dragon": record["dragon_reg_val"],
                },
                "slots": SlotList.from_counts(record["decorations_num_list"]),
                "skills": skills,
                "monsters": self.monster_material_index.monsters_for_recipes(
                    self.recipes_by_armor_id.get(json.dumps(record["pl_armor_id"], sort_keys=True), [])),
                "sortId": record["sort_id"],
            })
        return sorted(self._remove_gender_variants(armor_pieces),
                      key=lambda armor_piece: (armor_piece["rarity"], armor_piece["sortId"]))

    @staticmethod
    def _remove_gender_variants(armor_pieces):
        """Some armor exists as separate male/female records with identical stats; keep only the first."""
        seen_signatures = set()
        unique_armor_pieces = []
        for armor_piece in armor_pieces:
            signature = json.dumps({key: value for key, value in armor_piece.items()
                                    if key not in ("id", "seriesId", "sortId", "seriesName")}, sort_keys=True)
            if signature not in seen_signatures:
                seen_signatures.add(signature)
                unique_armor_pieces.append(armor_piece)
        return unique_armor_pieces


class WeaponExtractor:
    RECIPE_SECTIONS = ("product", "process")

    def __init__(self, raw_data, valid_rampage_skill_ids, monster_material_index):
        self.raw_data = raw_data
        self.valid_rampage_skill_ids = valid_rampage_skill_ids
        self.monster_material_index = monster_material_index

    def _recipes_by_weapon_number(self, section, id_tag):
        """Crafting and upgrade recipes of one weapon type, keyed by weapon number."""
        recipes_by_weapon_number = {}
        for recipe_section in self.RECIPE_SECTIONS:
            for recipe in section.get(recipe_section, {}).get("param", []):
                weapon_number = recipe["base"]["id"].get(id_tag)
                recipes_by_weapon_number.setdefault(weapon_number, []).append(recipe["base"])
        return recipes_by_weapon_number

    def extract(self):
        weapons = []
        for type_key, id_tag, _ in WEAPON_TYPES:
            section = self.raw_data[type_key]
            names = MessageTableFromSection(section, "name", "name_mr")
            recipes_by_weapon_number = self._recipes_by_weapon_number(section, id_tag)
            weapons_of_type = {}
            for record in section["base_data"]["param"]:
                flat_record = NestedRecord.flatten(record)
                weapon = self._build_weapon(type_key, id_tag, flat_record, names, recipes_by_weapon_number)
                if weapon is not None:
                    weapons_of_type[flat_record["id"][id_tag]] = weapon
            self._add_line_monsters(weapons_of_type, self._line_by_weapon_number(section, id_tag))
            self._inherit_monsters_from_upgrade_parents(weapons_of_type, self._parent_weapon_numbers(section, id_tag))
            weapons.extend(weapons_of_type.values())
        return weapons

    @staticmethod
    def _line_by_weapon_number(section, id_tag):
        """Weapon number -> its upgrade line (a "TreeType" row of the weapon tree)."""
        return {node["weapon_id"].get(id_tag): json.dumps(node["tree_type"]) for node in section["tree"]["param"]}

    @staticmethod
    def _add_line_monsters(weapons_by_number, line_by_weapon_number):
        """
        Tags weapons with the main monster of their upgrade line, so e.g. Wasserfallis (upgraded with
        Rakna-Kadaki parts) is still found under Royal Ludroth. A line only has a main monster when one
        monster appears in at least half of the line's weapons; ore lines that mix many monsters have none.
        Weapons whose recipes name no monster are left to inherit from their upgrade parent instead.
        """
        monster_counts_by_line = {}
        weapon_counts_by_line = {}
        for weapon_number, weapon in weapons_by_number.items():
            line = line_by_weapon_number.get(weapon_number)
            if line is None or not weapon["monsters"]:
                continue
            weapon_counts_by_line[line] = weapon_counts_by_line.get(line, 0) + 1
            line_counts = monster_counts_by_line.setdefault(line, {})
            for monster_name in weapon["monsters"]:
                line_counts[monster_name] = line_counts.get(monster_name, 0) + 1
        main_monster_by_line = {}
        for line, line_counts in monster_counts_by_line.items():
            main_monster = max(line_counts, key=lambda monster_name: line_counts[monster_name])
            if line_counts[main_monster] * 2 >= weapon_counts_by_line[line]:
                main_monster_by_line[line] = main_monster
        for weapon_number, weapon in weapons_by_number.items():
            main_monster = main_monster_by_line.get(line_by_weapon_number.get(weapon_number))
            if main_monster and weapon["monsters"] and main_monster not in weapon["monsters"]:
                weapon["monsters"].append(main_monster)

    @staticmethod
    def _parent_weapon_numbers(section, id_tag):
        """Weapon number -> number of the weapon it is upgraded from, using the weapon tree."""
        weapon_number_by_tree_position = {
            (json.dumps(node["tree_type"]), node["index"]): node["weapon_id"].get(id_tag)
            for node in section["tree"]["param"]
        }
        parent_numbers = {}
        for node in section["tree"]["param"]:
            parent_position = (json.dumps(node["prev_weapon_type"]), node["prev_weapon_index"])
            parent_number = weapon_number_by_tree_position.get(parent_position)
            if parent_number is not None:
                parent_numbers[node["weapon_id"].get(id_tag)] = parent_number
        return parent_numbers

    @staticmethod
    def _inherit_monsters_from_upgrade_parents(weapons_by_number, parent_numbers):
        """Upgrades made only from generic materials (e.g. anomaly "Afflicted" parts) keep their line's monster."""
        for weapon_number, weapon in weapons_by_number.items():
            ancestor_number = parent_numbers.get(weapon_number)
            visited_numbers = {weapon_number}
            while not weapon["monsters"] and ancestor_number is not None and ancestor_number not in visited_numbers:
                visited_numbers.add(ancestor_number)
                ancestor = weapons_by_number.get(ancestor_number)
                if ancestor and ancestor["monsters"]:
                    weapon["monsters"] = list(ancestor["monsters"])
                ancestor_number = parent_numbers.get(ancestor_number)

    def _build_weapon(self, type_key, id_tag, flat_record, names, recipes_by_weapon_number):
        weapon_number = flat_record["id"][id_tag]
        name = names.get(f"W_{id_tag}_{weapon_number:03d}_Name")
        if name is None or flat_record["atk"] <= 0:
            return None
        main_element_type = flat_record.get("main_element_type", "None")
        sub_element_type = flat_record.get("sub_element_type", "None")
        return {
            "id": f"{type_key}:{weapon_number}",
            "type": type_key,
            "name": name,
            "rarity": flat_record["rare_type"],
            "sortId": flat_record["sort_id"],
            "modelId": flat_record["model_id"],
            "attack": flat_record["atk"],
            "affinity": flat_record["critical_rate"],
            "defenseBonus": flat_record["def_bonus"],
            "element": self._element(main_element_type, flat_record.get("main_element_val", 0)),
            "subElement": self._element(sub_element_type, flat_record.get("sub_element_val", 0)),
            "sharpness": flat_record.get("sharpness_val_list"),
            "handicraft": flat_record.get("takumi_val_list"),
            "slots": SlotList.from_counts(flat_record["slot_num_list"]),
            "rampageSlots": SlotList.from_counts(flat_record["hyakuryu_slot_num_list"]),
            "rampageSkills": [
                skill_id for skill_id in (TaggedId.split(tag)[1] for tag in flat_record["hyakuryu_skill_id_list"])
                if skill_id in self.valid_rampage_skill_ids
            ],
            "traits": WeaponTraitDescriber.describe(flat_record),
            "monsters": self.monster_material_index.monsters_for_recipes(recipes_by_weapon_number.get(weapon_number, [])),
        }

    @staticmethod
    def _element(element_type, element_value):
        if element_type not in ELEMENT_NAMES or element_value <= 0:
            return None
        return {"type": ELEMENT_NAMES[element_type], "value": element_value}


class MessageTableFromSection(MessageTable):
    """MessageTable variant for weapon sections, whose messages live inside the weapon type's own dict."""

    def __init__(self, section, *message_keys):
        self.text_by_entry_name = {}
        for message_key in message_keys:
            for entry in section.get(message_key, {}).get("entries", []):
                self.text_by_entry_name[entry["name"]] = entry["content"][ENGLISH_LANGUAGE_INDEX]


class WeaponTraitDescriber:
    """Produces human-readable weapon-type specific traits (phials, shelling, kinsect level, ...)."""

    @staticmethod
    def describe(flat_record):
        traits = []
        if "gun_lance_fire_type" in flat_record:
            traits.append({"label": "Shelling", "value": f"{flat_record['gun_lance_fire_type']} Lv {flat_record['gun_lance_fire_lv']}"})
        if "charge_axe_bottle_type" in flat_record:
            traits.append({"label": "Phial", "value": PHIAL_NAMES.get(flat_record["charge_axe_bottle_type"], flat_record["charge_axe_bottle_type"])})
        if "slash_axe_bottle_type" in flat_record:
            phial_name = PHIAL_NAMES.get(flat_record["slash_axe_bottle_type"], flat_record["slash_axe_bottle_type"])
            phial_value = flat_record.get("slash_axe_bottle_element_val", 0)
            traits.append({"label": "Phial", "value": f"{phial_name} {phial_value}" if phial_value else phial_name})
        if "insect_glaive_insect_lv" in flat_record:
            traits.append({"label": "Kinsect Level", "value": str(flat_record["insect_glaive_insect_lv"])})
        if "reload" in flat_record:
            traits.append({"label": "Reload", "value": str(flat_record["reload"])})
            traits.append({"label": "Recoil", "value": str(flat_record["recoil"])})
            traits.append({"label": "Deviation", "value": str(flat_record["fluctuation"])})
        if "bow_charge_type_list" in flat_record:
            charge_shots = [charge for charge in flat_record["bow_charge_type_list"] if charge != "None"]
            traits.append({"label": "Charge Shots", "value": ", ".join(charge_shots)})
            traits.append({"label": "Arc Shot", "value": flat_record["bow_curve_type"]})
        return traits


class GameDataBuilder:
    def __init__(self, raw_data):
        self.raw_data = raw_data

    def build(self):
        skills = SkillExtractor(self.raw_data).extract()
        valid_skill_ids = {skill["id"] for skill in skills}
        rampage_skills = RampageSkillExtractor(self.raw_data).extract()
        valid_rampage_skill_ids = {rampage_skill["id"] for rampage_skill in rampage_skills}
        monster_material_index = MonsterMaterialIndex(self.raw_data)
        return {
            "weaponTypes": [{"key": type_key, "name": display_name} for type_key, _, display_name in WEAPON_TYPES],
            "skills": skills,
            "decorations": DecorationExtractor(self.raw_data, valid_skill_ids).extract(),
            "rampageSkills": rampage_skills,
            "rampageDecorations": RampageDecorationExtractor(self.raw_data).extract(),
            "armor": ArmorExtractor(self.raw_data, valid_skill_ids, monster_material_index).extract(),
            "weapons": WeaponExtractor(self.raw_data, valid_rampage_skill_ids, monster_material_index).extract(),
        }


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: python extract_data.py <mhrice.json> <output.json>")
    input_path, output_path = sys.argv[1], sys.argv[2]
    open_input = lzma.open if input_path.endswith(".xz") else open
    with open_input(input_path, "rt", encoding="utf-8") as input_file:
        raw_data = json.load(input_file)
    game_data = GameDataBuilder(raw_data).build()
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(game_data, output_file, ensure_ascii=False, separators=(",", ":"))
    summary = ", ".join(f"{key}: {len(value)}" for key, value in game_data.items())
    print(f"Wrote {output_path} ({summary})")


if __name__ == "__main__":
    main()
