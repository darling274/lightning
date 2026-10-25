import { proto } from '../vendor/baileys/index.js'
import { MiniwaError } from '../core/errors.js'

export const protoSupport = () => ({
  scheduledMessages: !!proto.Message?.ConditionalRevealMessage && proto.Message?.ProtocolMessage?.Type?.MESSAGE_UNSCHEDULE !== undefined,
  eventInvite: !!proto.Message?.EventInviteMessage,
  pollAddOption: !!proto.Message?.PollAddOptionMessage,
  newsletterStatus: proto.StatusAttribution?.Type?.NEWSLETTER_STATUS !== undefined
})

const NEEDS = { eventInvite: 'eventInvite', pollAddOption: 'pollAddOption', newsletterStatus: 'newsletterStatus' }

export function assertProtoSupport(content) {
  if (!content || typeof content !== 'object') return
  const sup = protoSupport()
  for (const key of Object.keys(NEEDS)) {
    if (content[key] != null && !sup[NEEDS[key]]) {
      throw new MiniwaError(`"${key}" needs a newer WAProto than the vendored one in src/vendor/WAProto. Regenerate WAProto or avoid this message type.`, 'UNSUPPORTED_PROTO', { key })
    }
  }
}
