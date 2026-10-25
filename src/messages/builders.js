class Base {
  constructor() { this.c = {} }
  text(t) { this.c.text = t; return this }
  footer(t) { this.c.footer = t; return this }
  title(t) { this.c.title = t; return this }
  subtitle(t) { this.c.subtitle = t; return this }
  image(src, caption) { this.c.image = toSrc(src); if (caption) this.c.caption = caption; return this }
  video(src, caption) { this.c.video = toSrc(src); if (caption) this.c.caption = caption; return this }
  build() { return { ...this.c } }
}
const toSrc = s => (typeof s === 'string' ? { url: s } : s)

export class NativeFlow extends Base {
  constructor() { super(); this.c.nativeFlow = [] }
  reply(text, id) { this.c.nativeFlow.push({ text, id }); return this }
  url(text, url, useWebview = false) { this.c.nativeFlow.push({ text, url, useWebview }); return this }
  copy(text, code) { this.c.nativeFlow.push({ text, copy: code }); return this }
  call(text, phone) { this.c.nativeFlow.push({ text, call: phone }); return this }
  list(text, sections) { this.c.nativeFlow.push({ text, sections }); return this }
  offer(text, url, code, expiration) { Object.assign(this.c, { offerText: text, offerUrl: url, offerCode: code, offerExpiration: expiration }); return this }
  bottomSheet(buttonText, listTitle) { Object.assign(this.c, { optionText: buttonText, optionTitle: listTitle }); return this }
  build() {
    const out = { ...this.c }
    if ((out.image || out.video) && out.text && !out.caption) { out.caption = out.text; delete out.text }
    return out
  }
}

export class LegacyButtons extends Base {
  constructor() { super(); this.c.buttons = [] }
  add(text, id) { this.c.buttons.push({ buttonId: id, buttonText: { displayedText: text }, type: 1 }); return this }
}

export class Carousel {
  constructor() { this.c = { cards: [] } }
  text(t) { this.c.text = t; return this }
  footer(t) { this.c.footer = t; return this }
  card({ image, video, title, caption, footer, buttons = [] }) {
    const nf = buttons instanceof NativeFlow ? buttons.c.nativeFlow : buttons
    const card = { caption, title, footer, nativeFlow: nf }
    if (image) card.image = toSrc(image)
    if (video) card.video = toSrc(video)
    this.c.cards.push(card)
    return this
  }
  build() { return { ...this.c } }
}

export const poll = (name, values, selectableCount = 1) => ({ poll: { name, values, selectableCount } })
export const album = items => ({ album: items.map(i => ({ ...(i.video ? { video: toSrc(i.video) } : { image: toSrc(i.image) }), caption: i.caption })) })
export const location = (lat, lng, name, address) => ({ location: { degreesLatitude: lat, degreesLongitude: lng, name, address } })
export const contact = (name, number) => ({
  contacts: {
    displayName: name,
    contacts: [{ displayName: name, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;waid=${number}:+${number}\nEND:VCARD` }]
  }
})
export const richLink = (url, { text, title, description, image, large = true } = {}) => ({ richLink: { url, text, title, description, image, large } })

export const externalAdReply = ({ title, body, thumbnail, thumbnailUrl, url, large = true, mediaUrl, mediaType = 1 } = {}) =>
  ({ externalAdReply: { title, body, thumbnail, thumbnailUrl, url, mediaUrl, mediaType, largeThumbnail: large } })
export const forwardedNewsletter = (newsletterJid, { name, serverMessageId, contentType } = {}) =>
  ({ forwardedNewsletter: { newsletterJid, newsletterName: name, serverMessageId, contentType } })
export const mentionAll = () => ({ mentionAll: true })
export const groupMentions = groups => ({ groupMentions: groups })
export const spoiler = content => ({ ...content, spoiler: true })

export const event = ({ name, description, startDate, endDate, location, call, extraGuestsAllowed = false }) =>
  ({ event: { name, description, startDate, endDate, location, call, extraGuestsAllowed } })
