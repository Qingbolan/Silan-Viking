# Sidebar composition

`WorkspaceSidebar` owns the animated shell and accessible navigation/footer slots.
`SidebarFactory` validates unique plugin IDs, sorts registrations by `order`, and
builds both slots from the current `WorkspaceSidebarContext` on each render.
Plugins own their presentation; application navigation and state remain in the
context callbacks. Hooks belong in components returned by `render`, not in the
plugin method itself.

The default composition contains `WorkspaceNavigationPlugin`,
`LibraryNavigationPlugin`, and `AccountSidebarPlugin`. Supply a different factory
to replace or omit built-ins, or add a custom plugin without editing the shell:

```tsx
const sidebar = new SidebarFactory([
  new WorkspaceNavigationPlugin(),
  new LibraryNavigationPlugin(),
  new MyNavigationPlugin(),
  new AccountSidebarPlugin(),
]);
// At the application composition boundary:
<WorkspaceSidebar {...sidebarProps} factory={sidebar} />
```

Plugins implement `SidebarPlugin`: a stable `id`, `slot` (`navigation` or
`footer`), numeric `order`, and `render(context)`. Create the factory outside
render so its registration and ordering remain stable. This is an in-process UI
extension point, not a loader for downloaded or untrusted executable plugins.
