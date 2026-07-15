/** Conventional Commits enforced on commit-msg via Husky. */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0, "always"],
  },
};
