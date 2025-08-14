import { test } from "./common"; 
import { expect } from "@playwright/test";

test("menu icon follows selection", async ({ menu, notebook }) => { 
     await notebook.load("flat");
     const note = notebook.noteLocator("note2"); 
     await note.selectText();
     const noteBB = await note.boundingBox(); 
     const menuIconBB = await menu.iconLocator().boundingBox(); 
     const menuIconCenter = menuIconBB.y + menuIconBB.height / 2;
     expect(menuIconBB).not.toBeNull(); 
     expect(noteBB).not.toBeNull(); 
     expect(menuIconCenter).toBeGreaterThanOrEqual(noteBB.y); 
     expect(menuIconCenter).toBeLessThanOrEqual(noteBB.y + noteBB.height); 
});

test("open menu by mouse", async ({ menu, notebook }) => { 
     await notebook.load("flat"); 
     await expect(menu.locator()).not.toBeVisible();
     await menu.iconLocator().click(); 
     await expect(menu.locator()).toBeVisible();
     const itemCount = await menu.locator("li").count(); 
     expect(itemCount).toBeGreaterThan(0);
     await notebook.locator().click(); 
     await expect(menu.locator()).not.toBeVisible(); 
});

test("open menu by keyboard", async ({ menu, notebook }) => { 
     await notebook.load("flat"); 
     await menu.open();
     await expect(menu.locator()).toBeVisible(); 
     const itemCount = await menu.locator("li").count(); 
     expect(itemCount).toBeGreaterThan(0); 
});

test("trigger option by arrow", async ({ notebook, menu, page }) => { 
     await notebook.load("tree"); 
     await menu.open();
     const options = menu.locator("li.list-group-item"); 
     await expect(options).not.toHaveCount(0);
     await page.keyboard.press("ArrowDown");
     const activeOption = menu.locator("li.list-group-item.active"); 
     await expect(activeOption).toBeVisible(); 
     await expect(activeOption).toContainText("Fold");
     await page.keyboard.press("Enter");
     const html = await notebook.html(); 
     expect(html).toContain("note"); 
});

test("trigger option by hot key", async ({ page, notebook, menu }) => { 
     await notebook.load("tree"); 
     const before = await notebook.html(); 
     expect(before).toContain("note");
     await menu.open(); 
     await page.keyboard.press("f"); 
     const folded = await notebook.html(); 
     expect(folded).not.toContain("note1200"); 
     await menu.open(); 
     await page.keyboard.press("f"); 
     const unfolded = await notebook.html(); 
     expect(unfolded).toContain("sub note 1");
});

test("trigger option by click", async ({ menu, notebook }) => { 
     await notebook.load("tree"); 
     await menu.open(); 
     await menu.locator("button.dropdown-item").filter({ hasText: "Fold" }).first().click();
     const html = await notebook.html(); 
     expect(html).not.toContain("note1200"); 
});

test("arrows + hot key", async ({ notebook, menu, page }) => { 
     await notebook.load("tree"); 
     await menu.open();
     await page.keyboard.press("ArrowDown");
     await page.keyboard.press("ArrowDown"); 
     await page.keyboard.press("ArrowDown"); 
     await page.keyboard.press("ArrowUp");
     await page.keyboard.press("f"); 
     const html = await notebook.html(); 
     expect(html).not.toContain("note1200"); 
});

test("esc", async ({ notebook, menu, page }) => { 
     await notebook.load("tree"); 
     await menu.open();
     await expect(menu.locator()).toBeVisible(); 
     await page.keyboard.press("Escape"); 
     await expect(menu.locator()).not.toBeVisible(); 
});

test("backspace", async ({ notebook, menu, page }) => { 
     await notebook.load("tree"); 
     await menu.open();
     await expect(menu.locator()).toBeVisible(); 
     await page.keyboard.press("Backspace"); 
     await expect(menu.locator()).not.toBeVisible(); 
});

test("invalid hot key", async ({ notebook, menu, page }) => { 
     await notebook.load("tree"); 
     await menu.open();
     await expect(menu.locator()).toBeVisible(); 
     await page.keyboard.press("$"); 
     await expect(menu.locator()).not.toBeVisible(); 
});

test("open and click outside of editor", async ({ page, notebook, menu }) => { 
     await notebook.load("tree"); 
     await menu.open();
     await expect(menu.locator()).toBeVisible(); 
     const count = await menu.locator("li").count(); 
     expect(count).toBeGreaterThan(0);
     await page.locator("body").click(); 
     await expect(menu.locator()).not.toBeVisible(); 
});
