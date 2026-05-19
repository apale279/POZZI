/** Modello unificato: si compila una volta, si esporta verso ECMO / ACC Excel. */

export type StudyId = 'ECMO' | 'ACC'

export interface PatientCore {
  sdo: string
  cognome: string
  nome: string
  dataNascita?: string
  sesso?: string
  pesoKg?: number
  altezzaCm?: number
  telefono?: string
  email?: string
}

export interface EcmoEnrollment {
  attivo: boolean
  ecmoLens?: string
  numeroElso?: string
  anno?: string
  diagnosi?: string
  postcardiotomico?: boolean
  dataIngressoOspedale?: string
  oraIngressoOspedale?: string
  dataIngressoIcu?: string
  oraIngressoIcu?: string
}

export interface AccEnrollment {
  attivo: boolean
  anno?: string
  /** Data arresto / inizio percorso ACC (per allineamento giorni clinici) */
  dataArresto?: string
}

export interface EcmoRun {
  runNumber: number
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  mode?: string
}

/** Gasometria / vent / emodinamica — riusabile tra studi e timepoint. */
export interface BloodGas {
  dataEga?: string
  oraEga?: string
  ph?: number
  pao2?: number
  paco2?: number
  hco3?: number
  lactate?: number
  be?: number
  hb?: number
  ht?: number
  sao2?: number
  fio2Ega?: number
}

export interface Ventilation {
  dataSetting?: string
  timeSetting?: string
  type?: string
  rr?: number
  peep?: number
  pmean?: number
  ppeak?: number
  pplat?: number
  tv?: number
  fio2?: number
  modVent?: string
}

export interface Hemodynamics {
  data?: string
  time?: string
  pas?: number
  pad?: number
  pam?: number
  svo2?: number
  co?: number
  paop?: number
  paps?: number
  papd?: number
  papm?: number
  ci?: number
}

export interface FluidBalance {
  bf4h?: number
  bf24h?: number
  unit?: string
}

export interface OutcomeShared {
  dimessoVivoIcu?: boolean
  dataDimissioneIcu?: string
  dataDimissioneOspedale?: string
  dataDecesso?: string
  cpcDimissione?: string
}

export type AccTimepointId =
  | 'ANAMNESI'
  | 'PRE_H'
  | 'PS'
  | 'AMMISSIONE'
  | 'H6_12'
  | 'DAY_1'
  | 'DAY_2'
  | 'DAY_3'
  | 'OUTCOME'

export interface AccTimepointData {
  timepoint: AccTimepointId
  bloodGas?: BloodGas
  ventilation?: Ventilation
  temperatura?: number
  exitus?: boolean
}

/** Dati per foglio ACC: chiave = nome colonna Excel, valore = cella. */
export type AccSheetValues = Record<string, string | number | boolean>

export type WorkflowStatus = 'todo' | 'in_progress' | 'complete'

export interface PatientImportMeta {
  batchId: string
  importedAt: string
  sourceRow?: number
  note?: string
}

export interface PatientRecord {
  id: string
  core: PatientCore
  /** Da compilare (import) → in corso → completato (export-ready). */
  workflowStatus?: WorkflowStatus
  importMeta?: PatientImportMeta
  ecmo?: EcmoEnrollment
  acc?: AccEnrollment
  /** Valutazione 24h ECMO (per run selezionato in export). */
  ecmoAssessment24h?: {
    bloodGas?: BloodGas
    ventilation?: Ventilation
    hemodynamics?: Hemodynamics
    fluidBalance?: FluidBalance
  }
  ecmoRuns?: EcmoRun[]
  /** Tutti i fogli ACC (Anamnesi, DAY 1, Outcome, …). */
  accSheets?: Record<string, AccSheetValues>
  /** Fogli ECMO per run (chiave foglio; RUN nella riga). */
  ecmoSheets?: Record<string, AccSheetValues>
  accTimepoints?: AccTimepointData[]
  outcome?: OutcomeShared
  updatedAt: string
}
