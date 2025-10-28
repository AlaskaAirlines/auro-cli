import { Octokit } from "@octokit/rest";
import * as azdev from "azure-devops-node-api";
import ora from "ora";
import type { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";

interface GitHubIssue {
  title: string;
  body: string | null;
  html_url: string;
  number: number;
  repository: {
    owner: { login: string };
    name: string;
  };
}

/**
 * Fetches GitHub issue details
 * @param issueUrl - Full GitHub issue URL or in format "owner/repo#number"
 * @returns GitHub issue details
 */
const fetchGitHubIssue = async (issueUrl: string): Promise<GitHubIssue> => {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    throw new Error("GH_TOKEN environment variable is required");
  }

  const octokit = new Octokit({
    auth: ghToken,
  });

  let owner: string;
  let repo: string;
  let issueNumberStr: string;

  // Parse the issue URL or reference
  if (issueUrl.includes('github.com')) {
    // Full URL format: https://github.com/owner/repo/issues/123
    const urlMatch = issueUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);
    if (!urlMatch) {
      throw new Error("Invalid GitHub issue URL format");
    }
    [, owner, repo, issueNumberStr] = urlMatch;
  } else if (issueUrl.includes('#')) {
    // Short format: owner/repo#123
    const shortMatch = issueUrl.match(/([^\/]+)\/([^#]+)#(\d+)/);
    if (!shortMatch) {
      throw new Error("Invalid GitHub issue reference format");
    }
    [, owner, repo, issueNumberStr] = shortMatch;
  } else {
    throw new Error("Issue must be provided as full URL or in format 'owner/repo#number'");
  }

  const issueNumber = Number.parseInt(issueNumberStr, 10);

  try {
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return {
      title: issue.title,
      body: issue.body ?? null,
      html_url: issue.html_url,
      number: issue.number,
      repository: {
        owner: { login: owner },
        name: repo,
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch GitHub issue: ${error}`);
  }
};

/**
 * Checks if GitHub issue already has an ADO work item linked
 * @param issue - GitHub issue details
 * @returns ADO URL if found, null otherwise
 */
const getExistingADOLink = async (issue: GitHubIssue): Promise<string | null> => {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    return null;
  }

  const octokit = new Octokit({
    auth: ghToken,
  });

  try {
    // Get the ADO field value from the GitHub project
    const query = `
      query($owner: String!, $repo: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            projectItems(first: 10) {
              nodes {
                project {
                  number
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      owner: issue.repository.owner.login,
      repo: issue.repository.name,
      issueNumber: issue.number,
    };

    const response = await octokit.graphql(query, variables) as {
      repository: {
        issue: {
          projectItems: {
            nodes: Array<{
              project: { number: number };
              fieldValues: {
                nodes: Array<{
                  text?: string;
                  field?: { name?: string };
                }>;
              };
            }>;
          };
        };
      };
    };

    // Look for project #19 with ado field
    const project19Item = response.repository.issue.projectItems.nodes.find(
      item => item.project.number === 19
    );

    if (project19Item) {
      const adoFieldValue = project19Item.fieldValues.nodes.find(
        fieldValue => fieldValue.field?.name?.toLowerCase() === 'ado' && fieldValue.text?.trim()
      );

      if (adoFieldValue?.text?.trim()) {
        return adoFieldValue.text.trim();
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to check existing ADO link: ${error}`);
    return null;
  }
};

/**
 * Adds GitHub issue to project #19 and updates the "ado" field
 * @param issue - GitHub issue details
 * @param adoWorkItemUrl - ADO work item URL
 */
const updateGitHubProject = async (
  issue: GitHubIssue,
  adoWorkItemUrl: string
): Promise<void> => {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    throw new Error("GH_TOKEN environment variable is required");
  }

  const octokit = new Octokit({
    auth: ghToken,
  });

  const projectNumber = 19; // Alaska Airlines project #19

  try {
    // Get project and issue info in one query
    const query = `
      query($org: String!, $projectNumber: Int!, $owner: String!, $repo: String!, $issueNumber: Int!) {
        organization(login: $org) {
          projectV2(number: $projectNumber) {
            id
            fields(first: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                }
                ... on ProjectV2IterationField {
                  id
                  name
                }
              }
            }
          }
        }
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            id
            projectItems(first: 10) {
              nodes {
                id
                project {
                  number
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      org: "AlaskaAirlines",
      projectNumber,
      owner: issue.repository.owner.login,
      repo: issue.repository.name,
      issueNumber: issue.number,
    };

    const response = await octokit.graphql(query, variables) as {
      organization: {
        projectV2: {
          id: string;
          fields: {
            nodes: Array<{ id: string; name: string }>;
          };
        };
      };
      repository: {
        issue: {
          id: string;
          projectItems: {
            nodes: Array<{
              id: string;
              project: { number: number };
            }>;
          };
        };
      };
    };

    const projectId = response.organization.projectV2.id;
    const issueId = response.repository.issue.id;
    const adoField = response.organization.projectV2.fields.nodes.find(
      field => field.name?.toLowerCase() === 'ado'
    );

    // Check if issue is already in the project
    let projectItemId = response.repository.issue.projectItems.nodes.find(
      item => item.project.number === projectNumber
    )?.id;

    // Add to project if not already there
    if (!projectItemId) {
      const addMutation = `
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(
            input: {
              projectId: $projectId
              contentId: $contentId
            }
          ) {
            item {
              id
            }
          }
        }
      `;

      const addResponse = await octokit.graphql(addMutation, {
        projectId,
        contentId: issueId,
      }) as {
        addProjectV2ItemById: {
          item: { id: string };
        };
      };

      projectItemId = addResponse.addProjectV2ItemById.item.id;
      // Issue added to project (handled by spinner in main function)
    }

    // Update the ado field if it exists
    if (adoField && projectItemId) {
      const updateMutation = `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: String!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: {
                text: $value
              }
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `;

      await octokit.graphql(updateMutation, {
        projectId,
        itemId: projectItemId,
        fieldId: adoField.id,
        value: adoWorkItemUrl,
      });

      // Field updated (handled by spinner in main function)
    } else if (!adoField) {
      throw new Error("No 'ado' field found in GitHub project");
    }

  } catch (error) {
    console.error(`Failed to update GitHub project: ${error}`);
    // Don't throw - we don't want to fail the entire process
  }
};

/**
 * Creates a user story work item in Azure DevOps
 * @param issue - GitHub issue details
 * @returns Created work item
 */
const createADOWorkItem = async (issue: GitHubIssue): Promise<WorkItem> => {
  const adoToken = process.env.ADO_TOKEN;
  if (!adoToken) {
    throw new Error("ADO_TOKEN environment variable is required");
  }

  // ADO organization and project details
  const orgUrl = "https://dev.azure.com/itsals";
  const projectName = "E_Retain_Content";
  const areaPath = "E_Retain_Content\\Auro Design System";

  // Create connection to Azure DevOps
  const authHandler = azdev.getPersonalAccessTokenHandler(adoToken);
  const connection = new azdev.WebApi(orgUrl, authHandler);
  const workItemTrackingApi = await connection.getWorkItemTrackingApi();

  try {
    // Prepare work item data - omitting iteration path to use project default
    const workItemData = [
      {
        op: "add",
        path: "/fields/System.Title",
        value: issue.title,
      },
      {
        op: "add",
        path: "/fields/System.Description",
        value: `GitHub Issue: <a href="${issue.html_url}">${issue.html_url}</a>`,
      },
      {
        op: "add",
        path: "/fields/System.AreaPath",
        value: areaPath,
      },
    ];

    return await workItemTrackingApi.createWorkItem(
      null,
      workItemData,
      projectName,
      "User Story"
    );
  } catch (error) {
    throw new Error(`Failed to create ADO work item: ${error}`);
  }
};

export const createADOItem = async (ghIssue: string) => {
  const spinner = ora(`Processing GitHub issue: ${ghIssue}`).start();
  
  try {
    // Validate environment variables
    if (!process.env.GH_TOKEN) {
      throw new Error("GH_TOKEN environment variable is required");
    }
    if (!process.env.ADO_TOKEN) {
      throw new Error("ADO_TOKEN environment variable is required");
    }

    spinner.text = "Fetching GitHub issue details...";
    const issue = await fetchGitHubIssue(ghIssue);
    spinner.succeed(`Found issue: "${issue.title}"`);

    // Check if issue already has an ADO work item linked in the project
    const checkSpinner = ora("Checking for existing ADO work item...").start();
    const existingADOLink = await getExistingADOLink(issue);
    
    if (existingADOLink) {
      checkSpinner.succeed("ADO work item already exists for this issue!");
      console.log(`${existingADOLink}`);
      return; // Exit early - no need to create a new work item
    }
    
    checkSpinner.succeed("No existing ADO work item found");

    const createSpinner = ora("Creating new ADO work item...").start();
    const workItem = await createADOWorkItem(issue);
    createSpinner.succeed(`Successfully created ADO work item #${workItem.id}`);
    
    console.log(`Work item: ${workItem._links?.html?.href || 'N/A'}`);

    // Add to GitHub project and update the ado field with the new work item
    if (workItem._links?.html?.href) {
      const projectSpinner = ora("Adding to GitHub project and updating ADO field...").start();
      await updateGitHubProject(issue, workItem._links.html.href);
      projectSpinner.succeed("Updated GitHub project with ADO link");
    }    
  } catch (error) {
    spinner.fail(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}