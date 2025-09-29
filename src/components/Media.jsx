// src/components/Media.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

const Media = React.memo(function Media({ media, onReady }) {
  if (!media || !media.kind) return null;

  if (media.kind === "image") return <OptimizedImage media={media} onReady={onReady} />;
  if (media.kind === "audio") return <OptimizedAudio media={media} onReady={onReady} />;
  if (media.kind === "video") return <OptimizedVideo media={media} onReady={onReady} />;

  return null;
});

export default Media;

/* -------------------- Image -------------------- */
function OptimizedImage({ media, onReady }) {
  const { src, alt = "", priority = false, webp, avif } = media;
  const [loaded, setLoaded] = useState(false);

  // Only include alternative sources if you actually provide them.
  const sources = useMemo(
    () => ({
      avif: typeof avif === "string" ? avif : null,
      webp: typeof webp === "string" ? webp : null,
    }),
    [avif, webp]
  );

  return (
    <picture>
      {sources.avif && <source srcSet={sources.avif} type="image/avif" />}
      {sources.webp && <source srcSet={sources.webp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchpriority={priority ? "high" : "auto"}
        className={[
          "mx-auto rounded-xl object-contain",
          "w-full max-h-96", // same as before
          "transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onLoad={() => {
          setLoaded(true);
          try { onReady && onReady(); } catch {}
        }}
      />
    </picture>
  );
}

/* -------------------- Video -------------------- */

// Light hook: becomes true when the element is near the viewport
function useInView(ref, rootMargin = "600px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setInView(true);
        });
      },
      { root: null, rootMargin, threshold: 0.01 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

function OptimizedVideo({ media, onReady }) {
  const { src, type = "video/mp4", poster } = media;
  const vRef = useRef(null);
  const inView = useInView(vRef, "600px"); // a bit earlier
  const [ready, setReady] = useState(false);
  const [srcOn, setSrcOn] = useState(null);

  // Attach source only when near viewport
  useEffect(() => {
    if (inView && !srcOn) setSrcOn(src);
  }, [inView, srcOn, src]);

  useEffect(() => {
    if (srcOn && vRef.current) {
      vRef.current.preload = "metadata";
      try { vRef.current.load(); } catch {}
    }
  }, [srcOn]);

  return (
    <video
      ref={vRef}
      controls
      preload="metadata"
      playsInline
      poster={poster}
      className={`w-full rounded-md bg-black/5 ${ready ? "opacity-100" : "opacity-0"}`}
      onCanPlay={() => {
        setReady(true);
        try { onReady && onReady(); } catch {}
      }}
    >
      {srcOn ? <source src={srcOn} type={type} /> : null}
      Το πρόγραμμα περιήγησής σου δεν μπορεί να αναπαράγει αυτό το βίντεο.
    </video>
  );
}

/* -------------------- Audio -------------------- */
function OptimizedAudio({ media, onReady }) {
  const { src } = media;
  return (
    <audio
      controls
      preload="metadata"
      playsInline
      className="w-full mt-2"
      style={{ minHeight: 44 }}
      onCanPlay={() => {
        try { onReady && onReady(); } catch {}
      }}
    >
      <source src={src} type="audio/mpeg" />
      Το πρόγραμμα περιήγησής σου δεν μπορεί να αναπαράγει αυτό το ηχητικό.
    </audio>
  );
}
