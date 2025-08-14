import { RenderResult, within } from "@testing-library/react";
import "./common"; //imported for side effects
import { it } from "vitest";

function getBreadcrumbElements(component: RenderResult) {
  const nav = component.getByRole('navigation', { name: 'breadcrumb' });
  return within(nav).getAllByRole('listitem');
}

function getBreadcrumbs(component: RenderResult) {
  return getBreadcrumbElements(component).map(item => item.textContent);
}

it("breadcrumbs", async ({ load, expect, component }) => {
  load("basic");
  expect(getBreadcrumbs(component)).toEqual(['Documents', 'main']);
});

it("breadcrumbs", async ({ load, expect, component, lexicalUpdate }) => {
  const { note00 } = load("basic");
  lexicalUpdate(() => {
    note00.focus();
  });
  expect(getBreadcrumbs(component)).toEqual(['Documents', 'main']);
});
