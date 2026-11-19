import * as XLSX from "@e965/xlsx";
import { getYouTubeVideoId } from "./youtube";
import type { Song } from "../types";

export type ExcelImportResult = {
  songs: Song[];
  skippedRows: number[];
};

function cellText(cell: XLSX.CellObject | undefined): string {
  const value = cell?.v;
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object") {
    const richText = (value as { richText?: unknown }).richText;
    if (Array.isArray(richText)) {
      return richText.map((part: unknown) => {
        if (!part || typeof part !== "object" || !("text" in part)) return "";
        return String(part.text ?? "");
      }).join("").trim();
    }
  }
  return "";
}

function cellLink(cell: XLSX.CellObject | undefined): string {
  const target = cell?.l?.Target;
  if (target) return target.trim();

  const value = cellText(cell);
  if (/^https?:\/\//i.test(value)) return value;

  const formula = cell?.f ?? "";
  const hyperlink = formula.match(/HYPERLINK\(\s*"((?:[^"]|"")+)"/i);
  return hyperlink?.[1]?.replace(/""/g, '"').trim() ?? "";
}

function normalizeHeader(value: string): string {
  return value.replace(/[\s_()-]/g, "").toLowerCase();
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

export async function readExcelPlaylist(file: File): Promise<ExcelImportResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet?.["!ref"]) throw new Error("엑셀 파일에 내용이 없습니다.");

  const range = XLSX.utils.decode_range(firstSheet["!ref"]);
  const headers = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) =>
    normalizeHeader(cellText(firstSheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + index })])),
  );
  const titleColumn = findColumn(headers, ["곡제목", "노래제목", "title", "song"]);
  const artistColumn = findColumn(headers, ["가수", "아티스트", "artist"]);
  const linkColumn = findColumn(headers, ["링크", "youtube", "url"]);
  const startColumn = findColumn(headers, ["시작", "start", "재생시점"]);

  if (titleColumn < 0 || artistColumn < 0 || linkColumn < 0) {
    throw new Error("첫 번째 시트에서 곡 제목, 가수, 링크 열을 찾지 못했어요.");
  }

  const songs: Song[] = [];
  const skippedRows: number[] = [];

  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const cellAt = (column: number) => firstSheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + column })];
    const title = cellText(cellAt(titleColumn));
    const artist = cellText(cellAt(artistColumn));
    const linkCell = cellAt(linkColumn);
    const youtubeUrl = cellLink(linkCell);
    const videoId = getYouTubeVideoId(youtubeUrl);
    const startRaw = startColumn >= 0 ? cellText(cellAt(startColumn)) : "0";
    const startSeconds = startRaw === "" ? 0 : Number(startRaw);

    if (!title && !artist && !cellText(linkCell)) continue;
    if (!title || !artist || !videoId || !/^[\w-]{11}$/.test(videoId) || !Number.isFinite(startSeconds) || startSeconds < 0) {
      skippedRows.push(row + 1);
      continue;
    }

    songs.push({ id: crypto.randomUUID(), title, artist, youtubeUrl, videoId, startSeconds });
  }

  if (songs.length === 0) throw new Error("가져올 수 있는 곡이 없어요. YouTube 링크가 포함되어 있는지 확인해 주세요.");
  return { songs, skippedRows };
}
