import { theme } from "../theme/theme.js";
/**
 * Dynamic border component that adjusts to viewport width.
 *
 * Note: When used from extensions loaded via jiti, the global `theme` may be undefined
 * because jiti creates a separate module cache. Always pass an explicit color
 * function when using DynamicBorder in components exported for extension use.
 */
export class DynamicBorder {
    color;
    constructor(color = (str) => theme.fg("border", str)) {
        this.color = color;
    }
    invalidate() {
        // No cached state to invalidate currently
    }
    render(width) {
        const inset = width >= 12 ? 2 : 0;
        const rule = this.color("─".repeat(Math.max(1, width - inset * 2)));
        return [`${" ".repeat(inset)}${rule}${" ".repeat(inset)}`];
    }
}
//# sourceMappingURL=dynamic-border.js.map