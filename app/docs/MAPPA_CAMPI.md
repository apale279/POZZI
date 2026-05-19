# Mappa campi ECMO + ACC — scenari paziente e sovrapposizioni

Documento generato dall’analisi **completa** di:
- `DB VENOARTERIOSI CARDIO (1).xlsx` — **21 fogli**, **440 colonne** (escl. Unnamed)
- `Nuovo DB ACC (2).xlsx` — **10 fogli utili** (+ PIVOT vuoto), **424 colonne**

**Totale celle-colonna mappate:** 864  
**Concetti canonici unici:** 362  
**Concetti presenti in entrambi i DB:** 36  

Tabella master (ogni riga = un campo in un foglio):  
`app/docs/field_mapping_master.csv` (apri in Excel)

---

## 1. I tre scenari che hai descritto (logica dati)

| Scenario | Arruolamenti | Cosa si compila in app | Cosa va in export |
|----------|--------------|------------------------|-------------------|
| **A. Solo ACC** | `enrollment.acc` | Anagrafica + Anamnesi + Pre-H + PS + Ammissione + 6–12h + DAY 1–3 + Outcome | Solo righe **ACC** |
| **B. Solo ECMO** | `enrollment.ecmo` | Anagrafica ECMO + **RUN 1** (+ RUN 2…) + moduli per run | Solo righe **ECMO** (ogni foglio con colonna **RUN**) |
| **C. ACC poi ECMO** (es. shock cardiogeno) | `acc` + `ecmo` (date diverse) | Prima timepoint ACC; poi **nuovo blocco ECMO** con `run_number=1` (o 2 se re-ECMO) | ACC (fino al DAY x già fatto) + ECMO (nuovi fogli RUN) |
| **D. ECMO multiplo** | `ecmo` | Stesso paziente, **RUN=1, RUN=2, …** — ogni run ha set fogli ECMO | Ogni export ECMO include **RUN**; fogli ripetuti (Equipment, 24h, …) **per run** |

**Regole:**
- **ACC** non ha colonna RUN → un episodio ACC = una sequenza temporale (arresto → DAY 3).
- **ECMO** ha **RUN** su 16 fogli → stesso SDO può generare **più righe** su PROCEDURES, COMPLICANZE, ecc.
- **ECMO dopo ACC:** i fogli ACC **non** si aggiornano da soli; si apre un **nuovo percorso ECMO** (non confondere DAY 1 ACC con 24h ECMO run 1).

---

## 2. Modello raccolta unificata (target interfaccia)

```
Paziente (1×)
├── enrollment ACC?  → episodio ACC
│     ├── Anamnesi, Pre-H, PS (1×)
│     └── timepoint: Ammissione | 6-12h | DAY1 | DAY2 | DAY3 (ripetibile)
├── enrollment ECMO? → run 1, run 2, …
│     └── per ogni RUN: Diagnosi, 24h, Equipment, Procedures[], …
└── Osservazioni condivise (gasometria, peso, …) → fan-out verso fogli target
```

**Ingresso dati (screenshot / testo):** compila `Osservazione` → l’app propone → tu confermi → **export** verso tutte le celle `db_target` collegate.

---

## 3. Inventario fogli

### ECMO (21 fogli)

| Foglio | Granularità | Colonne | Note export |
|--------|-------------|---------|-------------|
| ANAGRAFICA | 1× paziente | 27 | Identità + ingresso OSP/ICU |
| RUN | **per RUN** | 15 | Inizio/fine/mode ECMO |
| EQUIPMENT | per RUN (anche multi-riga) | 15 | Cambi circuito |
| DIAGNOSI | per RUN | 11 | |
| CANNULA | per RUN (fino a 2 righe) | 13 | |
| PROCEDURES | per RUN (**molte righe**) | 11 | Eventi ripetuti |
| PRE-ECLS ASSESSMENT | per RUN | 38 | |
| PRE-ECLS SUPPORT | per RUN | 8 | |
| ECLS CARE | per RUN | 13 | |
| 24HRS ECLS ASSESSMENT | per RUN | 43 | Gasometria + emodinamica |
| COMPLICANZE | per RUN (multi-riga) | 10 | |
| INFEZIONI | per RUN (multi-riga) | 12 | |
| OUTCOME | per RUN | 28 | |
| CARDIAC SURGERY PROCEDURES | per RUN | 15 | |
| CARDIAC | per RUN | 53 | |
| CATH DURING ECMO | per RUN | 18 | |
| ECPR_ANAMNESI | per RUN (se ECPR) | 17 | |
| ECPR ACC | per RUN | 34 | **Overlap arresto con ACC Pre-H** |
| ECPR INCANULAMENTO | per RUN | 27 | |
| ECPR 24HRS | per RUN | 12 | |
| TENDINE SLIM | ausiliario | 10 | |

### ACC (10 fogli + PIVOT)

| Foglio | Granularità | Colonne | Note |
|--------|-------------|---------|------|
| Anagrafica | 1× paziente | 12 | Overlap demografici ECMO |
| Anamnesi | 1× episodio | 33 | Comorbidità, ASA, … |
| Pre-H | 1× episodio | 16 | Arresto, CPR, luogo |
| PS | 1× episodio | 26 | Causa, lab precoce, eCPR |
| Ammissione | timepoint | 50 | EGA + lab + vent |
| 6 - 12H | timepoint | 59 | + neuro (GCS, NPI) |
| DAY 1 | timepoint | 63 | + SAPS-II |
| DAY 2 | timepoint | 59 | |
| DAY 3 | timepoint | 59 | |
| Outcome | 1× episodio | 36 | CPC, TC/RMN, infezioni |

---

## 4. Tabella sovrapposizioni ECMO ↔ ACC (36 concetti)

Legenda **Raccolta:** `1×` = un inserimento in app copia su tutte le celle elencate; `RUN` = ripetuto per ogni ECMO; `TP` = ripetuto per ogni timepoint ACC scelto.

| ID concetto | Significato clinico | Dove ECMO (esempi) | Dove ACC (esempi) | N° celle | Raccolta |
|-------------|---------------------|--------------------|-------------------|----------|----------|
| `patient.sdo` | ID ospedale | Tutti i 20 fogli ECMO | Tutti i 10 fogli ACC | 30 | 1× identità |
| `patient.cognome` | Cognome | idem | idem | 30 | 1× |
| `patient.nome` | Nome | idem | idem | 30 | 1× |
| `study.year` | Anno studio | 20 fogli ECMO | Anagrafica | 21 | 1× |
| `patient.dn` | Data nascita | ANAGRAFICA | Anagrafica, Outcome | 3 | 1× |
| `patient.sex` | Sesso | SEX | GENDER | 2 | 1× |
| `patient.weight` | Peso | PESO | PESO | 2 | 1× |
| `patient.height` | Altezza | ALTEZZA | ALTEZZA | 2 | 1× |
| `patient.phone` | Telefono | TEL | TEL | 2 | 1× |
| `patient.email` | Email | MAIL | MAIL | 2 | 1× |
| `patient.age` | Età | ANNI | AGE | 2 | 1× |
| `blood_gas.ph` | pH | pH (PRE-ECLS, 24h, ECPR) | EGA - pH (Ammissione–DAY3) | 8 | 1× → fan-out TP + RUN |
| `blood_gas.pao2` | PaO₂ | pO2 | EGA - PaO2 | 8 | idem |
| `blood_gas.paco2` | PaCO₂ | pCO2 | EGA - PaCO2 | 8 | idem |
| `blood_gas.hco3` | HCO₃ | HCO3- | HCO3 | 8 | idem |
| `blood_gas.be` | BE | BE | BE | 8 | idem |
| `blood_gas.lactate` | Lattato | Lac | LAC (PS, Amm–DAY3) | 9 | idem |
| `blood_gas.sao2` | SatO₂ | O2Hb | SO2 / EGA-SO2 | 8 | idem |
| `lab.ht` | Ematocrito | HT | HT/Ht | 8 | idem |
| `lab.hb` | Hb | Hb | Hb/HB | 9 | idem |
| `vent.peep` | PEEP | PEEP | PEEP | 7 | 1× → fan-out |
| `vent.tv` | Volume corrente | TV | VT | 7 | idem |
| `vent.rr` | Frequenza | RR (+ FR su CANNULA) | FR | 8 | idem |
| `vent.pplat` | Pplat | Pplat | PLAT/Plateau | 7 | idem |
| `vent.mode` | Modalità vent | TYPE | MOD VENT | 7 | idem |
| `blood_gas.fio2` | FiO₂ | FiO2 (24h) | EGA-FIO2 | 6 | Attenzione: anche FiO2 ECMO su Ammissione |
| `outcome.icu_discharge` | Dimissione ICU | DATA/TIME/LOCATION ICU | ALIVE + DATE ICU | 5 | A fine percorso |
| `outcome.donation` | Donazione | ORGANI/TESSUTI | DONATION | 4 | idem |
| `outcome.cpc_discharge` | CPC dimissione | CPC DISCHARGE | CPC AT DISCHARGE | 2 | idem |
| `outcome.death_date` | Data morte | DATA DECESSO | DATE OF DEATH | 2 | idem |
| `unique.TESTIMONIATO` | Testimoni arresto | ECPR ACC | Pre-H | 2 | 1× se ECPR+ACC |
| `unique.RITMO` | Ritmo arresto | ECPR ACC | Pre-H | 2 | idem |
| `unique.CITTA` / `INDIRIZZO` / `PIANO` / `TRASPORTO` | Luogo arresto | ECPR ACC | Pre-H | 2 ciasc. | idem |

**Non sovrapposti (solo ECMO):** emodinamica invasiva (PAS/PAD/PAM, CO, PAOP, PAP, CI, SvO₂), bilancio 4h/24h, RUN, ELSO/LENS, PROCEDURES, COMPLICANZE, CARDIAC*, ecc.

**Non sovrapposti (solo ACC):** SAPS-II, GCS, NPI, enolasi, comorbidità Anamnesi, outcome TC/RMN a 1–12 mesi, CAUSA ACC, ecc.

---

## 5. Matrice scenario × tipo dato

| Tipo dato | Solo ACC | Solo ECMO | ACC → ECMO | ECMO ×2 run |
|-----------|----------|-----------|------------|-------------|
| Anagrafica | ACC Anagrafica | ECMO ANAGRAFICA | **Unificare** → export entrambi | ECMO ANAGRAFICA (1×) |
| Arresto / Pre-H | Pre-H, PS | ECPR ACC (se ECPR) | Pre-H **non** duplicare in RUN | ECPR per run ECPR |
| Gasometria giorno 1 | DAY 1 | 24h RUN **≠** DAY 1 ACC | Due timepoint distinti | 24h per **ogni** RUN |
| Outcome | Outcome ACC | OUTCOME ECMO | Due outcome separati | OUTCOME per RUN |
| Procedures | — | PROCEDURES (N righe) | — | Per RUN |

---

## 6. Prossimo passo interfaccia

1. **Paziente** → flag `solo ACC` / `solo ECMO` / `entrambi` + data inizio ECMO se dopo ACC.  
2. **Osservazioni** (incolla / screenshot) → tabella sopra decide i target.  
3. **Export** → una riga per `(studio, foglio [, RUN])` come in `field_mapping_master.csv`.

Per rigenerare la mappa dopo modifica Excel:
```bash
python app/scripts/build_field_mapping.py
```
