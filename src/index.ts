#!/usr/bin/env node

import { program } from "commander";
import auroSplash from "#utils/auro-splash.js";

// Register commands (importing them will register them)
import "#commands/dev.js";
import "#commands/migrate.js";
import "#commands/sync.js";
import "#commands/wca-setup.js";

program.usage('Usage: wow [options] [command]').name('auro').version("0.0.0").description("A cli tool to support the Auro Design System");

program.addHelpText("beforeAll", auroSplash());

program.parse();
