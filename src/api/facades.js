import {
  makeNewsletterStatusSender, makeNewsletterStatusReactionSender, makeNewsletterStatusRevokeSender,
  makeNewsletterStatusUpdatesFetcher, makeNewsletterStatusFetcher
} from './newsletter-status.js'

const list = x => (Array.isArray(x) ? x : [x])

export function makeGroups(s) {
  const part = (jid, users, action) => s.groupParticipantsUpdate(jid, list(users), action)
  return {
    create: (subject, participants = []) => s.groupCreate(subject, participants),
    metadata: jid => s.groupMetadata(jid),
    all: () => s.groupFetchAllParticipating(),
    leave: jid => s.groupLeave(jid),
    rename: (jid, subject) => s.groupUpdateSubject(jid, subject),
    description: (jid, text) => s.groupUpdateDescription(jid, text),
    picture: (jid, content) => s.updateProfilePicture(jid, content),
    removePicture: jid => s.removeProfilePicture(jid),
    add: (jid, users) => part(jid, users, 'add'),
    remove: (jid, users) => part(jid, users, 'remove'),
    promote: (jid, users) => part(jid, users, 'promote'),
    demote: (jid, users) => part(jid, users, 'demote'),
    /** Solo admins escriben / todos escriben */
    announce: (jid, on = true) => s.groupSettingUpdate(jid, on ? 'announcement' : 'not_announcement'),
    /** Solo admins editan info / todos editan */
    lock: (jid, on = true) => s.groupSettingUpdate(jid, on ? 'locked' : 'unlocked'),
    ephemeral: (jid, seconds) => s.groupToggleEphemeral(jid, seconds),
    memberAddMode: (jid, mode) => s.groupMemberAddMode(jid, mode),
    joinApproval: (jid, mode) => s.groupJoinApprovalMode(jid, mode),
    inviteCode: jid => s.groupInviteCode(jid),
    inviteLink: async jid => `https://chat.whatsapp.com/${await s.groupInviteCode(jid)}`,
    revokeInvite: jid => s.groupRevokeInvite(jid),
    inviteInfo: code => s.groupGetInviteInfo(code),
    join: code => s.groupAcceptInvite(code),
    joinV4: (key, inviteMessage) => s.groupAcceptInviteV4(key, inviteMessage),
    requests: jid => s.groupRequestParticipantsList(jid),
    approve: (jid, users) => s.groupRequestParticipantsUpdate(jid, list(users), 'approve'),
    reject: (jid, users) => s.groupRequestParticipantsUpdate(jid, list(users), 'reject'),
    memberLabel: (jid, label) => s.updateMemberLabel(jid, label)
  }
}

export function makeCommunities(s) {
  const part = (jid, users, action) => s.communityParticipantsUpdate(jid, list(users), action)
  return {
    create: (subject, description) => s.communityCreate(subject, description),
    createGroup: (subject, participants, communityJid) => s.communityCreateGroup(subject, participants, communityJid),
    metadata: jid => s.communityMetadata(jid),
    all: () => s.communityFetchAllParticipating(),
    linkedGroups: jid => s.communityFetchLinkedGroups(jid),
    link: (groupJid, communityJid) => s.communityLinkGroup(groupJid, communityJid),
    unlink: (groupJid, communityJid) => s.communityUnlinkGroup(groupJid, communityJid),
    leave: jid => s.communityLeave(jid),
    rename: (jid, subject) => s.communityUpdateSubject(jid, subject),
    description: (jid, text) => s.communityUpdateDescription(jid, text),
    add: (jid, users) => part(jid, users, 'add'),
    remove: (jid, users) => part(jid, users, 'remove'),
    promote: (jid, users) => part(jid, users, 'promote'),
    demote: (jid, users) => part(jid, users, 'demote'),
    setting: (jid, setting) => s.communitySettingUpdate(jid, setting),
    ephemeral: (jid, seconds) => s.communityToggleEphemeral(jid, seconds),
    memberAddMode: (jid, mode) => s.communityMemberAddMode(jid, mode),
    joinApproval: (jid, mode) => s.communityJoinApprovalMode(jid, mode),
    inviteCode: jid => s.communityInviteCode(jid),
    revokeInvite: jid => s.communityRevokeInvite(jid),
    inviteInfo: code => s.communityGetInviteInfo(code),
    join: code => s.communityAcceptInvite(code),
    requests: jid => s.communityRequestParticipantsList(jid),
    approve: (jid, users) => s.communityRequestParticipantsUpdate(jid, list(users), 'approve'),
    reject: (jid, users) => s.communityRequestParticipantsUpdate(jid, list(users), 'reject')
  }
}

export function makeChannels(s) {
  const cfg = { logger: undefined }
  return {
    create: (name, description) => s.newsletterCreate(name, description),
    update: (jid, updates) => s.newsletterUpdate(jid, updates),
    rename: (jid, name) => s.newsletterUpdateName(jid, name),
    description: (jid, text) => s.newsletterUpdateDescription(jid, text),
    picture: (jid, content) => s.newsletterUpdatePicture(jid, content),
    removePicture: jid => s.newsletterRemovePicture(jid),
    metadata: (type, key, opts) => s.newsletterMetadata(type, key, opts),
    follow: jid => s.newsletterFollow(jid),
    unfollow: jid => s.newsletterUnfollow(jid),
    mute: jid => s.newsletterMute(jid),
    unmute: jid => s.newsletterUnmute(jid),
    messages: (jid, count, since, after) => s.newsletterFetchMessages(jid, count, since, after),
    react: (jid, serverId, emoji) => s.newsletterReactMessage(jid, serverId, emoji),
    subscribers: (jid, opts) => s.newsletterSubscribers(jid, opts),
    followers: (jid, opts) => s.newsletterFollowers(jid, opts),
    insights: (jid, opts) => s.newsletterInsights(jid, opts),
    adminCount: jid => s.newsletterAdminCount(jid),
    pendingAdminInvites: jid => s.newsletterPendingAdminInvites(jid),
    changeOwner: (jid, userJid) => s.newsletterChangeOwner(jid, userJid),
    demote: (jid, userJid) => s.newsletterDemote(jid, userJid),
    delete: jid => s.newsletterDelete(jid),
    recommended: opts => s.newsletterRecommended(opts),
    similar: (jid, opts) => s.newsletterSimilar(jid, opts),
    questionResponseState: (jid, serverId, responseId, state) => s.newsletterQuestionResponseState(jid, serverId, responseId, state),
    /** Estados de canal */
    status: {
      send: makeNewsletterStatusSender(s, cfg),
      react: makeNewsletterStatusReactionSender(s),
      revoke: makeNewsletterStatusRevokeSender(s),
      updates: makeNewsletterStatusUpdatesFetcher(s),
      list: makeNewsletterStatusFetcher(s)
    }
  }
}

export function makeAccount(s) {
  return {
    health: jid => s.checkAccountHealth(jid),
    about: jid => s.fetchAbout(jid),
    setAbout: text => s.updateProfileStatus(text),
    setName: name => s.updateProfileName(name),
    textStatus: { set: (t, o) => s.updateTextStatus(t, o), fetch: jids => s.fetchTextStatus(jids) },
    username: {
      get: () => s.getUsername(),
      set: (u, o) => s.setUsername(u, o),
      remove: () => s.removeUsername(),
      available: (u, o) => s.checkUsernameAvailability(u, o),
      setPin: pin => s.setUsernamePin(pin),
      removePin: () => s.removeUsernamePin()
    },
    blocklist: () => s.fetchBlocklist(),
    block: jid => s.updateBlockStatus(jid, 'block'),
    unblock: jid => s.updateBlockStatus(jid, 'unblock'),
    reportSpam: (jid, o) => s.reportSpam(jid, o),
    privacy: {
      get: () => s.fetchPrivacySettings(true),
      lastSeen: v => s.updateLastSeenPrivacy(v),
      online: v => s.updateOnlinePrivacy(v),
      picture: v => s.updateProfilePicturePrivacy(v),
      status: v => s.updateStatusPrivacy(v),
      readReceipts: v => s.updateReadReceiptsPrivacy(v),
      groupsAdd: v => s.updateGroupsAddPrivacy(v),
      messages: v => s.updateMessagesPrivacy(v),
      calls: v => s.updateCallPrivacy(v),
      disappearing: seconds => s.updateDefaultDisappearingMode(seconds)
    },
    notices: { fetch: since => s.fetchUserNotices(since), stage: (id, stage) => s.updateUserNoticeStage(id, stage) },
    pushSettings: () => s.fetchPushSettings(),
    linkPreview: url => s.fetchServerLinkPreview(url)
  }
}

export function makeBusiness(s) {
  return {
    profile: jid => s.getBusinessProfile(jid),
    catalog: opts => s.getCatalog(opts),
    collections: (jid, limit) => s.getCollections(jid, limit),
    order: (orderId, token) => s.getOrderDetails(orderId, token),
    createProduct: p => s.productCreate(p),
    updateProduct: (id, p) => s.productUpdate(id, p),
    deleteProducts: ids => s.productDelete(ids),
    updateProfile: p => s.updateBussinesProfile(p),
    cover: { set: img => s.updateCoverPhoto(img), remove: id => s.removeCoverPhoto(id) }
  }
}

/** Estados (status@broadcast) */
export function makeStatus(s) {
  return {
    post: (content, jids) => s.sendMessage('status@broadcast', content, { statusJidList: jids }),
    mention: (jids, content, opts) => s.sendStatusMentions(jids, content, opts)
  }
}
