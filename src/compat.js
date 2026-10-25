import * as B from './vendor/baileys/index.js'
import { createHmac } from 'node:crypto'

export const proto = B.proto
export const WAProto = B.proto

export const ButtonHeaderType = proto.Message.ButtonsMessage.HeaderType
export const ButtonType = proto.Message.ButtonsMessage.Button.Type
export const CarouselCardType = proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType
export const ListType = proto.Message.ListMessage.ListType
export const WAMessageStatus = B.WAMessageStatus

export const URL_REGEX = B.URL_REGEX ?? /https:\/\/(?![^:@\/\s]+:[^:@\/\s]+@)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?/g
export const MEDIA_KEYS = B.MEDIA_KEYS
export const WA_DEFAULT_EPHEMERAL = B.WA_DEFAULT_EPHEMERAL ?? 7 * 24 * 60 * 60
export const CALL_AUDIO_PREFIX = B.CALL_AUDIO_PREFIX ?? 'https://call.whatsapp.com/voice/'
export const CALL_VIDEO_PREFIX = B.CALL_VIDEO_PREFIX ?? 'https://call.whatsapp.com/video/'
export const DONATE_URL = 'https://github.com/WhiskeySockets/Baileys'
export const LIBRARY_NAME = 'miniwa'

export const { isLidUser, isPnUser, isJidGroup, isJidNewsletter, isJidStatusBroadcast, jidNormalizedUser } = B

export const { sha256, generateMessageIDV2, getKeyAuthor, unixTimestampSeconds } = B
export const {
  downloadContentFromMessage, encryptedStream, extractImageThumb, generateThumbnail,
  getAudioDuration, getAudioWaveform, getRawMediaUploadData, getStream, toBuffer, hkdf
} = B

let imgLib
export const getImageProcessingLibrary = async () => {
  if (imgLib) return imgLib
  const [sharp, image, jimp] = await Promise.all([
    import('sharp').catch(() => {}),
    import('@napi-rs/image').catch(() => {}),
    import('jimp').catch(() => {})
  ])
  imgLib = sharp ? { sharp } : image ? { image } : jimp ? { jimp } : null
  if (!imgLib) throw new Error('No hay libreria de imagen (instala sharp o jimp)')
  return imgLib
}

export const {
  getBinaryNodeChild, getBinaryNodeChildren, S_WHATSAPP_NET, jidDecode, jidEncode,
  isJidNewsletter: _isJidNewsletter, encodeNewsletterMessage
} = B
