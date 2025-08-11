import fs from "node:fs";
import path from "node:path";

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

export function getBatchedUpdateOrder(
  dependencyTree: DependencyTree,
): Array<string[]> {
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

function getJsonFilesFromDirectory(directory: string): string[] {
  return fs.readdirSync(directory).filter((file) => file.endsWith(".json"));
}

/**
 * Formats the dependency tree for the specified target dependencies.
 * @param rawTargetDependencies {string[]} - List of target dependencies to format. Expects package names like "button", "hyperlink", etc. without the "@aurodesignsystem/" prefix.
 * @returns {Promise<DependencyTree>} - A promise that resolves to the formatted dependency tree.
 */
export async function formatDependencyTree(
  jsonFileDirectory: string,
  targetDependencies: string[] = [],
): Promise<DependencyTree> {
  console.log(targetDependencies);
  let dependencyTree: DependencyTree = {};

  const files = getJsonFilesFromDirectory(jsonFileDirectory);

  for (const file of files) {
    // Skip the dependency tree file itself if it already exists
    if (file === "dependencyTree.json") {
      continue;
    }

    const contents = fs.readFileSync(`${jsonFileDirectory}/${file}`, "utf-8");
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

  // If there are no specified target dependencies, use all packages
  if (targetDependencies.length) {
    // If there ARE target dependencies, filter the dependency tree down to just relevant packages
    // A tree will start only include package that the target dependencies depend on, OR packages that depend on the target dependencies
    const relevantPackages = new Set<string>();

    // Include any packages that depend on a target dependency
    for (const [pkg, node] of Object.entries(dependencyTree)) {
      if (node.dependsOn.some((dep) => targetDependencies.includes(dep))) {
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
    const _filteredDependencyTree: DependencyTree = {};
    for (const pkg of relevantPackages) {
      _filteredDependencyTree[pkg] = {
        dependsOn: dependencyTree[pkg].dependsOn.filter((dep) =>
          relevantPackages.has(dep),
        ),
        dependentPackages: dependencyTree[pkg].dependentPackages.filter((dep) =>
          relevantPackages.has(dep),
        ),
      };
    }

    dependencyTree = _filteredDependencyTree;
  } else {
    console.log("No target dependencies provided - using all packages.");
  }

  // Write the dependency tree to a file
  fs.writeFileSync(
    `${jsonFileDirectory}/dependencyTree.json`,
    JSON.stringify(dependencyTree, null, 2),
  );

  return dependencyTree;
}
