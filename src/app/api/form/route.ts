import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // or "nodejs"

interface EntryField {
  entry: string;
  title: string;
  type: number;
  choices: string[];
}

function parseFBData(html: string): EntryField[] {
  const start = html.indexOf("FB_PUBLIC_LOAD_DATA_");
  if (start === -1) throw new Error("FB_PUBLIC_LOAD_DATA_ not found");

  const eq = html.indexOf("=", start);
  const open = html.indexOf("[", eq);

  // Walk brackets to find matching close
  let depth = 0;
  let end = -1;
  let inStr = false;
  let strCh = "";

  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === strCh) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strCh = ch;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Could not parse form data");

  const raw = html.slice(open, end);

  // Google uses \u003c etc; JSON.parse handles it if valid JSON
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    // Fallback for non-strict JSON (rare)
    data = new Function("return " + raw)();
  }

  const questions = data?.[1]?.[1] || [];
  const fields: EntryField[] = [];

  for (const q of questions) {
    const title: string = q[1] ?? "";
    const type: number = q[3] ?? 0;
    const entryArr = q[4];
    if (!entryArr || !entryArr[0]) continue;

    const entryId = entryArr[0][0];
    const choicesArr = entryArr[0][1];
    const choices: string[] = Array.isArray(choicesArr)
      ? choicesArr.map((c: any) => (Array.isArray(c) ? c[0] : c))
      : [];

    fields.push({
      entry: `entry.${entryId}`,
      title,
      type,
      choices,
    });
  }

  return fields;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Form fetch failed: ${res.status}` },
        { status: 502 },
      );
    }

    const html = await res.text();
    const fields = parseFBData(html);

    return NextResponse.json({ fields });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
