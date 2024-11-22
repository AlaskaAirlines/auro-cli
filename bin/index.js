#!/usr/bin/env node

import { program } from "commander";

import auroSplash from "../src/utils/auro-splash.js";
import devCommand from "../src/commands/dev.js";

auroSplash();

program.name("auro-cli").version("0.0.1").description("Auro CLI");

devCommand();

program.parse();
