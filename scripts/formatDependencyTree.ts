import fs from "node:fs";

const BASE_DIRECTORY =
  "/Users/Doug.Hooker@alaskaair.com/code/auro/auro-cli/outputs";

interface PackageJsonExcerpt {
  name: string;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>;
}

interface DependencyNode {
  dependsOn: string[];
  dependentPackages: string[];
}

type DependencyTree = Record<string, DependencyNode>;

// CLI argument parsing

// ---
// Step 1: Parse target dependencies from command line
const rawTargetDependencies = process.argv.slice(2); // e.g., ["button", "hyperlink"]

// Step 2: Format them to match internal package names
const targetDependencies = rawTargetDependencies.map(
  (dep) => `@aurodesignsystem/auro-${dep}`
);
// ---


const dependencyTree: DependencyTree = {};

function getJsonFilesFromDirectory(directory: string): string[] {
  return fs.readdirSync(directory).filter((file) => file.endsWith(".json"));
}

function getSafeUpdateOrder(dependencyTree: DependencyTree): string[] {
  const inDegree: Record<string, number> = {};
  const updateOrder: string[] = [];
  const queue: string[] = [];

  // Initialize in-degree (count of dependencies for each package)
  for (const pkg in dependencyTree) {
    inDegree[pkg] = dependencyTree[pkg].dependsOn.length;
  }

  // Find packages with no dependencies (in-degree = 0)
  for (const pkg in inDegree) {
    if (inDegree[pkg] === 0) {
      queue.push(pkg);
    }
  }

  // Process the queue (topological sorting)
  while (queue.length > 0) {
    const current = queue.shift()!;
    updateOrder.push(current);

    // Reduce the in-degree of dependent packages
    for (const dependent of dependencyTree[current].dependentPackages) {
      inDegree[dependent]--;

      // If a package now has no dependencies, add it to the queue
      if (inDegree[dependent] === 0) {
        queue.push(dependent);
      }
    }
  }

  // If we couldn't process all packages, there is a circular dependency
  if (updateOrder.length !== Object.keys(dependencyTree).length) {
    throw new Error("Circular dependency detected!");
  }

  return updateOrder;
}

function batchedUpdateOrder(dependencyTree: DependencyTree): Array<string[]> {
  const inDegree: Record<string, number> = {};
  const batches: Array<string[]> = [];
  let currentBatch: string[] = [];
  const queue: string[] = [];

  // Initialize in-degree (count of dependencies for each package)
  for (const pkg in dependencyTree) {
    inDegree[pkg] = dependencyTree[pkg].dependsOn.length;
  }

  // Find packages with no dependencies (in-degree = 0)
  for (const pkg in inDegree) {
    if (inDegree[pkg] === 0) {
      queue.push(pkg);
    }
  }

  while (queue.length > 0) {
    currentBatch = [];
    // Process the queue (topological sorting)
    const queueLength = queue.length;
    for (let i = 0; i < queueLength; i++) {
      const current = queue.shift()!;
      currentBatch.push(current);

      // Reduce the in-degree of dependent packages
      for (const dependent of dependencyTree[current].dependentPackages) {
        inDegree[dependent]--;

        // If a package now has no dependencies, add it to the queue
        if (inDegree[dependent] === 0) {
          queue.push(dependent);
        }
      }
    }
    batches.push(currentBatch);
  }

  // If we couldn't process all packages, there is a circular dependency
  if (batches.flat().length !== Object.keys(dependencyTree).length) {
    throw new Error("Circular dependency detected!");
  }

  return batches;
}

const files = getJsonFilesFromDirectory(BASE_DIRECTORY);

for (const file of files) {
  if (file === "dependencyTree.json") {
    continue;
  }

  const contents = fs.readFileSync(`${BASE_DIRECTORY}/${file}`, "utf-8");
  const data: PackageJsonExcerpt = JSON.parse(contents);

  const packageName = data.name;
  const peerDependencies = Object.keys(data.peerDependencies);
  const devDependencies = Object.keys(data.devDependencies);
  const dependencies = Object.keys(data.dependencies);

  if (!dependencyTree[packageName]) {
    dependencyTree[packageName] = { dependsOn: [], dependentPackages: [] };
  }

  const allDependencies = [
    ...peerDependencies,
    ...devDependencies,
    ...dependencies,
  ];

  dependencyTree[packageName].dependsOn = [...new Set(allDependencies)];

  for (const dependency of allDependencies) {
    if (!dependencyTree[dependency]) {
      dependencyTree[dependency] = { dependsOn: [], dependentPackages: [] };
    }

    if (!dependencyTree[dependency].dependentPackages.includes(packageName)) {
      dependencyTree[dependency].dependentPackages.push(packageName);
    }
  }
}

// Write the dependency tree to a file
fs.writeFileSync(
  `${BASE_DIRECTORY}/dependencyTree.json`,
  JSON.stringify(dependencyTree, null, 2),
);

// If there are no specified target dependencies, use all packages
if (!targetDependencies.length) {
  console.log("No target dependencies provided - using all packages.");

  const batchedUpdateOrderText = batchedUpdateOrder(dependencyTree)
    .map(
      (batch, index) =>
        `Batch ${index + 1}\n${batch.map((pkg) => `  - ${pkg.replace("@aurodesignsystem", "AlaskaAirlines").replace("@alaskaairux/icons", "AlaskaAirlines/Icons")}`).join("\n")}`,
    )
    .join("\n\n");

  console.log(batchedUpdateOrderText);
} else {

// If there ARE target dependencies, filter the dependency tree
  const relevantPackages = new Set<string>();

// Include any packages that depend on a target dependency
  for (const [pkg, node] of Object.entries(dependencyTree)) {
    if (node.dependsOn.some(dep => targetDependencies.includes(dep))) {
      relevantPackages.add(pkg);
    }
  }

// Also include the target dependencies themselves
  for (const target of targetDependencies) {
    if (dependencyTree[target]) {
      relevantPackages.add(target);
    }
  }

// Final filtered dependency tree
  const filteredDependencyTree: DependencyTree = {};
  for (const pkg of relevantPackages) {
    filteredDependencyTree[pkg] = {
      dependsOn: dependencyTree[pkg].dependsOn.filter(dep => relevantPackages.has(dep)),
      dependentPackages: dependencyTree[pkg].dependentPackages.filter(dep => relevantPackages.has(dep)),
    };
  }

  const batchedUpdateOrderText = batchedUpdateOrder(filteredDependencyTree)
    .map(
      (batch, index) =>
        `Batch ${index + 1}\n${batch.map((pkg) => `  - ${pkg.replace("@aurodesignsystem", "AlaskaAirlines").replace("@alaskaairux/icons", "AlaskaAirlines/Icons")}`).join("\n")}`,
    )
    .join("\n\n");

  console.log(batchedUpdateOrderText);
}

//  - AlaskaAirlines/auro-accordion
//   - AlaskaAirlines/auro-avatar
//   - AlaskaAirlines/auro-button
//   - AlaskaAirlines/auro-dialog
//   - AlaskaAirlines/auro-drawer
//   - AlaskaAirlines/auro-formkit
//   - AlaskaAirlines/auro-toast
