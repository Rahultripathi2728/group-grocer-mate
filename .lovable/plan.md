## Problem

Preview blank hai kyunki `src/index.css` mein build error aa raha hai:

```
[vite:css] @import must precede all other statements (besides @charset or empty @layer)
```

CSS spec ke according `@import` statements file ke top par hone chahiye — `@tailwind` directives ke baad nahi. Abhi Google Fonts ka import line 5 par hai, `@tailwind` ke baad, isliye Vite CSS ko reject kar raha hai aur preview render nahi ho raha.

## Fix

`src/index.css` mein order swap karna:

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:...&family=Space+Grotesk:...&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base { ... }
```

Bas — `@import` ko line 1 par le aana hai aur `@tailwind` directives uske baad. Iske baad preview wapas load ho jayega.

## Files changed
- `src/index.css` — reorder top 5 lines only.