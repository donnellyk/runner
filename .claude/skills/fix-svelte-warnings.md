---
name: fix-svelte-warnings
description: Fix Svelte compiler warnings, especially a11y accessibility warnings. Use when you encounter svelte-check warnings, a11y linting errors, or need to resolve accessibility issues in Svelte components without using svelte-ignore.
argument-hint: "[warning-type or component-path]"
---

# Fixing Svelte Warnings

**Never use `svelte-ignore` to suppress warnings.** Always fix the root cause. Ask the user before adding any `svelte-ignore` comment.

## Svelte's Interactive Role Detection

Svelte's a11y checker determines interactive elements by:
1. Inherently interactive HTML elements: `<button>`, `<input>`, `<a href>`, `<select>`, `<textarea>`, etc.
2. Elements with an interactive ARIA role (from `aria-query` widget/window roles)

**SVG elements (`<svg>`, `<g>`, `<rect>`, `<text>`) are always non-interactive** regardless of ARIA role. You cannot fix SVG a11y warnings by adding roles to the SVG itself.

### Interactive ARIA Roles (recognized by Svelte)

button, checkbox, combobox, grid, gridcell, link, listbox, menu, menubar, menuitem, menuitemcheckbox, menuitemradio, option, radio, radiogroup, scrollbar, searchbox, separator (when focusable), slider, spinbutton, switch, tab, tabpanel, textbox, toolbar, tree, treegrid, treeitem

**Not interactive:** `application`, `document`, `article`, `banner`, `complementary`, `contentinfo`, `figure`, `form`, `group`, `img`, `landmark`, `navigation`, `region`, `status`, `timer`, `generic`

## Fix Patterns by Warning Type

### `a11y_no_static_element_interactions` / `a11y_no_noninteractive_element_interactions`

Element has event handlers but no interactive role.

**For HTML elements (div, span, etc.):** Add an interactive ARIA role and keyboard handler:
```svelte
<div
    role="toolbar"
    tabindex="0"
    aria-label="Description"
    onclick={handleClick}
    onkeydown={handleKeyDown}
>
```

**For SVG elements:** Move event handlers to a wrapping HTML element. Keep the SVG as visual-only:
```svelte
<div
    role="toolbar"
    aria-label="Chart name"
    tabindex="0"
    onclick={handleClick}
    onmousemove={handleMouseMove}
    onkeydown={handleKeyDown}
>
    <svg
        bind:this={svgEl}
        class="w-full h-full"
        aria-hidden="true"
        style="display: block;"
    >
        <!-- chart content -->
    </svg>
</div>
```

**For pointer-only SVG child elements (drag handles, hit targets) inside `aria-hidden` SVGs:** Use a Svelte action to attach event listeners programmatically, bypassing template-based a11y analysis:
```svelte
<script>
    function dragHandle(node: SVGElement, idx: number) {
        let currentIdx = idx;
        function onMouseDown(e: MouseEvent) {
            e.preventDefault();
            e.stopPropagation();
            draggingIdx = currentIdx;
        }
        node.addEventListener("mousedown", onMouseDown);
        return {
            update(newIdx: number) { currentIdx = newIdx; },
            destroy() { node.removeEventListener("mousedown", onMouseDown); },
        };
    }
</script>

<g use:dragHandle={idx} style="cursor: ns-resize;">
    <!-- visual children, no inline event handlers -->
</g>
```

### `a11y_click_events_have_key_events`

Element has `onclick` but no keyboard handler. Keyboard users cannot trigger the action.

**Fix:** Add `onkeydown` for Enter/Space:
```svelte
<text
    role="button"
    tabindex="-1"
    onclick={(e) => { e.stopPropagation(); doAction(); }}
    onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            doAction();
        }
    }}
>Label</text>
```

### `a11y_no_noninteractive_tabindex`

Non-interactive element has `tabindex >= 0`.

**Fix:** Either make the element interactive (add an interactive role) or move `tabindex` to an interactive wrapper.

### `a11y_missing_attribute` (aria-label, alt, etc.)

Element is missing a required accessible name.

**Fix:** Add the appropriate attribute:
- `<img>`: add `alt="description"`
- `<svg role="img">`: add `aria-label="description"`
- Buttons with only icons: add `aria-label="action name"`

## Choosing the Right Role

| Use case | Role | Notes |
|----------|------|-------|
| Chart container with mouse/keyboard interaction | `toolbar` | Container of interactive controls |
| Clickable table row or card | `button` | Or use `<a>` if it navigates |
| Draggable divider/reference line | `separator` | Interactive when focusable |
| Value adjuster | `slider` | With aria-valuenow/min/max |
| Toggle | `switch` or `checkbox` | |

## This Project's Chart Pattern

Interactive charts in `apps/web/src/lib/terminal/charts/` use this structure:
1. Outer `<div>` — layout container (no interaction)
2. Inner `<div role="toolbar" tabindex="0" aria-label="...">` — handles all mouse/keyboard events
3. `<svg aria-hidden="true">` — purely visual, no event handlers in template
4. Pointer-only SVG interactions (drag handles) use Svelte actions (`use:`)
