import "./index.css";

const renderFallback = (message: string) => {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <div class="min-h-screen bg-background px-5 py-8 text-foreground">
      <div class="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center gap-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview recovery</p>
        <h1 class="text-2xl font-bold">App load nahi ho paaya</h1>
        <p class="text-sm leading-6 text-muted-foreground">${message}</p>
        <button id="reload-preview" class="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Reload preview</button>
      </div>
    </div>
  `;
  document.getElementById("reload-preview")?.addEventListener("click", () => window.location.reload());
};

import("./bootstrap.tsx").catch((error) => {
  console.error("Failed to load application bootstrap", error);
  renderFallback("Browser ne app ka JavaScript chunk load nahi kiya. Reload preview dabao; agar dobara aaye to cache clear karke retry karo.");
});
