"""Verifica Excel vs schemi app e genera JSON per ingest + preview destinazioni."""
import csv
import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

BASE = Path(r"c:\App_mie\ECMO")
ECMO_FILE = BASE / "DB VENOARTERIOSI CARDIO (1).xlsx"
ACC_FILE = BASE / "Nuovo DB ACC (2).xlsx"
WEB_DATA = BASE / "app" / "web" / "src" / "data"
CSV_PATH = BASE / "app" / "docs" / "field_mapping_master.csv"


def read_excel_columns():
    out = {"ecmo": {}, "acc": {}}
    for key, path in [("ecmo", ECMO_FILE), ("acc", ACC_FILE)]:
        xl = pd.ExcelFile(path)
        for sheet in xl.sheet_names:
            cols = [
                str(c)
                for c in pd.read_excel(path, sheet_name=sheet, nrows=0).columns
                if not str(c).startswith("Unnamed")
            ]
            out[key][sheet] = cols
    return out


def read_app_schemas():
    web = BASE / "app" / "web" / "src" / "export-schemas"
    return {
        "ecmo": json.loads((web / "ecmo.json").read_text(encoding="utf-8")),
        "acc": json.loads((web / "acc.json").read_text(encoding="utf-8")),
    }


def main():
    excel = read_excel_columns()
    schemas = read_app_schemas()
    errors = []
    for study in ("ecmo", "acc"):
        for sheet, cols in excel[study].items():
            app_cols = schemas[study].get(sheet, [])
            if cols != app_cols:
                missing = set(cols) - set(app_cols)
                extra = set(app_cols) - set(cols)
                if missing or extra:
                    errors.append(
                        {
                            "study": study,
                            "sheet": sheet,
                            "missing_in_app": sorted(missing),
                            "extra_in_app": sorted(extra),
                        }
                    )

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8-sig")))
    by_canonical = defaultdict(list)
    for r in rows:
        by_canonical[r["canonical_id"]].append(
            {
                "study": r["study"],
                "sheet": r["sheet"],
                "column": r["column_excel"],
                "db_target": r["db_target"],
                "granularity": r["granularity"],
            }
        )

    # colonne per foglio (destinazioni)
    sheet_columns = {"ecmo": excel["ecmo"], "acc": excel["acc"]}

    # Target estrazione per UI medico
    ingest_targets = [
        {
            "id": "acc_ammissione",
            "label": "ACC — Ammissione in TI",
            "study": "acc",
            "sheet": "Ammissione",
            "description": "Primo accesso TI post-arresto",
        },
        {
            "id": "acc_h6_12",
            "label": "ACC — Valutazione 6–12 ore",
            "study": "acc",
            "sheet": "6 - 12H",
        },
        {
            "id": "acc_day1",
            "label": "ACC — DAY 1",
            "study": "acc",
            "sheet": "DAY 1",
        },
        {
            "id": "acc_day2",
            "label": "ACC — DAY 2",
            "study": "acc",
            "sheet": "DAY 2",
        },
        {
            "id": "acc_day3",
            "label": "ACC — DAY 3",
            "study": "acc",
            "sheet": "DAY 3",
        },
        {
            "id": "acc_ps",
            "label": "ACC — Pronto soccorso (PS)",
            "study": "acc",
            "sheet": "PS",
        },
        {
            "id": "acc_preh",
            "label": "ACC — Pre-ospedalizzazione (Pre-H)",
            "study": "acc",
            "sheet": "Pre-H",
        },
        {
            "id": "acc_anamnesi",
            "label": "ACC — Anamnesi",
            "study": "acc",
            "sheet": "Anamnesi",
        },
        {
            "id": "acc_outcome",
            "label": "ACC — Outcome",
            "study": "acc",
            "sheet": "Outcome",
        },
        {
            "id": "ecmo_pre_ecls",
            "label": "ECMO — Pre-ECLS (prima del supporto)",
            "study": "ecmo",
            "sheet": "PRE-ECLS ASSESSMENT",
            "requiresRun": True,
        },
        {
            "id": "ecmo_24h",
            "label": "ECMO — Valutazione 24 ore dal supporto",
            "study": "ecmo",
            "sheet": "24HRS ECLS ASSESSMENT",
            "requiresRun": True,
        },
        {
            "id": "ecmo_ecls_care",
            "label": "ECMO — ECLS care",
            "study": "ecmo",
            "sheet": "ECLS CARE",
            "requiresRun": True,
        },
        {
            "id": "ecmo_ecpr_incan",
            "label": "ECMO — ECPR incanulamento",
            "study": "ecmo",
            "sheet": "ECPR INCANULAMENTO",
            "requiresRun": True,
        },
        {
            "id": "ecmo_outcome",
            "label": "ECMO — Outcome",
            "study": "ecmo",
            "sheet": "OUTCOME",
            "requiresRun": True,
        },
    ]

    # parsed key -> column per sheet (subset clinico)
    parse_column_map = build_parse_column_map()

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "field_mapping_by_canonical.json").write_text(
        json.dumps(dict(by_canonical), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (WEB_DATA / "sheet_columns.json").write_text(
        json.dumps(sheet_columns, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (WEB_DATA / "ingest_targets.json").write_text(
        json.dumps(ingest_targets, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (WEB_DATA / "parse_column_map.json").write_text(
        json.dumps(parse_column_map, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (WEB_DATA / "verify_report.json").write_text(
        json.dumps(
            {
                "excel_ecmo_sheets": len(excel["ecmo"]),
                "excel_acc_sheets": len(excel["acc"]),
                "mapped_rows": len(rows),
                "schema_mismatches": errors,
                "ok": len(errors) == 0,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print("OK" if not errors else "MISMATCHES", len(errors))
    for e in errors[:5]:
        print(e)
    print("Wrote JSON to", WEB_DATA)


def build_parse_column_map():
    """parseKey -> { targetId: columnName } per fogli clinici frequenti."""
    acc_maps = {
            "acc_ammissione": {
                "ph": "EGA - pH", "pao2": "EGA - PaO2", "paco2": "EGA - PaCO2",
                "fio2": "EGA -FIO2", "hco3": "HCO3", "be": "BE", "lactate": "LAC",
                "hb": "HB", "ht": "Ht", "sao2": "EGA - SO2", "peep": "PEEP", "tv": "VT", "rr": "FR", "temp": "TEMPERATURA CORPOREA",
            },
            "acc_h6_12": {
                "ph": "EGA - pH", "pao2": "EGA - PaO2", "paco2": "EGA - PaCO2",
                "fio2": "EGA -FIO2", "hco3": "HCO3", "be": "BE", "lactate": "LAC",
                "hb": "HB", "ht": "HT", "sao2": "SO2", "peep": "PEEP", "tv": "VT", "rr": "FR", "temp": "TEMPERATURA CORPOREA",
            },
            "acc_day1": {
                "ph": "EGA - pH", "pao2": "EGA - PaO2", "paco2": "EGA - PaCO2",
                "fio2": "EGA -FIO2", "hco3": "HCO3", "be": "BE", "lactate": "LAC",
                "hb": "Hb", "ht": "HT", "sao2": "SO2", "peep": "PEEP", "tv": "VT", "rr": "FR", "temp": "TEMPERATURA CORPOREA",
            },
            "acc_day2": {
                "ph": "EGA - pH", "pao2": "EGA - PaO2", "paco2": "EGA - PaCO2",
                "fio2": "EGA -FIO2", "hco3": "HCO3", "be": "BE", "lactate": "LAC",
                "hb": "HB", "ht": "HT", "sao2": "SO2", "peep": "PEEP", "tv": "VT", "rr": "FR",
            },
            "acc_day3": {
                "ph": "EGA - pH", "pao2": "EGA - PaO2", "paco2": "EGA - PaCO2",
                "fio2": "EGA -FIO2", "hco3": "HCO3", "be": "BE", "lactate": "LAC",
                "hb": "HB", "ht": "HT", "sao2": "SO2", "peep": "PEEP", "tv": "VT", "rr": "FR",
            },
            "acc_ps": {"hb": "HB", "lactate": "LAC", "creat": "CREA"},
    }

    ecmo_maps = {
        "ecmo_pre_ecls": {
            "ph": "pH", "pao2": "pO2", "paco2": "pCO2", "hco3": "HCO3-", "be": "BE",
            "lactate": "Lac", "hb": "Hb", "ht": "HT", "sao2": "O2Hb", "peep": "PEEP", "tv": "TV", "rr": "RR",
        },
        "ecmo_24h": {
            "ph": "pH", "pao2": "pO2", "paco2": "pCO2", "hco3": "HCO3-", "be": "BE",
            "lactate": "Lac", "hb": "Hb", "ht": "HT", "sao2": "O2Hb", "fio2": "FiO2",
            "peep": "PEEP", "tv": "TV", "rr": "RR", "pam": "PAM", "pas": "PAS", "pad": "PAD",
        },
        "ecmo_ecpr_incan": {
            "ph": "pH", "pao2": "pO2", "paco2": "pCO2", "hco3": "HCO3-", "be": "BE",
            "lactate": "Lac", "hb": "Hb", "ht": "HT", "sao2": "O2Hb",
        },
    }

    out: dict[str, dict[str, str]] = {}
    for group in (acc_maps, ecmo_maps):
        for target_id, cols in group.items():
            for pk, col in cols.items():
                out.setdefault(pk, {})[target_id] = col
    return out


if __name__ == "__main__":
    main()
