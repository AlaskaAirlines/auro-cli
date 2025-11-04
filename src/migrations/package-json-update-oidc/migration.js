import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import PackageJson from '@npmcli/package-json';
import fs from "fs";

const updatePackageJson = async () => {

  const pkg = await PackageJson.load('./');

  pkg.update({ scripts: 
    { 
      ...pkg.content.scripts,
      "test:coverage": "auro test --coverage-report --open",
    }
  });
  pkg.update({ engines: { node: '>=20' } });
  pkg.update({ publishConfig: { access: 'public', provenance: true } });
  pkg.update({ exports: 
    { 
      ...pkg.content.exports,
      "./package.json": "./package.json",
    } 
  });

  await pkg.save();
}

// create .nvmrc file
const createNvmrcFile = async () => {
  const targetPath = '.nvmrc';
  
  try {
    // Write "v22" to .nvmrc file
    fs.writeFileSync(targetPath, 'v22');
  } catch (error) {
    Logger.error(`Failed to create .nvmrc file: ${error.message}`);
    throw error;
  }
}

const run = async () => {

    await updatePackageJson();
    Logger.info("package.json updated successfully.");

    await createNvmrcFile();
    Logger.info(".nvmrc file created successfully.");

};

run().catch((error) => {
  Logger.error(`Migration failed: ${error}`);
});
