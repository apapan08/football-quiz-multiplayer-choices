// src/hooks/useRoomChannel.js
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";

export default function useRoomChannel({
  code,
  user_id,
  name,
  is_host = false,
  onStart,
  onFinishBroadcast,
}) {
  const normCode = useMemo(() => (code || "").trim().toUpperCase(), [code]);
  const [roster, setRoster] = useState([]);
  const chanRef = useRef(null);

  // Keep latest handlers in refs to avoid re-subscribing on each render
  const onStartRef = useRef(onStart);
  const onFinishRef = useRef(onFinishBroadcast);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { onFinishRef.current = onFinishBroadcast; }, [onFinishBroadcast]);

  useEffect(() => {
    if (!normCode || !user_id) return;

    const channel = supabase.channel(`room:${normCode}`, {
      config: { presence: { key: user_id } },
    });
    chanRef.current = channel;

    const rebuild = () => {
      const st = channel.presenceState(); // { [uid]: [meta, meta...] }
      const by = new Map();
      Object.entries(st).forEach(([uid, metas]) => {
        (metas || []).forEach((m) => by.set(uid, { user_id: uid, ...m }));
      });
      const arr = Array.from(by.values()).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
      setRoster(arr);
      console.log("[presence] sync", arr);
    };

    channel
      .on("presence", { event: "sync" }, rebuild)
      .on("presence", { event: "join" }, rebuild)
      .on("presence", { event: "leave" }, rebuild)
      .on("broadcast", { event: "start" }, ({ payload }) => {
        console.log("[broadcast] start", payload);
        onStartRef.current && onStartRef.current(payload);
      })
      .on("broadcast", { event: "finish" }, ({ payload }) => {
        console.log("[broadcast] finish", payload);
        onFinishRef.current && onFinishRef.current(payload);
      });

    channel.subscribe((status) => {
      console.log("[realtime] status", status, `room:${normCode}`);
      if (status === "SUBSCRIBED") {
        channel.track({ user_id, name, is_host: !!is_host, finished: false });
      }
    });

    return () => {
      try { channel.unsubscribe(); } catch {}
      chanRef.current = null;
    };
    // ⬇️ DO NOT depend on onStart/onFinishBroadcast to keep subscription stable
  }, [normCode, user_id, name, is_host]);

  async function broadcastStart(p) {
    if (!chanRef.current) return;
    const startedAt = p && p.startedAt ? p.startedAt : Date.now();
    await chanRef.current.send({
      type: "broadcast",
      event: "start",
      payload: { startedAt },
    });
  }

  async function broadcastFinish(p) {
    if (!chanRef.current) return;
    await chanRef.current.send({ type: "broadcast", event: "finish", payload: p });
    try {
      await chanRef.current.track({
        user_id: p.user_id,
        name: p.name,
        is_host: !!is_host,
        finished: true,
      });
    } catch {}
  }

  return { roster, broadcastStart, broadcastFinish };
}
