import { generateWAMessage, hasValidAlbumMedia, normalizeMessageContent } from './generator.js'
import { randomBytes } from 'node:crypto'
import { getBizBinaryNode, shouldIncludeBizBinaryNode } from './biz.js'
import { generateWAMessageFromContent } from './generator.js'
import { assertProtoSupport } from './support.js'
import { prepareModernMessageContent, makeStatusMentionMessage } from './modern-messages.js'
import { generateMessageIDV2, isJidGroup, proto } from '../compat.js'

export const EXTENDED_KEYS = Object.freeze([
  'richLink', 'socialPreview', 'statusLinkPreview', 'music', 'song', 'stickers',
  'buttons', 'sections', 'templateButtons', 'nativeFlow', 'cards',
  'buttonReply', 'listReply', 'flowReply',
  'requestPaymentFrom', 'invoiceNote', 'orderText', 'paymentInviteServiceType',
  'splitPayment', 'splitPaymentUpdate', 'paymentReminder',
  'sharePhoneNumber', 'requestPhoneNumber', 'limitSharing',
  'album', 'groupInvite', 'product', 'pollResult', 'pollUpdate', 'raw',
  'question', 'questionReply', 'questionResponse', 'statusQuestionAnswer', 'statusQuoted',
  'statusStickerInteraction', 'statusNotification', 'newsletterAdminInvite',
  'newsletterFollowerInvite', 'pollAddOption', 'comment', 'eventInvite', 'scheduledCall',
  'scheduledCallEdit', 'groupStatusReaction', 'statusMention',
  'newsletterStatus', 'groupStatusAttribution', 'statusAttributions', 'statusAudience', 'addYours', 'messageAssociation',
  'externalAdReply', 'forwardedNewsletter', 'mentionAll', 'groupMentions', 'groupStatus',
  'spoiler', 'interactiveAsTemplate', 'statusStickers', 'interactiveAnnotations', 'keep', 'bloksWidget', 'shopSurface', 'audioFooter', 'isLottie',
  'hd'
])

const has = (c, k) => c && c[k] !== undefined && c[k] !== null

export const isExtendedContent = content => EXTENDED_KEYS.some(k => has(content, k))

export function extendSocket(sock, { logger } = {}) {
  if (sock.__miniwaExtended) return sock
  const baseSend = sock.sendMessage.bind(sock)

  const delay = ms => new Promise(r => setTimeout(r, ms))
  const sendStatusMentions = async (jids, content, options = {}) => {
    const userJid = sock.user.id
    const { delayMs = 1500 } = options
    const fullMsg = await generateWAMessage('status@broadcast', content, {
      logger, userJid, upload: sock.waUploadToServer, ...options, messageId: generateMessageIDV2(userJid)
    })
    const audience = new Set()
    for (const id of jids) {
      if (isJidGroup(id)) {
        try {
          const g = await sock.groupMetadata(id)
          for (const p of g.participants) audience.add(p.id)
        } catch (e) { logger?.error?.(`metadata de ${id}: ${e}`) }
      } else audience.add(id)
    }
    await sock.relayMessage('status@broadcast', fullMsg.message, {
      messageId: fullMsg.key.id,
      statusJidList: [...audience],
      additionalNodes: [{
        tag: 'meta', attrs: {},
        content: [{ tag: 'mentioned_users', attrs: {}, content: jids.map(id => ({ tag: 'to', attrs: { jid: id }, content: undefined })) }]
      }]
    })
    for (const id of jids) {
      const group = isJidGroup(id)
      const mention = generateWAMessageFromContent(id, {
        messageContextInfo: { messageSecret: randomBytes(32) },
        ...makeStatusMentionMessage({ key: fullMsg.key, group })
      }, { userJid })
      await sock.relayMessage(id, mention.message, {
        additionalNodes: [{ tag: 'meta', attrs: group ? { is_group_status_mention: 'true' } : { is_status_mention: 'true' }, content: undefined }]
      })
      await delay(delayMs)
    }
    return fullMsg
  }

  const sendPair = async (jid, parentContent, childContent, options, patchParent, patchChild) => {
    const userJid = sock.user.id
    const gen = { logger, userJid, upload: sock.waUploadToServer, ...options }
    const relayOpts = {
      useCachedGroupMetadata: options.useCachedGroupMetadata, statusJidList: options.statusJidList,
      additionalAttributes: options.additionalAttributes, additionalNodes: options.additionalNodes
    }
    const parent = await generateWAMessage(jid, parentContent, { ...gen, messageId: generateMessageIDV2(userJid) })
    patchParent?.(parent)
    await sock.relayMessage(jid, parent.message, { messageId: parent.key.id, ...relayOpts })
    const child = await generateWAMessage(jid, childContent, { ...gen, messageId: generateMessageIDV2(userJid) })
    patchChild?.(child, parent)
    await sock.relayMessage(jid, child.message, { messageId: child.key.id, ...relayOpts })
    return parent
  }

  const AT = proto.MessageAssociation.AssociationType
  const PM = proto.ContextInfo.PairedMediaType

  sock.sendHD = (jid, content, options = {}) => {
    const isVideo = !!content.video
    const media = isVideo ? content.video : content.image
    if (!media) throw new Error('sendHD necesita { image } o { video }')
    const hdSource = content.hd && content.hd !== true ? content.hd : media
    const parentContent = { ...content }
    delete parentContent.hd
    const mk = isVideo ? 'videoMessage' : 'imageMessage'
    return sendPair(jid, parentContent, isVideo ? { video: hdSource } : { image: hdSource }, options,
      p => { p.message[mk].contextInfo = { ...(p.message[mk].contextInfo || {}), pairedMediaType: isVideo ? PM.SD_VIDEO_PARENT : PM.SD_IMAGE_PARENT } },
      (c, p) => {
        c.message[mk].contextInfo = { ...(c.message[mk].contextInfo || {}), pairedMediaType: isVideo ? PM.HD_VIDEO_CHILD : PM.HD_IMAGE_CHILD }
        c.message.messageContextInfo = { ...(c.message.messageContextInfo || {}), messageAssociation: { associationType: isVideo ? AT.HD_VIDEO_DUAL_UPLOAD : AT.HD_IMAGE_DUAL_UPLOAD, parentMessageKey: p.key } }
      })
  }

  sock.sendImgVid = (jid, { image, video, caption }, options = {}) => {
    if (!image || !video) throw new Error('sendImgVid necesita { image, video }')
    return sendPair(jid, { image, caption }, { video }, options, null,
      (c, p) => { c.message.messageContextInfo = { ...(c.message.messageContextInfo || {}), messageAssociation: { associationType: AT.MOTION_PHOTO, parentMessageKey: p.key } } })
  }

  sock.sendStatusMentions = sendStatusMentions

  const isExtendedAny = rawContent => {
    assertProtoSupport(rawContent)
    const content = prepareModernMessageContent(rawContent)
    return !!(content?.raw || isExtendedContent(content))
  }


  const prepareMessage = async (jid, rawContent, options = {}) => {
    assertProtoSupport(rawContent)
    const content = prepareModernMessageContent(rawContent)
    const fullMsg = await generateWAMessage(jid, { ...content }, {
      logger,
      userJid: sock.user.id,
      upload: sock.waUploadToServer,
      getUrlInfo: undefined,
      getProfilePicUrl: sock.profilePictureUrl,
      getCallLink: sock.createCallLink,
      mediaCache: undefined,
      ...options
    })

    const additionalNodes = [...(options.additionalNodes || [])]
    const additionalAttributes = { ...(options.additionalAttributes || {}) }
    if (content.pin) additionalAttributes.edit = '2'
    if (content.keep) additionalAttributes.edit = jid.endsWith('@g.us') ? '8' : '7'
    if (content.pollResult) additionalNodes.push({ tag: 'meta', attrs: { polltype: 'result_snapshot' }, content: undefined })
    if (shouldIncludeBizBinaryNode(fullMsg.message) && !additionalNodes.some(n => n.tag === 'biz')) {
      additionalNodes.push(getBizBinaryNode(fullMsg.message))
    }
    return {
      fullMsg,
      content,
      relayOptions: {
        messageId: fullMsg.key.id,
        additionalNodes,
        additionalAttributes,
        useCachedGroupMetadata: options.useCachedGroupMetadata,
        statusJidList: options.statusJidList
      }
    }
  }
  sock.prepareMessage = prepareMessage

  sock.sendMessage = async (jid, rawContent, options = {}) => {
    if (Array.isArray(jid)) return sendStatusMentions(jid, rawContent, options)
    if (rawContent?.hd && (rawContent.image || rawContent.video)) return sock.sendHD(jid, rawContent, options)
    if (rawContent?.image && rawContent?.video) return sock.sendImgVid(jid, rawContent, options)

    if (!isExtendedAny(rawContent)) return baseSend(jid, rawContent, options)

    const { fullMsg, content, relayOptions } = await prepareMessage(jid, rawContent, options)
    const { additionalNodes, additionalAttributes } = relayOptions
    await sock.relayMessage(jid, fullMsg.message, relayOptions)

    if (Array.isArray(content.album)) {
      const { delayMs = 1500 } = options
      const userJid = sock.user.id
      await delay(delayMs)
      for (const media of content.album) {
        const child = await generateWAMessage(jid, media, {
          logger, userJid, upload: sock.waUploadToServer, ...options, messageId: generateMessageIDV2(userJid)
        })
        if (!hasValidAlbumMedia(normalizeMessageContent(child.message))) throw new Error('Invalid album item: use { image } or { video }')
        child.message.messageContextInfo = {
          ...(child.message.messageContextInfo || {}),
          messageAssociation: { parentMessageKey: fullMsg.key, associationType: AT.MEDIA_ALBUM }
        }
        await sock.relayMessage(jid, child.message, {
          messageId: child.key.id,
          useCachedGroupMetadata: options.useCachedGroupMetadata,
          statusJidList: options.statusJidList,
          additionalAttributes,
          additionalNodes
        })
        await delay(delayMs)
      }
    }
    return fullMsg
  }

  sock.__miniwaExtended = true
  return sock
}
