import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

const docsRoot = path.join(process.cwd(), "docs");

export type DocMeta = {
  slug: string[];
  title: string;
  description: string;
  order: number;
};

export type DocEntry = DocMeta & {
  content: string;
};

function walkMarkdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkMarkdownFiles(fullPath);
    }

    return entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function toSlug(filePath: string) {
  const relativePath = path.relative(docsRoot, filePath);
  const withoutExtension = relativePath.replace(/\.md$/, "");

  return withoutExtension.split(path.sep);
}

function readDoc(filePath: string): DocEntry {
  const source = fs.readFileSync(filePath, "utf8");
  const { content, data } = matter(source);
  const slug = toSlug(filePath);

  return {
    slug,
    title: typeof data.title === "string" ? data.title : slug.at(-1) ?? "Document",
    description: typeof data.description === "string" ? data.description : "",
    order: typeof data.order === "number" ? data.order : 999,
    content,
  };
}

export function getAllDocs(): DocMeta[] {
  if (!fs.existsSync(docsRoot)) {
    return [];
  }

  return walkMarkdownFiles(docsRoot)
    .map(readDoc)
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
    .map((doc) => {
      const { content, ...meta } = doc;

      void content;

      return meta;
    });
}

export function getDocBySlug(slug: string[]): DocEntry | null {
  const normalizedSlug = slug.length === 0 ? ["index"] : slug;
  const filePath = path.join(docsRoot, ...normalizedSlug) + ".md";

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readDoc(filePath);
}
