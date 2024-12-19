#!/usr/bin/env node

import { program } from "commander";

// @ts-ignore
import auroSplash from "./utils/auro-splash.js";

// Register commands (importing them will register them)
import "./commands/dev.js";
import "./commands/migrate.js";
import "./commands/sync.js";
import "./commands/demo.js";

auroSplash();

program.name("auro-cli").version("0.0.1").description("Auro CLI");

program.parse();
