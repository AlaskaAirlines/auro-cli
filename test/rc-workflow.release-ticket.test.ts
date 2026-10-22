import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import {
  filterOpenReleaseTickets,
  selectReleaseTicketForRepo,
} from "../src/scripts/rc-workflow/ado-release-ticket.ts";

const ticket = (
  id: number,
  title: string,
  areaPath: string,
  state = "Blocked",
): WorkItem => ({
  id,
  fields: {
    "System.Title": title,
    "System.Tags": "auro-rcs",
    "System.AreaPath": areaPath,
    "System.State": state,
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

test("filterOpenReleaseTickets drops Closed and Removed Release tickets", () => {
  const tickets = [
    ticket(1, "Release auro-button - 26.20", `${ADS}\\auro-button`, "Closed"),
    ticket(2, "Release auro-button - 26.21", `${ADS}\\auro-button`),
    ticket(3, "Release auro-button - 26.18", `${ADS}\\auro-button`, "removed"),
  ];
  assert.deepEqual(
    filterOpenReleaseTickets(tickets).map((t) => t.id),
    [2],
  );
});

test("filterOpenReleaseTickets keeps Release tickets in open states", () => {
  const tickets = ["Resolved", "Active", "Blocked", "New"].map((state, i) =>
    ticket(i + 1, "Release auro-button", `${ADS}\\auro-button`, state),
  );
  assert.deepEqual(
    filterOpenReleaseTickets(tickets).map((t) => t.id),
    [1, 2, 3, 4],
  );
});

test("filterOpenReleaseTickets returns no tickets when every one is closed", () => {
  const tickets = [
    ticket(1, "Release auro-button - 26.19", `${ADS}\\auro-button`, "Closed"),
    ticket(2, "Release auro-button - 26.20", `${ADS}\\auro-button`, "Closed"),
  ];
  assert.deepEqual(filterOpenReleaseTickets(tickets), []);
});

test("filterOpenReleaseTickets keeps tickets with no state field", () => {
  const tickets: WorkItem[] = [
    { id: 1, fields: { "System.Tags": "auro-rcs" } },
  ];
  assert.equal(filterOpenReleaseTickets(tickets).length, 1);
});

test("a closed Release ticket for the same repo no longer causes an ambiguous match", () => {
  const tickets = filterOpenReleaseTickets([
    ticket(1, "Release auro-button - 26.20", `${ADS}\\auro-button`, "Closed"),
    ticket(2, "Release auro-button - 26.21", `${ADS}\\auro-button`),
  ]);
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].id, 2);
});

test("selectReleaseTicketForRepo lists each ticket's state when two open tickets match", () => {
  const tickets = filterOpenReleaseTickets([
    ticket(1, "Release auro-button - 26.21", `${ADS}\\auro-button`, "Active"),
    ticket(2, "Release auro-button - 26.22", `${ADS}\\auro-button`, "Resolved"),
  ]);
  assert.throws(
    () => selectReleaseTicketForRepo(tickets, "auro-button"),
    (error: Error) =>
      /Found 2 Release tickets whose Area Path matches/.test(error.message) &&
      error.message.includes("#1 ") &&
      error.message.includes("(Active)") &&
      error.message.includes("#2 ") &&
      error.message.includes("(Resolved)"),
  );
});
