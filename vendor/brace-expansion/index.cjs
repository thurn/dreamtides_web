"use strict";

const core = require("brace-expansion-core");

// minimatch 9 and earlier call the package export directly, while minimatch 10
// imports the named `expand` export. Preserve both contracts while sharing the
// bounded expansion implementation from brace-expansion 5.
const compatibleExpand = core.expand;
compatibleExpand.expand = core.expand;
compatibleExpand.EXPANSION_MAX = core.EXPANSION_MAX;
compatibleExpand.EXPANSION_MAX_LENGTH = core.EXPANSION_MAX_LENGTH;

module.exports = compatibleExpand;
module.exports.expand = core.expand;
module.exports.EXPANSION_MAX = core.EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = core.EXPANSION_MAX_LENGTH;
