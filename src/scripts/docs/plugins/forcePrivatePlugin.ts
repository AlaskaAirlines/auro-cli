import type {
  ClassMember,
  Declaration,
  Module,
  Package,
  CustomElementDeclaration,
  Attribute,
} from "custom-elements-manifest";

import { toCamelCase } from '@wc-toolkit/cem-utilities';

interface ForcePrivateContext {
  forcePrivateProperties?: Map<string, string[]>;
}

export default function forcePrivatePlugin() {
  return {
    name: "force-private-plugin",
    packageLinkPhase({
      customElementsManifest,
      context,
    }: {
      customElementsManifest: Package;
      context: ForcePrivateContext;
    }) {
      if (
        !context.forcePrivateProperties ||
        context.forcePrivateProperties.size === 0
      ) {
        return;
      }

      customElementsManifest.modules?.forEach((module: Module) => {
        module.declarations?.forEach((declaration: Declaration) => {
          const propertiesToMarkPrivate = context.forcePrivateProperties!.get(declaration.name);
          
          if (propertiesToMarkPrivate && propertiesToMarkPrivate.length > 0) {

            // Mark members/properties as private only in the class where @forcePrivate was defined
            if ("members" in declaration && declaration.members) {
              declaration.members.forEach((member: ClassMember) => {
                if (propertiesToMarkPrivate.includes(member.name)) {
                  console.log(
                    `\rFound member '${member.name}' in ${declaration.name}, marking as private`,
                  );
                  member.privacy = "private";
                }
              });
            }

            // Handle attributes for CustomElementDeclaration
            // Since attributes don't have a privacy field in the schema, we remove them entirely
            if ("attributes" in declaration && declaration.attributes && 
                'customElement' in declaration && declaration.customElement) {
              const customElementDeclaration = declaration as CustomElementDeclaration;
              
              // Filter out attributes that match forcePrivate properties
              if (customElementDeclaration.attributes) {
                customElementDeclaration.attributes = customElementDeclaration.attributes.filter(
                  (attr: Attribute) => {
                    const camelCaseName = toCamelCase(attr.name);

                    if (propertiesToMarkPrivate.includes(camelCaseName) || propertiesToMarkPrivate.includes(attr.name)) {
                      console.log(
                        `\rFound attribute '${attr.name}' in ${declaration.name}, removing from manifest`,
                      );
                      return false;
                    }
                    return true;
                  }
                );
              }
            }
          }
        });
      });
    },
    analyzePhase({
      ts,
      node,
      context,
    }: {
      ts: any;
      node: any;
      context: ForcePrivateContext;
    }) {
      if (node.kind !== ts.SyntaxKind.ClassDeclaration) return;

      const className = node.name?.getText();
      if (!className) return;

      const processJSDocTags = (jsDocArray: any[], source: string) => {
        jsDocArray?.forEach((jsDoc: any) => {
          jsDoc?.tags?.forEach((tag: any) => {
            if (tag.tagName.getText() === "forcePrivate") {
              const { comment } = tag;
              let propertyNames: string[] = [];

              if (typeof comment === "string") {
                const matches = comment.match(/['"]([^'"]+)['"]/g);
                if (matches) {
                  propertyNames = matches.map((match) =>
                    match.replace(/['"]/g, ""),
                  );
                }
              }

              if (!context.forcePrivateProperties) {
                context.forcePrivateProperties = new Map();
              }

              const existing =
                context.forcePrivateProperties.get(className) || [];
              context.forcePrivateProperties.set(className, [
                ...existing,
                ...propertyNames,
              ]);
            }
          });
        });
      };

      // Check for @forcePrivate on the class itself
      processJSDocTags(node?.jsDoc, "class");

      // Check for @forcePrivate on class members
      node.members?.forEach((member: any) => {
        processJSDocTags(member?.jsDoc, "member");
      });
    },
  };
}
