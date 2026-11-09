import { AuroIcon } from "@aurodesignsystem/auro-icon/class";
import { AuroDependencyVersioning } from "@aurodesignsystem/auro-library/scripts/runtime/dependencyTagVersioning.mjs";
import iconVersion from "./iconVersion.js";

export const iconTag = new AuroDependencyVersioning().generateTag(
  "auro-button-icon",
  iconVersion,
  AuroIcon,
);
