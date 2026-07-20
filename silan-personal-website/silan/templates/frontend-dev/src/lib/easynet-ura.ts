export type URAKind =
  | "user"
  | "device"
  | "agent"
  | "ability"
  | "hub"
  | "resource"
  | "unknown";

export interface ParsedURA {
  scope: string;
  subjectType: string;
  subjectValue: string;
  kind: URAKind;
  userId?: string;
  deviceId?: string;
  agentId?: string;
  abilityId?: string;
  namespace?: string;
  path?: string;
  version?: string;
}

export type OwnerKind =
  | "hub"
  | "agent"
  | "user"
  | "device"
  | "system"
  | "other";

const URA_PREFIX = "easynet:///r/";
const RESOURCE_NAMESPACES = ["fs", "process", "pty", "shell", "http"] as const;

export type ResourceNamespace = (typeof RESOURCE_NAMESPACES)[number];

export function deviceURAFromRecord(input: {
  ura?: string | null;
}): string {
  const parsed = input.ura ? parseURA(input.ura) : null;
  if (parsed?.kind === "device") return input.ura ?? "";
  return "";
}

export function parseURA(ura: string): ParsedURA | null {
  if (!ura.startsWith(URA_PREFIX)) return null;
  const rest = ura.slice(URA_PREFIX.length);
  const firstSlash = rest.indexOf("/");
  let realm: string;
  let after: string;
  if (firstSlash < 0) {
    realm = rest;
    after = "";
  } else {
    realm = rest.slice(0, firstSlash);
    after = rest.slice(firstSlash + 1);
  }
  if (!realm) return null;

  let role: string;
  let tail: string;
  const slash = after.indexOf("/");
  if (slash < 0) {
    role = after;
    tail = "";
  } else {
    role = after.slice(0, slash);
    tail = after.slice(slash + 1);
  }
  if (!role) return null;

  let version: string | undefined;
  const at = tail.lastIndexOf("@");
  if (at > 0) {
    version = tail.slice(at + 1);
    tail = tail.slice(0, at);
  }

  const out: ParsedURA = {
    scope: realm,
    subjectType: role,
    subjectValue: tail,
    kind: "unknown",
    version,
  };

  switch (role) {
    case "user": {
      if (!tail || tail.includes(".") || tail.includes("/")) return null;
      out.kind = "user";
      out.userId = tail;
      return out;
    }
    case "device": {
      if (!tail || tail.includes(".") || tail.includes("/")) return null;
      out.kind = "device";
      out.deviceId = tail;
      return out;
    }
    case "agent": {
      const dot = tail.indexOf(".");
      if (dot <= 0 || dot >= tail.length - 1) return null;
      const userId = tail.slice(0, dot);
      const agentId = tail.slice(dot + 1);
      if (agentId.includes(".") || agentId.includes("/") || userId.includes("/")) {
        return null;
      }
      out.kind = "agent";
      out.userId = userId;
      out.agentId = agentId;
      return out;
    }
    case "ability": {
      const first = tail.indexOf(".");
      if (first <= 0) return null;
      const userId = tail.slice(0, first);
      const afterUser = tail.slice(first + 1);
      const second = afterUser.indexOf(".");
      if (second <= 0 || second >= afterUser.length - 1) return null;
      const agentId = afterUser.slice(0, second);
      const abilityId = afterUser.slice(second + 1);
      if (agentId.includes(".") || agentId.includes("/") || userId.includes("/")) {
        return null;
      }
      out.kind = "ability";
      out.userId = userId;
      out.agentId = agentId;
      out.abilityId = abilityId;
      return out;
    }
    case "hub": {
      if (tail) return null;
      out.kind = "hub";
      return out;
    }
    case "resource": {
      const idSlash = tail.indexOf("/");
      const idPart = idSlash < 0 ? tail : tail.slice(0, idSlash);
      const pathPart = idSlash < 0 ? "" : tail.slice(idSlash + 1);
      if (!idPart) return null;
      const dotInId = idPart.indexOf(".");
      if (dotInId < 0) {
        const innerSlash = pathPart.indexOf("/");
        const ns = innerSlash < 0 ? pathPart : pathPart.slice(0, innerSlash);
        const innerPath = innerSlash < 0 ? "" : pathPart.slice(innerSlash + 1);
        if (ns && (RESOURCE_NAMESPACES as readonly string[]).includes(ns)) {
          out.kind = "resource";
          out.userId = idPart;
          out.namespace = ns;
          out.path = innerPath;
          return out;
        }
      }
      out.kind = "resource";
      out.userId = idPart;
      out.namespace = undefined;
      out.path = pathPart;
      return out;
    }
    default:
      out.kind = "unknown";
      return out;
  }
}

export function uraDisplayId(ura: string): string {
  const p = parseURA(ura);
  if (!p) return ura;
  switch (p.kind) {
    case "device":
      return p.deviceId ?? ura;
    case "user":
      return p.userId ?? ura;
    case "agent":
      return [p.userId, p.agentId].filter(Boolean).join(".");
    case "ability":
      return [p.userId, p.agentId, p.abilityId].filter(Boolean).join(".");
    case "hub":
      return "hub";
    case "resource":
      return p.namespace
        ? `${p.userId}/${p.namespace}/${p.path}`
        : `${p.userId}/${p.path}`;
    default:
      return ura;
  }
}

export function managedAgentIdFromURA(agentURA: string): string {
  const parsed = parseURA(agentURA);
  if (parsed?.kind === "agent" && parsed.agentId) {
    return parsed.agentId;
  }
  const marker = "/agent/";
  const idx = agentURA.indexOf(marker);
  if (idx < 0) return "";
  const tail = agentURA.slice(idx + marker.length);
  const dotIdx = tail.indexOf(".");
  return dotIdx >= 0 ? tail.slice(dotIdx + 1) : tail;
}

export function isSystemManagedAgentId(agentId: string): boolean {
  return (
    agentId === "files" ||
    agentId === "pages" ||
    agentId.startsWith("consent-") ||
    agentId.startsWith("policy-") ||
    agentId.startsWith("mcp-")
  );
}

export function isUserVisibleAgentURA(agentURA: string): boolean {
  const agentId = managedAgentIdFromURA(agentURA);
  if (agentId) {
    return !isSystemManagedAgentId(agentId);
  }
  return true;
}

export function ownerKindOfURA(ura: string | undefined): OwnerKind {
  if (!ura) return "other";
  const parsed = parseURA(ura);
  if (!parsed) return "other";
  switch (parsed.kind) {
    case "hub":
      return "hub";
    case "agent":
      return isUserVisibleAgentURA(ura) ? "agent" : "system";
    case "user":
      return "user";
    case "device":
      return "device";
    default:
      return "other";
  }
}

export function isAgentURA(ura: string | undefined): boolean {
  return !!ura && parseURA(ura)?.kind === "agent";
}

export function isDeviceURA(ura: string | undefined): boolean {
  return !!ura && parseURA(ura)?.kind === "device";
}

export function isUserURA(ura: string | undefined): boolean {
  return !!ura && parseURA(ura)?.kind === "user";
}

export function isHubURA(ura: string | undefined): boolean {
  return !!ura && parseURA(ura)?.kind === "hub";
}

export function ownerKindShortLabel(kind: OwnerKind): string {
  switch (kind) {
    case "hub":
      return "hub";
    case "agent":
      return "agent";
    case "user":
      return "user";
    case "device":
      return "device";
    case "system":
      return "system";
    default:
      return "other";
  }
}

export function systemSurfaceLabel(ura: string): string {
  const managedId = managedAgentIdFromURA(ura);
  return managedId || uraDisplayId(ura);
}

export function agentRouteDisplayName(ura: string): string {
  const parsed = parseURA(ura);
  if (parsed?.kind === "agent") {
    return [parsed.userId, parsed.agentId].filter(Boolean).join(".");
  }
  return uraDisplayId(ura);
}

export function deriveManagedModelLabelFromAgentURA(targetURA: string): string | null {
  const parsed = parseURA(targetURA);
  if (parsed?.kind !== "agent" || !parsed.agentId) {
    return null;
  }
  if (/[./\\\s]/.test(parsed.agentId)) {
    return null;
  }
  return parsed.agentId;
}

export function deviceControlPlanePath(input: {
  ura?: string | null;
  nodeId?: string | null;
}): string {
  const parsed = input.ura ? parseURA(input.ura) : null;
  if (parsed?.kind === "device") {
    return `/control_plane/devices/${encodeURIComponent(input.ura ?? "")}`;
  }
  return `/control_plane/devices/${encodeURIComponent(input.nodeId ?? "")}`;
}

export function agentControlPlanePath(agentURA: string): string {
  return `/control_plane/agents/${encodeURIComponent(agentURA)}`;
}

export function canonicalAgentURAFromRoute(route: {
  agentId?: string | null;
}): string {
  const agentId = route.agentId?.trim() ?? "";
  return parseURA(agentId)?.kind === "agent" ? agentId : "";
}
