import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DeliverySession, type DeliveryEvents, type DeliveryPort } from './DeliverySession';

const port: DeliveryPort = {
  plan: () => invoke('get_deployment_plan'),
  status: () => invoke('get_delivery_sync_status'),
  deploy: () => invoke('deploy_content'),
  verify: () => invoke('verify_remote_content'),
  pull: () => invoke('pull_remote_content'),
};

export function useDeliverySession(active: boolean, unsavedCount: number, events: DeliveryEvents) {
  const latest = useRef(events);
  latest.current = events;
  const [session] = useState(() => new DeliverySession(port, {
    error: message => latest.current.error(message),
    status: status => latest.current.status(status),
    pulled: () => latest.current.pulled(),
  }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    if (!active) return;
    void session.refreshPlan();
    let running = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await session.refreshStatus(false);
      if (running) timer = setTimeout(() => void poll(), session.pollDelay);
    };
    void poll();
    return () => { running = false; clearTimeout(timer); };
  }, [active, session]);
  useEffect(() => {
    if (active) void session.pull(unsavedCount, true);
  }, [active, unsavedCount, session, snapshot.status, snapshot.operation, snapshot.planLoad, snapshot.failure]);
  return { session, snapshot, readiness: session.readiness(unsavedCount) };
}
