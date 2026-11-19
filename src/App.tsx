import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import YouTubePlayer from "./components/YouTubePlayer";
import { readExcelPlaylist } from "./lib/importExcel";
import { getYouTubeVideoId } from "./lib/youtube";
import type { Song } from "./types";

const STORAGE_KEY = "one-second-quiz-songs-v2";
const PLAYLIST_NAME_KEY = "one-second-quiz-name-v2";

function readSongs(): Song[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as Song[]) : [];
  } catch {
    return [];
  }
}

function createId() {
  return crypto.randomUUID();
}

export default function App() {
  const [songs, setSongs] = useState<Song[]>(readSongs);
  const [playlistName, setPlaylistName] = useState(() => localStorage.getItem(PLAYLIST_NAME_KEY) ?? "내 플레이리스트");
  const [page, setPage] = useState<"playlist" | "question" | "answer">("playlist");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const excelInputRef = useRef<HTMLInputElement>(null);
  const currentSong = songs[currentIndex] ?? null;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }, [songs]);

  useEffect(() => {
    localStorage.setItem(PLAYLIST_NAME_KEY, playlistName);
  }, [playlistName]);

  const addSong = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    const artist = String(form.get("artist") ?? "").trim();
    const youtubeUrl = String(form.get("youtubeUrl") ?? "").trim();
    const startSeconds = Number(form.get("startSeconds"));
    const videoId = getYouTubeVideoId(youtubeUrl);

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      setError("올바른 YouTube 영상 링크를 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(startSeconds) || startSeconds < 0) {
      setError("재생 시작 시점은 0초 이상이어야 해요.");
      return;
    }

    setSongs((items) => [...items, {
      id: createId(),
      title,
      artist,
      youtubeUrl,
      videoId,
      startSeconds,
    }]);
    formElement.reset();
    setError("");
    setShowPlaylist(false);
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const { readExcelPlaylist } = await import("./lib/importExcel");
      const result = await readExcelPlaylist(file);
      if (songs.length > 0 && !window.confirm(`엑셀에서 ${result.songs.length}곡을 불러오면 현재 플레이리스트 ${songs.length}곡이 교체돼요. 계속할까요?`)) {
        return;
      }
      setSongs(result.songs);
      setShowPlaylist(false);
      setError("");
      const skipped = result.skippedRows.length > 0
        ? ` 링크나 필수 정보가 없어 ${result.skippedRows.join(", ")}행은 건너뛰었어요.`
        : "";
      setImportMessage(`${result.songs.length}곡을 불러왔어요.${skipped}`);
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "엑셀 파일을 읽지 못했어요.");
    }
  };

  const startGame = () => {
    if (songs.length === 0) return;
    setCurrentIndex(0);
    setPlayerReady(false);
    setShowPlaylist(false);
    setPage("question");
  };

  const returnToPlaylist = () => {
    setShowPlaylist(false);
    setPage("playlist");
  };

  const nextQuestion = () => {
    if (currentIndex + 1 >= songs.length) {
      returnToPlaylist();
      return;
    }
    setPlayerReady(false);
    setCurrentIndex((index) => index + 1);
    setPage("question");
  };

  if ((page === "question" || page === "answer") && currentSong) {
    const isLastQuestion = currentIndex === songs.length - 1;
    return (
      <main className={`app game-page ${page === "answer" ? "answer-page" : "question-page"}`}>
        <header className="simple-header">
          {page === "question" ? <button className="plain-link" onClick={returnToPlaylist}>← 플레이리스트</button> : <span />}
          <strong>1초 노래 맞히기</strong>
        </header>
        {page === "question" ? (
          <section className="game-content">
            <p className="question-count">문제 {currentIndex + 1} <span>/ {songs.length}</span></p>
            <h1>노래를 맞혀보세요</h1>
            <YouTubePlayer key={currentSong.id} song={currentSong} onReadyChange={setPlayerReady} />
            <div className="game-buttons">
              <div className="listen-buttons">
                <button className="button button-light" disabled={!playerReady} onClick={() => window.dispatchEvent(new CustomEvent("music-quiz-play-clip", { detail: 1 }))}>1초 듣기</button>
                <button className="button button-light" disabled={!playerReady} onClick={() => window.dispatchEvent(new CustomEvent("music-quiz-play-clip", { detail: 2 }))}>2초 듣기</button>
                <button className="button button-light" disabled={!playerReady} onClick={() => window.dispatchEvent(new CustomEvent("music-quiz-play-clip", { detail: 3 }))}>3초 듣기</button>
              </div>
              <button className="button button-dark" onClick={() => setPage("answer")}>정답 공개 <span aria-hidden="true">→</span></button>
            </div>
          </section>
        ) : (
          <section className="answer-content">
            <p className="question-count">문제 {currentIndex + 1} <span>/ {songs.length}</span></p>
            <YouTubePlayer key={currentSong.id} song={currentSong} onReadyChange={setPlayerReady} revealVideo />
            <h1>정답</h1>
            <p className="answer-title">{currentSong.title}</p>
            <p className="answer-artist">{currentSong.artist}</p>
            <button className="button button-dark answer-next" onClick={nextQuestion}>
              {isLastQuestion ? "플레이리스트로 돌아가기" : "다음 문제"} <span aria-hidden="true">→</span>
            </button>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app playlist-page">
      <header className="simple-header">
        <strong>1초 노래 맞히기</strong>
        <span>플레이리스트</span>
      </header>

      <section className="playlist-content">
        <div className="page-title">
          <h1>플레이리스트</h1>
          <p>YouTube 링크를 등록하고 게임을 시작하세요.</p>
        </div>

        <label className="playlist-name-field">
          <span>플레이리스트 이름</span>
          <input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} />
        </label>

        <section className="excel-import">
          <div>
            <h2>엑셀에서 불러오기</h2>
            <p>첫 번째 시트에 곡 제목, 가수, YouTube 링크 열이 있는 파일을 선택하세요. 불러오면 현재 목록이 교체됩니다.</p>
          </div>
          <input ref={excelInputRef} className="visually-hidden" type="file" accept=".xlsx,.xls" onChange={importExcel} />
          <button className="button button-light" type="button" onClick={() => excelInputRef.current?.click()}>엑셀 파일 선택</button>
          {importMessage && <p className="import-message" role="status">{importMessage}</p>}
        </section>

        <form className="song-form" onSubmit={addSong}>
          <h2>곡 추가</h2>
          <div className="form-grid">
            <label className="field"><span>곡 제목</span><input name="title" placeholder="곡 제목" required /></label>
            <label className="field"><span>가수</span><input name="artist" placeholder="가수 이름" required /></label>
            <label className="field field-wide"><span>YouTube 링크</span><input name="youtubeUrl" type="url" placeholder="https://www.youtube.com/watch?v=..." required /></label>
            <label className="field"><span>재생 시작 시점 (초)</span><input name="startSeconds" type="number" min="0" step="0.1" defaultValue="0" required /></label>
            <div className="field-submit"><button className="button button-light" type="submit">곡 추가</button></div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>

        <section className="song-section">
          <div className="song-heading">
            <h2>플레이리스트</h2>
            <button className="playlist-toggle" aria-expanded={showPlaylist} aria-controls="playlist-contents" onClick={() => setShowPlaylist((visible) => !visible)}>
              {showPlaylist ? "목록 숨기기" : "목록 보기"}
            </button>
          </div>
          {showPlaylist ? (
            <div id="playlist-contents">
              {songs.length > 0 ? (
                <ol className="song-list">
                  {songs.map((song, index) => (
                    <li className="song-item" key={song.id}>
                      <span className="song-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="song-info"><strong>{song.title}</strong><small>{song.artist}</small></span>
                      <span className="song-start">{song.startSeconds}초</span>
                      <button className="remove-song" onClick={() => setSongs((items) => items.filter((item) => item.id !== song.id))} aria-label={`${song.title} 삭제`}>삭제</button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-state">등록된 곡이 없습니다.</p>
              )}
            </div>
          ) : (
            <p className="hidden-playlist" id="playlist-contents">목록이 숨겨져 있습니다.</p>
          )}
        </section>

        <button className="button button-dark start-button" onClick={startGame} disabled={songs.length === 0}>시작 <span aria-hidden="true">→</span></button>
        <p className="local-note">플레이리스트는 이 브라우저에 저장됩니다.</p>
      </section>
    </main>
  );
}
