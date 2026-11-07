function tokenVersionMatches(tokenVersion, userTokenVersion) {
  return Number(tokenVersion ?? 0) === Number(userTokenVersion ?? 0)
}

module.exports = { tokenVersionMatches }
