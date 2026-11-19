import { useEffect, useRef, useState } from "react";
import type { Song } from "../types";

type Player = {
  cueVideoById: (options: { videoId: string; startSeconds: number }) => void;
  loadVideoById: (options: { videoId: string; startSeconds: number; endSeconds?: number }) => void;
  destroy: () => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: Player }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => Player;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

function playerErrorMessage(code: number) {
  if (code === 100) return "이 영상은 삭제되었거나 비공개 상태입니다.";
  if (code === 101 || code === 150) return "이 영상은 외부 사이트에서 재생할 수 없어요. 다른 영상을 등록해 주세요.";
  if (code === 5) return "브라우저에서 영상을 재생하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return "영상을 불러오지 못했어요. 링크를 확인하거나 다른 영상으로 바꿔 주세요.";
}

type Props = {
  song: Song;
  onReadyChange: (ready: boolean) => void;
  revealVideo?: boolean;
};

export default function YouTubePlayer({ song, onReadyChange, revealVideo = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ensureYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId: song.videoId,
        playerVars: {
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (cancelled) return;
            setReady(true);
            onReadyChange(true);
            target.cueVideoById({ videoId: song.videoId, startSeconds: song.startSeconds });
          },
          onError: ({ data }) => {
            onReadyChange(false);
            setError(playerErrorMessage(data));
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setReady(false);
      onReadyChange(false);
    };
  }, [song.videoId, song.startSeconds, onReadyChange]);

  const playClip = (clipLength: number) => {
    if (!playerRef.current || !ready) return;
    setError("");
    playerRef.current.loadVideoById({
      videoId: song.videoId,
      startSeconds: song.startSeconds,
      endSeconds: song.startSeconds + clipLength,
    });
  };

  useEffect(() => {
    const playRequestedClip = (event: Event) => {
      const seconds = (event as CustomEvent<number>).detail;
      playClip(seconds === 2 || seconds === 3 ? seconds : 1);
    };
    window.addEventListener("music-quiz-play-clip", playRequestedClip);
    return () => window.removeEventListener("music-quiz-play-clip", playRequestedClip);
  }, [ready, song.videoId, song.startSeconds]);

  return (
    <div className="player-shell">
      <div className="youtube-frame" aria-label="YouTube 영상 플레이어">
        <div ref={hostRef} />
        {!revealVideo && (
          <div className="video-curtain" aria-hidden="true">
            <span className="curtain-text">♪ 음악을 듣고 맞혀보세요</span>
          </div>
        )}
      </div>
      {error && <p className="player-error" role="alert">{error}</p>}
    </div>
  );
}
