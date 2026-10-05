import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import { selectReleaseTicketForRepo } from "../src/scripts/rc-workflow/ado-release-ticket.ts";

const ticket = (id: number, title: string, areaPath: string): WorkItem => ({
  id,
  fields: {
    "System.Title": title,
    "System.Tags": "auro-rcs",
    "System.AreaPath": areaPath,
  },
});

const ADS = "E_Retain_Content\\Auro Design System";

test("selectReleaseTicketForRepo picks the ticket whose Area Path names the repo", () => {
  const tickets = [
    ticket(1, "RC Q4", `${ADS}\\auro-button`),
    ticket(2, "RC Q4", `${ADS}\\auro-accordion`),
  ];
  assert.equal(selectReleaseTicketForRepo(tickets, "auro-accordion").id, 2);
});

test("selectReleaseTicketForRepo matches an Area Path segment by component name", () => {
  const tickets = [
    ticket(1, "RC", `${ADS}\\Button`),
    ticket(2, "RC", `${ADS}\\Accordion`),
  ];
  assert.equal(selectReleaseTicketForRepo(tickets, "auro-accordion").id, 2);
});

test("selectReleaseTicketForRepo falls back to the title when Area Paths are shared", () => {
  const tickets = [
    ticket(1, "auro-button release candidate", ADS),
    ticket(2, "Auro Accordion release candidate", ADS),
  ];
  assert.equal(selectReleaseTicketForRepo(tickets, "auro-accordion").id, 2);
});

test("selectReleaseTicketForRepo matches whole words only in titles", () => {
  const tickets = [
    ticket(1, "auro-buttonish RC", ADS),
    ticket(2, "auro-button RC", ADS),
  ];
  assert.equal(selectReleaseTicketForRepo(tickets, "auro-button").id, 2);
});

test("selectReleaseTicketForRepo throws when no ticket matches the repo", () => {
  const tickets = [ticket(1, "button RC", ADS), ticket(2, "select RC", ADS)];
  assert.throws(
    () => selectReleaseTicketForRepo(tickets, "auro-accordion"),
    /none could be matched to "auro-accordion"/,
  );
});

test("selectReleaseTicketForRepo throws when several tickets match the repo", () => {
  const tickets = [
    ticket(1, "accordion RC", ADS),
    ticket(2, "auro-accordion RC 2", ADS),
  ];
  assert.throws(
    () => selectReleaseTicketForRepo(tickets, "auro-accordion"),
    /Found 2 Release tickets whose title matches/,
  );
});
