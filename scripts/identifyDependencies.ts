import fs from 'fs'
import path from 'path'
import process from 'node:process'

// Get arguments from CLI
const args = process.argv.slice(2);
const packageNames = args.filter(arg => !arg.startsWith('--'));
const dependsOnFlag = args.includes('--dependsOn');
const dependentsFlag = args.includes('--dependents');

if (packageNames.length === 0) {
  console.error('Error: Please provide at least one package name.');
  process.exit(1);
}

const cwd = process.cwd()
const filePath = path.join(cwd, 'outputs', 'dependencyTree.json');

function stripPrefix(packageName) {
  return packageName.replace(/@aurodesignsystem\//, '');
}

const items = [
  "auro-counter",
  "auro-checkbox",
  "auro-combobox",
  "auro-datepicker",
  "auro-dropdown",
  "auro-input",
  "auro-menu",
  "auro-radio",
  "auro-select",
]

function notFormkitItem(packageName) {
  return !items.includes(packageName)
}

// Read JSON file
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    process.exit(1);
  }

  try {
    const dependencyTree = JSON.parse(data);
    
    packageNames.forEach(packageName => {
      const fullPackageName = `@aurodesignsystem/auro-${packageName}`;
      const packageData = dependencyTree[fullPackageName];
      
      if (!packageData) {
        console.error(`Package '${fullPackageName}' not found in dependency tree.`);
        return;
      }

      console.log(`Package: ${fullPackageName}`);
      
      if (dependsOnFlag) {
        console.log(`  Dependencies:`, (packageData.dependsOn || []).map(stripPrefix).filter(notFormkitItem));
      }
      
      if (dependentsFlag) {
        console.log(`  Dependents:`, (packageData.dependentPackages || []).map(stripPrefix).filter(notFormkitItem));
      }

      if (!dependsOnFlag && !dependentsFlag) {
        console.log(`  Dependencies:`, (packageData.dependsOn || []).map(stripPrefix).filter(notFormkitItem));
        console.log(`  Dependents:`, (packageData.dependentPackages || []).map(stripPrefix).filter(notFormkitItem));
      }
      console.log();
    });
  } catch (parseError) {
    console.error('Error parsing JSON:', parseError);
    process.exit(1);
  }
});
