#!/usr/bin/env node

import { program } from "commander";

import auroSplash from "../src/utils/auro-splash.js";
import hello from "../src/commands/hello.js";
import devCommand from "../src/commands/dev.js"
import defaultCommand from "../src/commands/default.js"

await auroSplash();

program.name('auro-cli').version("0.0.1").description("Auro CLI");

await hello;

await devCommand;

await defaultCommand;
  
program.parse(process.argv);
