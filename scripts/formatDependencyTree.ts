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

// write the dependency tree to a file
fs.writeFileSync(
  `${BASE_DIRECTORY}/dependencyTree.json`,
  JSON.stringify(dependencyTree, null, 2),
);

const updateOrder = getSafeUpdateOrder(dependencyTree);

const updateText = `
# Update Order
${updateOrder.map((pkg, index) => `${index + 1}. ${pkg}`).join("\n")}
`;

console.log(updateText);

const batchedUpdateOrderText = batchedUpdateOrder(dependencyTree)
  .map(
    (batch, index) =>
      `Batch ${index + 1}\n${batch.map((pkg) => `  - ${pkg.replace("@aurodesignsystem", "AlaskaAirlines").replace("@alaskaairux/icons", "AlaskaAirlines/Icons")}`).join("\n")}`,
  )
  .join("\n\n");

console.log(batchedUpdateOrderText);
