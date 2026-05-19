import { handleClinicalApi } from '../server/clinicalApiCore.mjs'

/** Crea handler Vercel per un endpoint /api/... */
export function createClinicalApiHandler(apiPath) {
  return async function handler(req, res) {
    req.apiPath = apiPath
    await handleClinicalApi(req, res)
  }
}
