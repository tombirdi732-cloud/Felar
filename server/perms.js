// Permission flags (bitfield), Discord-style. Mirrored on the client.
export const PERM = {
  ADMINISTRATOR: 1,    // grants every permission
  MANAGE_SERVER: 2,    // rename the server, edit server settings
  MANAGE_ROLES: 4,     // create/edit/delete roles, assign roles
  MANAGE_CHANNELS: 8,  // create/rename/delete channels, edit channel settings
  KICK_MEMBERS: 16,    // remove members
  MANAGE_MESSAGES: 32, // delete other people's messages
  BAN_MEMBERS: 64,     // ban members (permanent, can't rejoin by invite)
};

export const ALL_PERMS = Object.values(PERM).reduce((a, b) => a | b, 0);
