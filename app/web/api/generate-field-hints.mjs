import { createClinicalApiHandler } from './_handler.mjs'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
    maxDuration: 120,
  },
}

export default createClinicalApiHandler('/api/generate-field-hints')
