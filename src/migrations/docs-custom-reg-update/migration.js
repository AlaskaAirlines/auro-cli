import { Logger } from "@aurodesignsystem/auro-library/scripts/utils/logger.mjs";
import fs from "fs";



// create custom registration markdown file
const createCustomRegistrationMdFile = async () => {
  const targetPath = './docs/partials/customRegistration.md';

  if (fs.existsSync(targetPath)) {
    Logger.info("Custom registration markdown file already exists. Skipping creation.");
    return;
  }
  
  try {
    // Create the file with placeholder content
    fs.writeFileSync(targetPath, '<!-- add custom registration content here -->\n', 'utf8');
  } catch (error) {
    Logger.error(`Failed to create custom registration markdown file: ${error.message}`);
    throw error;
  }
}

const run = async () => {

    await createCustomRegistrationMdFile();
    Logger.info("Custom registration markdown file created successfully.");

};

run().catch((error) => {
  Logger.error(`Migration failed: ${error}`);
});
