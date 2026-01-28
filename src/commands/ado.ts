import { program } from "commander";
import { createADOItem } from "#scripts/ado/index.ts";

export const adoCommand = program
  .command("ado")
  .description("Generate ADO item from GitHub issue(s)")
  .option("-g, --gh-issue <issues>", "GitHub issue(s) to use (comma-separated for multiple)")
  .option("-c, --copy-content", "Copy GitHub issue content to ADO description (uses markdown format)")
  .option("-t, --tag <tags>", "Tags to attach to ADO work item (comma-separated for multiple)")
  .action(async (options) => {

    if (options.ghIssue) {
      // Split comma-separated issues and trim whitespace
      const issues = options.ghIssue.split(',').map((issue: string) => issue.trim());
      
      // Parse tags if provided
      const tags = options.tag ? options.tag.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0) : [];
      
      console.log(`Processing ${issues.length} GitHub issue(s)...`);
      if (tags.length > 0) {
        console.log(`Tags to apply: ${tags.join(', ')}`);
      }
      
      // Process each issue individually
      for (const [index, issue] of issues.entries()) {
        try {
          console.log(`\n[${index + 1}/${issues.length}] Processing: ${issue}`);
          await createADOItem(issue, options.copyContent, tags);
        } catch (error) {
          console.error(`Failed to process issue ${issue}: ${error instanceof Error ? error.message : error}`);
          // Continue with next issue even if one fails
        }
      }
      
      console.log(`\nCompleted processing ${issues.length} issue(s).`);
    }
  });
