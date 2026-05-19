import { createClinicalApiHandler } from './_handler.mjs'

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 120,
  },
}

export default createClinicalApiHandler('/api/analyze-image')
