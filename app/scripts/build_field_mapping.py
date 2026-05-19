"""Genera mappa master campi ECMO + ACC da file Excel originali."""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

BASE = Path(r"c:\App_mie\ECMO")
ECMO_FILE = BASE / "DB VENOARTERIOSI CARDIO (1).xlsx"
ACC_FILE = BASE / "Nuovo DB ACC (2).xlsx"
OUT_DIR = BASE / "app" / "docs"


def norm_concept(col: str) -> str:
    s = str(col).upper().strip()
    s = re.sub(r"\s+", " ", s)
    aliases = {
        "SDO": "patient.sdo",
        "COGNOME": "patient.cognome",
        "NOME": "patient.nome",
        "DN": "patient.dn",
        "SEX": "patient.sex",
        "GENDER": "patient.sex",
        "PESO": "patient.weight",
        "ALTEZZA": "patient.height",
        "ALTEZZA ": "patient.height",
        "HT": "lab.ht",
        "HB": "lab.hb",
        "AGE": "patient.age",
        "ANNI": "patient.age",
        "TEL": "patient.phone",
        "MAIL": "patient.email",
        "BMI": "patient.bmi",
        "NUMERO ELSO": "ecmo.elso_id",
        "ELSO": "ecmo.elso_id",
        "ECMO LENS": "ecmo.lens_id",
        "RUN": "ecmo.run_number",
        "ANNO": "study.year",
    }
    if s in aliases:
        return aliases[s]
    if "EGA - PH" in s or s == "PH":
        return "blood_gas.ph"
    if "PAO2" in s or s == "PO2":
        return "blood_gas.pao2"
    if "PACO2" in s or s == "PCO2":
        return "blood_gas.paco2"
    if "FIO2" in s and "ECMO" not in s:
        return "blood_gas.fio2"
    if s == "P/F":
        return "blood_gas.pf_ratio"
    if "HCO3" in s:
        return "blood_gas.hco3"
    if s == "BE":
        return "blood_gas.be"
    if s in ("LAC", "LACTATE"):
        return "blood_gas.lactate"
    if s in ("SO2", "O2HB") or "EGA - SO2" in s:
        return "blood_gas.sao2"
    if s == "PEEP":
        return "vent.peep"
    if s in ("VT", "TV"):
        return "vent.tv"
    if s in ("FR", "RR"):
        return "vent.rr"
    if s in ("PLAT", "PPLAT", "PLATEAU"):
        return "vent.pplat"
    if s in ("PICCO", "PPIKO", "PICO"):
        return "vent.ppeak"
    if s == "PMEDIE":
        return "vent.pmean"
    if s == "CRS":
        return "vent.compliance"
    if "MOD VENT" in s or s == "TYPE":
        return "vent.mode"
    if s == "PAS":
        return "hemo.pas"
    if s == "PAD":
        return "hemo.pad"
    if s == "PAM":
        return "hemo.pam"
    if s == "CO":
        return "hemo.co"
    if s == "CI":
        return "hemo.ci"
    if s == "SVO2":
        return "hemo.svo2"
    if s == "PAOP":
        return "hemo.paop"
    if s in ("PAPS", "PAPs"):
        return "hemo.paps"
    if s in ("PAPD", "PAPd"):
        return "hemo.papd"
    if s in ("PAPM", "PAPm"):
        return "hemo.papm"
    if s == "NA":
        return "lab.na"
    if s == "K":
        return "lab.k"
    if s == "CA":
        return "lab.ca"
    if s == "CL":
        return "lab.cl"
    if s == "CREA":
        return "lab.creatinine"
    if s == "WBC":
        return "lab.wbc"
    if s == "PLT":
        return "lab.plt"
    if s == "INR":
        return "lab.inr"
    if "PTT" in s:
        return "lab.ptt"
    if s == "PCR":
        return "lab.pcr"
    if s == "PCT":
        return "lab.pct"
    if s == "GLU":
        return "lab.glucose"
    if "CPC" in s and "DISCHARGE" in s:
        return "outcome.cpc_discharge"
    if "DATE OF DEATH" in s or "DATA DECESSO" in s:
        return "outcome.death_date"
    if "ICU DISCHARGE" in s or "DIMISSIONE ICU" in s:
        return "outcome.icu_discharge"
    if "DONATION" in s or "DONAZIONE" in s:
        return "outcome.donation"
    if s == "EXITUS":
        return "outcome.exitus"
    if "TEMPERATURA" in s:
        return "vitals.temp"
    if "GCS" in s:
        return "neuro.gcs"
    if "ENOLASI" in s:
        return "neuro.enolase"
    if "NPI" in s:
        return "neuro.npi"
    slug = re.sub(r"[^A-Z0-9]+", "_", s)[:60].strip("_")
    return f"unique.{slug}"


def sheet_granularity(study: str, sheet: str) -> str:
    if sheet in ("ANAGRAFICA", "Anagrafica"):
        return "patient_once"
    if sheet == "RUN":
        return "ecmo_run_header"
    if sheet in ("Anamnesi", "Pre-H", "PS"):
        return "acc_episode_once"
    if sheet == "Ammissione":
        return "acc_timepoint_admission"
    if sheet == "6 - 12H":
        return "acc_timepoint_h6_12"
    if sheet.startswith("DAY"):
        return f"acc_timepoint_{sheet.replace(' ', '_').lower()}"
    if sheet in ("Outcome", "OUTCOME"):
        return "study_outcome"
    if "ECPR" in sheet:
        return "ecmo_ecpr_module"
    if sheet in ("PROCEDURES", "COMPLICANZE", "INFEZIONI", "CANNULA", "EQUIPMENT"):
        return "ecmo_run_repeatable"
    if sheet == "TENDINE SLIM":
        return "ecmo_auxiliary"
    if sheet == "PIVOT":
        return "skip"
    if study == "ECMO":
        return "ecmo_run_once"
    return "acc_other"


def infer_scenarios(gran: str, concept: str) -> str:
    if concept.startswith("patient."):
        return "Tutti: solo ACC | solo ECMO | entrambi"
    if gran == "ecmo_run_header":
        return "Ogni run ECMO (run 1, 2, …); anche ECMO dopo ACC"
    if gran in ("ecmo_run_once", "ecmo_run_repeatable"):
        return "Per ogni RUN ECMO attivo; shock post-ACC = nuovo run"
    if gran == "ecmo_ecpr_module":
        return "Se ECPR; può coesistere con ACC (arresto)"
    if gran.startswith("acc_timepoint"):
        return "Solo se arruolato ACC; indipendente da ECMO successivo"
    if gran == "acc_episode_once":
        return "Una volta per episodio ACC"
    if gran == "study_outcome":
        return "A chiusura per studio (ECMO run o episodio ACC)"
    return "Vedi foglio"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []

    for study, path in [("ECMO", ECMO_FILE), ("ACC", ACC_FILE)]:
        xl = pd.ExcelFile(path)
        for sheet in xl.sheet_names:
            gran = sheet_granularity(study, sheet)
            if gran == "skip":
                continue
            cols = list(pd.read_excel(path, sheet_name=sheet, nrows=0).columns)
            for col in cols:
                c = str(col)
                if c.startswith("Unnamed"):
                    continue
                concept = norm_concept(c)
                rows.append(
                    {
                        "canonical_id": concept,
                        "column_excel": c,
                        "sheet": sheet,
                        "study": study,
                        "granularity": gran,
                        "db_target": f"{study} → {sheet} → {c}",
                    }
                )

    by_concept: dict[str, list] = defaultdict(list)
    for r in rows:
        by_concept[r["canonical_id"]].append(r)

    enriched = []
    for r in rows:
        peers = by_concept[r["canonical_id"]]
        studies = {p["study"] for p in peers}
        enriched.append(
            {
                **r,
                "in_ecmo": "ECMO" in studies,
                "in_acc": "ACC" in studies,
                "overlap_ecmo_acc": len(studies) > 1,
                "occurrence_count": len(peers),
                "all_db_targets": " || ".join(
                    sorted({p["db_target"] for p in peers})
                ),
                "patient_scenarios": infer_scenarios(r["granularity"], r["canonical_id"]),
                "unified_collection": (
                    "UNIFICARE (1 inserimento)"
                    if len(studies) > 1 and not r["canonical_id"].startswith("unique.")
                    else (
                        "UNIFICARE se stesso episodio"
                        if r["canonical_id"].startswith("patient.")
                        else "PER STUDIO/FOGLIO"
                    )
                ),
            }
        )

    csv_path = OUT_DIR / "field_mapping_master.csv"
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(enriched[0].keys()))
        w.writeheader()
        w.writerows(enriched)

    overlaps = [
        cid
        for cid, ps in by_concept.items()
        if len({p["study"] for p in ps}) > 1
    ]

    summary = {
        "total_column_cells": len(enriched),
        "ecmo_columns": sum(1 for r in enriched if r["study"] == "ECMO"),
        "acc_columns": sum(1 for r in enriched if r["study"] == "ACC"),
        "ecmo_sheets": list(pd.ExcelFile(ECMO_FILE).sheet_names),
        "acc_sheets": list(pd.ExcelFile(ACC_FILE).sheet_names),
        "unique_canonical_concepts": len(by_concept),
        "overlapping_concepts_ecmo_acc": len(overlaps),
    }
    (OUT_DIR / "mapping_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # overlap detail json
    overlap_detail = []
    for cid in sorted(overlaps, key=lambda x: (-len(by_concept[x]), x)):
        ps = by_concept[cid]
        overlap_detail.append(
            {
                "canonical_id": cid,
                "count": len(ps),
                "ecmo_targets": [p["db_target"] for p in ps if p["study"] == "ECMO"],
                "acc_targets": [p["db_target"] for p in ps if p["study"] == "ACC"],
            }
        )
    (OUT_DIR / "overlap_detail.json").write_text(
        json.dumps(overlap_detail, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(json.dumps(summary, indent=2))
    print("CSV:", csv_path)


if __name__ == "__main__":
    main()
