
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

type SidebarContextValue = {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
  expandedWidth: number
  collapsedWidth: number
  isMobile: boolean
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useRBSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error("useRBSidebar must be used within RBSidebarProvider")
  return ctx
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return isMobile
}

export function RBSidebarProvider({
  children,
  expandedWidth = 236,
  collapsedWidth = 64,
}: {
  children: React.ReactNode
  expandedWidth?: number
  collapsedWidth?: number
}) {
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try { return localStorage.getItem("rb_sidebar_collapsed") === "1" } catch { return false }
  })

  const applyWidthVar = useCallback(
    (isCollapsed: boolean, mobile: boolean) => {
      if (typeof document === "undefined") return
      document.documentElement.style.setProperty("--rb-sidebar-width", `${mobile ? 0 : isCollapsed ? collapsedWidth : expandedWidth}px`)
    },
    [collapsedWidth, expandedWidth],
  )

  useEffect(() => {
    applyWidthVar(collapsed, isMobile)
    if (!isMobile) try { localStorage.setItem("rb_sidebar_collapsed", collapsed ? "1" : "0") } catch {}
  }, [collapsed, isMobile, applyWidthVar])

  useEffect(() => { applyWidthVar(collapsed, isMobile) }, [])
  useEffect(() => { if (isMobile) setMobileOpen(false) }, [isMobile])

  const toggle = useCallback(() => {
    if (isMobile) setMobileOpen(v => !v)
    else setCollapsed(v => !v)
  }, [isMobile])

  const value = useMemo(
    () => ({ collapsed, toggle, setCollapsed, expandedWidth, collapsedWidth, isMobile, mobileOpen, setMobileOpen }),
    [collapsed, toggle, expandedWidth, collapsedWidth, isMobile, mobileOpen],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function RBSidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isMobile, mobileOpen, setMobileOpen, expandedWidth } = useRBSidebar()

  if (isMobile) {
    return (
      <>
        {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}
        <aside className={className} style={{
          position: "fixed", left: 0, top: 0, width: expandedWidth, height: "100dvh", zIndex: 50,
          overflow: "hidden", background: "var(--sidebar)",
          transform: mobileOpen ? "translateX(0)" : `translateX(-${expandedWidth}px)`,
          transition: "transform 250ms cubic-bezier(0.2, 0, 0, 1)",
        }}>{children}</aside>
      </>
    )
  }

  return (
    <aside className={className} style={{
      position: "fixed", left: 0, top: 0, width: "var(--rb-sidebar-width)", height: "100vh",
      zIndex: 30, overflow: "hidden",
      background: "transparent",
    }}>{children}</aside>
  )
}

export function RBMainOffset({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{ marginLeft: "var(--rb-sidebar-width)" }}>
      {children}
    </div>
  )
}
