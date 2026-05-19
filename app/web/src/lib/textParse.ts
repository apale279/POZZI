/** Estrazione euristica da testo incollato (Innovian / Galileo / referto). */

import type { BloodGas } from '../types/canonical'

export interface ParsedClinicalText {
  values: Record<string, string | number>
  matched: string[]
}

const RULES: { key: string; patterns: RegExp[] }[] = [
  { key: 'ph', patterns: [/\bpH\s*[:=]?\s*([\d,.]+)/i, /\bpH\s+([\d,.]+)/i] },
  { key: 'pao2', patterns: [/\bPaO2\s*[:=]?\s*([\d,.]+)/i, /\bpO2\s*[:=]?\s*([\d,.]+)/i, /\bPO2\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'paco2', patterns: [/\bPaCO2\s*[:=]?\s*([\d,.]+)/i, /\bpCO2\s*[:=]?\s*([\d,.]+)/i, /\bPCO2\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'hco3', patterns: [/\bHCO3[-\s]*[:=]?\s*([\d,.]+)/i, /\bBicarbonat\w*\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'be', patterns: [/\bBE\s*[:=]?\s*([-\d,.]+)/i, /\bEccesso\s+di\s+basi\s*[:=]?\s*([-\d,.]+)/i] },
  { key: 'lactate', patterns: [/\bLattato\s*[:=]?\s*([\d,.]+)/i, /\bLac\s*[:=]?\s*([\d,.]+)/i, /\bLAC\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'hb', patterns: [/\bHb\s*[:=]?\s*([\d,.]+)/i, /\bEmoglobina\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'ht', patterns: [/\bHt\s*[:=]?\s*([\d,.]+)/i, /\bHct\s*[:=]?\s*([\d,.]+)/i, /\bEmatocrito\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'sao2', patterns: [/\bSaO2\s*[:=]?\s*([\d,.]+)/i, /\bSO2\s*[:=]?\s*([\d,.]+)/i, /\bO2Hb\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'fio2', patterns: [/\bFiO2\s*[:=]?\s*([\d,.]+)/i, /\bFIO2\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'peep', patterns: [/\bPEEP\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'tv', patterns: [/\bVT\s*[:=]?\s*([\d,.]+)/i, /\bTV\s*[:=]?\s*([\d,.]+)/i, /\bVolume\s+corrente\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'rr', patterns: [/\bFR\s*[:=]?\s*([\d,.]+)/i, /\bRR\s*[:=]?\s*([\d,.]+)/i, /\bfreq\.?\s*resp\.?\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'na', patterns: [/\bNa\s*[:=]?\s*([\d,.]+)/i, /\bSodio\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'k', patterns: [/\bK\s*[:=]?\s*([\d,.]+)/i, /\bPotassio\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'creat', patterns: [/\bCreatinina\s*[:=]?\s*([\d,.]+)/i, /\bCREA\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'pam', patterns: [/\bPAM\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'pas', patterns: [/\bPAS\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'pad', patterns: [/\bPAD\s*[:=]?\s*([\d,.]+)/i] },
  { key: 'temp', patterns: [/\bTemp\.?\s*[:=]?\s*([\d,.]+)/i, /\bTemperatura\s*[:=]?\s*([\d,.]+)/i] },
]

function parseNum(s: string): number | undefined {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function parseClinicalText(text: string): ParsedClinicalText {
  const values: Record<string, string | number> = {}
  const matched: string[] = []
  const block = text.replace(/\r\n/g, '\n')

  for (const { key, patterns } of RULES) {
    for (const re of patterns) {
      const m = block.match(re)
      if (m?.[1]) {
        const n = parseNum(m[1])
        if (n !== undefined) {
          values[key] = n
          matched.push(`${key} = ${n}`)
          break
        }
      }
    }
  }

  return { values, matched }
}

/** Mappa valori parsati → nomi colonna del foglio ACC. */
export function parsedToAccColumns(
  parsed: Record<string, string | number>,
  sheet: string,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  const set = (col: string, key: string) => {
    if (parsed[key] !== undefined) out[col] = parsed[key]
  }

  const egaSheets = ['Ammissione', '6 - 12H', 'DAY 1', 'DAY 2', 'DAY 3']
  if (egaSheets.includes(sheet)) {
    set('EGA - pH', 'ph')
    set('EGA - PaO2', 'pao2')
    set('EGA - PaCO2', 'paco2')
    set('EGA -FIO2', 'fio2')
    set('HCO3', 'hco3')
    set('BE', 'be')
    set('LAC', 'lactate')
    if (sheet === 'Ammissione') {
      set('Ht', 'ht')
      set('HB', 'hb')
    } else if (sheet === 'DAY 1') {
      set('HT', 'ht')
      set('Hb', 'hb')
      set('SO2', 'sao2')
    } else {
      set('HT', 'ht')
      set('HB', 'hb')
      set('SO2', 'sao2')
    }
    set('NA', 'na')
    set('K', 'k')
    set('CREA', 'creat')
    set('PEEP', 'peep')
    set('VT', 'tv')
    set('FR', 'rr')
    set('TEMPERATURA CORPOREA', 'temp')
  }

  if (sheet === 'PS') {
    set('HB', 'hb')
    set('LAC', 'lactate')
    set('CREA', 'creat')
  }

  return out
}

export function parsedToSharedBloodGas(parsed: Record<string, string | number>): BloodGas {
  return {
    ph: num(parsed.ph),
    pao2: num(parsed.pao2),
    paco2: num(parsed.paco2),
    hco3: num(parsed.hco3),
    be: num(parsed.be),
    lactate: num(parsed.lactate),
    hb: num(parsed.hb),
    ht: num(parsed.ht),
    sao2: num(parsed.sao2),
    fio2Ega: num(parsed.fio2),
  }
}

function num(v: string | number | undefined): number | undefined {
  if (typeof v === 'number') return v
  if (v === undefined) return undefined
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : undefined
}
