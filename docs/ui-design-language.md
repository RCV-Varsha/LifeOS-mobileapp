# LifeOS UI design language

The supplied reference images inform color, hierarchy, spacing, and surface treatment. Their branding, artwork, screen layouts, and unrelated features are not copied.

## Visual system

- Warm off-white canvas, white surfaces, charcoal text and primary actions.
- Muted green indicates progress; warm amber marks suggestions or attention; red is reserved for errors and destructive actions.
- Shared tokens live in `app/src/ui/theme.ts`. Inputs and buttons have 48-point minimum heights, rounded corners, and readable text.
- Use a short screen heading, a clear primary action, and quiet supporting information. Surfaces group related information; avoid nesting decorative cards.
- Navigation remains Now, Direction, and You. No additional navigation destinations or unsupported settings are introduced.

## Progressive disclosure

- Now separates the daily task list from the adjustment form. Pending suggestions remain visible independently of either section.
- Goal creation keeps optional success criteria, dates, and steps in an expandable section.
- Goal detail separates editing success criteria, reviewing steps, and assigning tasks to steps.
- Preferences and memories keep optional AI assistance behind an expandable section. Suggestions still require explicit acceptance.

The backend contracts, plan acceptance, undo, ownership, and deterministic planning remain unchanged. Goal cards show only information available from the existing summary API; they do not invent percentages or dates.

## Validation boundaries

Mobile TypeScript and Android production bundle export are checked locally. Visual layout, large-font behavior, keyboard interaction, and the complete accept/undo journey still require a connected Android device or emulator. A bundle export is not an APK or a device test.
