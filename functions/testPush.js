// Callable: push a test notification to every device the signed-in user has enabled.
// The only way to meaningfully test push is from outside the page, with the app closed.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { sendPush, userDevices } from './notify.js'
import { defineString } from 'firebase-functions/params'

const APP_URL = defineString('APP_URL', { default: 'https://inhabit-webapp-dev.web.app' })

export const sendTestPush = onCall({ region: 'europe-west1' }, async (req) => {
  try {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first')
    const devices = await userDevices(req.auth.uid)
    if (!devices.length) throw new HttpsError('failed-precondition', 'Push isn\'t enabled on any of your devices')
    return await sendPush(devices, {
      title: 'inHabit test notification',
      body: 'Push notifications are working on this device.',
      url: `${APP_URL.value()}/settings`,
      tag: 'test'
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    logger.error('sendTestPush crashed', { message: err?.message, stack: err?.stack })
    throw new HttpsError('internal', `Test push failed: ${err?.message || 'unknown'}`)
  }
})
