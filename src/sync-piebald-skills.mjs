import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

export const DEFAULT_SOURCE =
  "https://github.com/Piebald-AI/claude-code-system-prompts/tree/main/system-prompts";
export const DEFAULT_OUTPUT_DIR = "skills";
export const DEFAULT_SELECTION = "builtin-skills";
export const MANIFEST_FILENAME = ".ccskills-sync.json";

const SUPPORTED_SELECTIONS = new Set(["builtin-skills", "skill-related"]);

function githubRequestHeaders() {
  const headers = {
    Accept: "application/vnd.github+json"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function parseArgs(argv) {
  let source = DEFAULT_SOURCE;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let selection = DEFAULT_SELECTION;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output-dir") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--output-dir requires a value");
      }

      outputDir = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--selection") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--selection requires a value");
      }

      if (!SUPPORTED_SELECTIONS.has(nextValue)) {
        throw new Error(
          `Unsupported --selection value "${nextValue}". Use one of: ${Array.from(
            SUPPORTED_SELECTIONS
          ).join(", ")}`
        );
      }

      selection = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    source = arg;
  }

  return {
    source,
    outputDir,
    selection,
    dryRun
  };
}

export function parseSource(rawSource) {
  const source = rawSource.trim();

  if (!source) {
    throw new Error("Source must not be empty");
  }

  if (
    path.isAbsolute(source) ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    source === "." ||
    source === ".."
  ) {
    return {
      type: "local",
      rootPath: path.resolve(source)
    };
  }

  const githubTreeMatch = source.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?\/?$/
  );
  if (githubTreeMatch) {
    return {
      type: "github",
      owner: githubTreeMatch[1],
      repo: githubTreeMatch[2].replace(/\.git$/, ""),
      ref: githubTreeMatch[3],
      subpath: githubTreeMatch[4] ?? ""
    };
  }

  const githubRepoMatch = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (githubRepoMatch) {
    return {
      type: "github",
      owner: githubRepoMatch[1],
      repo: githubRepoMatch[2],
      ref: "",
      subpath: ""
    };
  }

  const shorthandMatch = source.match(/^([^/]+)\/([^/]+)$/);
  if (shorthandMatch) {
    return {
      type: "github",
      owner: shorthandMatch[1],
      repo: shorthandMatch[2],
      ref: "",
      subpath: ""
    };
  }

  throw new Error(
    `Unsupported source "${rawSource}". Use a local path, GitHub owner/repo shorthand, or a GitHub URL.`
  );
}

async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: githubRequestHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${url}\n${text}`);
  }

  return response.json();
}

async function fetchText(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: githubRequestHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prompt download failed (${response.status}): ${url}\n${text}`);
  }

  return response.text();
}

function encodeGitHubPath(targetPath) {
  return targetPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function resolveGitHubRef(parsedSource, fetchImpl = fetch) {
  if (parsedSource.ref) {
    return parsedSource.ref;
  }

  const repoInfo = await fetchJson(
    `https://api.github.com/repos/${parsedSource.owner}/${parsedSource.repo}`,
    fetchImpl
  );
  return repoInfo.default_branch;
}

async function fetchGitHubDirectoryEntries(parsedSource, directoryPath, ref, fetchImpl = fetch) {
  const encodedPath = encodeGitHubPath(directoryPath);
  const pathSuffix = encodedPath ? `/${encodedPath}` : "";
  const url = `https://api.github.com/repos/${parsedSource.owner}/${parsedSource.repo}/contents${pathSuffix}?ref=${encodeURIComponent(
    ref
  )}`;

  const payload = await fetchJson(url, fetchImpl);
  return Array.isArray(payload) ? payload : [payload];
}

export function matchesSelection(filename, selection) {
  if (!filename.endsWith(".md")) {
    return false;
  }

  if (selection === "builtin-skills") {
    return /^skill-.*\.md$/.test(filename);
  }

  if (selection === "skill-related") {
    return filename.includes("skill");
  }

  throw new Error(`Unknown selection: ${selection}`);
}

export function promptFileToSkillSlug(filename) {
  const baseName = filename.replace(/\.md$/, "");
  return baseName.startsWith("skill-") ? baseName.slice("skill-".length) : baseName;
}

export function extractPromptMetadata(markdown) {
  const match = markdown.match(/^<!--\r?\n([\s\S]*?)\r?\n-->\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Prompt file is missing the leading metadata comment block");
  }

  return {
    metadata: parseCommentMetadata(match[1]),
    body: match[2]
  };
}

export function parseCommentMetadata(rawMetadata) {
  const lines = rawMetadata.split(/\r?\n/);
  const metadata = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    const listItemMatch = line.match(/^\s*-\s+(.*)$/);
    if (listItemMatch) {
      throw new Error(`Unexpected list item without a list key: ${line}`);
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!keyValueMatch) {
      throw new Error(`Unsupported metadata line: ${line}`);
    }

    const key = keyValueMatch[1];
    const rawValue = keyValueMatch[2] ?? "";

    if (!rawValue) {
      if (key === "variables") {
        const values = [];
        let innerIndex = index + 1;

        for (; innerIndex < lines.length; innerIndex += 1) {
          const innerLine = lines[innerIndex];
          const innerMatch = innerLine.match(/^\s*-\s+(.*)$/);
          if (!innerMatch) {
            break;
          }

          values.push(unquote(innerMatch[1].trim()));
        }

        metadata[key] = values;
        index = innerIndex - 1;
        continue;
      }

      metadata[key] = "";
      continue;
    }

    if (rawValue === ">" || rawValue === "|") {
      const values = [];
      let innerIndex = index + 1;

      for (; innerIndex < lines.length; innerIndex += 1) {
        const innerLine = lines[innerIndex];
        if (!/^\s+/.test(innerLine)) {
          break;
        }

        values.push(innerLine.trim());
      }

      const joinedValue =
        rawValue === ">" ? values.join(" ").replace(/\s+/g, " ").trim() : values.join("\n");
      metadata[key] = joinedValue;
      index = innerIndex - 1;
      continue;
    }

    metadata[key] = unquote(rawValue.trim());
  }

  return metadata;
}

function unquote(value) {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function yamlString(value) {
  return JSON.stringify(value);
}

export function buildSkillDocument(skill) {
  const lines = [
    "---",
    `name: ${yamlString(skill.slug)}`,
    `description: ${yamlString(skill.description)}`,
    "metadata:",
    `  originalName: ${yamlString(skill.originalName)}`,
    `  ccVersion: ${yamlString(skill.ccVersion)}`,
    `  sourceUrl: ${yamlString(skill.sourceUrl)}`,
    "  source:",
    `    owner: ${yamlString(skill.source.owner)}`,
    `    repo: ${yamlString(skill.source.repo)}`,
    `    ref: ${yamlString(skill.source.ref)}`,
    `    path: ${yamlString(skill.source.path)}`
  ];

  if (skill.variables.length > 0) {
    lines.push("  variables:");
    for (const variable of skill.variables) {
      lines.push(`    - ${yamlString(variable)}`);
    }
  }

  lines.push("---", "");

  const normalizedBody = skill.body.replace(/^\s+/, "");
  return `${lines.join("\n")}\n${normalizedBody}`;
}

export async function resolveLocalSourceDir(rootPath, selection = DEFAULT_SELECTION) {
  const resolvedRoot = path.resolve(rootPath);
  const directEntries = await readdir(resolvedRoot, { withFileTypes: true });
  const systemPromptsPath = path.join(resolvedRoot, "system-prompts");
  const hasMatchingMarkdownAtRoot = directEntries.some(
    (entry) => entry.isFile() && matchesSelection(entry.name, selection)
  );

  if (!hasMatchingMarkdownAtRoot && (await pathExists(systemPromptsPath))) {
    return systemPromptsPath;
  }

  return resolvedRoot;
}

async function readLocalPromptFiles(parsedSource, selection) {
  const sourceDir = await resolveLocalSourceDir(parsedSource.rootPath, selection);
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const promptFiles = [];

  for (const entry of entries) {
    if (!entry.isFile() || !matchesSelection(entry.name, selection)) {
      continue;
    }

    const filePath = path.join(sourceDir, entry.name);
    promptFiles.push({
      filename: entry.name,
      relativePath: path.basename(sourceDir) === "system-prompts" ? `system-prompts/${entry.name}` : entry.name,
      content: await readFile(filePath, "utf8"),
      sourceUrl: `file://${filePath}`
    });
  }

  return {
    owner: "local",
    repo: path.basename(parsedSource.rootPath),
    ref: "local",
    promptFiles
  };
}

async function readGitHubPromptFiles(parsedSource, selection, fetchImpl = fetch) {
  const ref = await resolveGitHubRef(parsedSource, fetchImpl);
  let directoryPath = parsedSource.subpath;

  if (!directoryPath) {
    const rootEntries = await fetchGitHubDirectoryEntries(parsedSource, "", ref, fetchImpl);
    const systemPromptsDir = rootEntries.find(
      (entry) => entry.type === "dir" && entry.name === "system-prompts"
    );
    directoryPath = systemPromptsDir ? "system-prompts" : "";
  }

  const entries = await fetchGitHubDirectoryEntries(parsedSource, directoryPath, ref, fetchImpl);
  const markdownEntries = entries.filter(
    (entry) => entry.type === "file" && matchesSelection(entry.name, selection)
  );

  const promptFiles = await Promise.all(
    markdownEntries.map(async (entry) => ({
      filename: entry.name,
      relativePath: entry.path,
      content: await fetchText(entry.download_url, fetchImpl),
      sourceUrl: `https://github.com/${parsedSource.owner}/${parsedSource.repo}/blob/${ref}/${entry.path}`
    }))
  );

  return {
    owner: parsedSource.owner,
    repo: parsedSource.repo,
    ref,
    promptFiles
  };
}

export async function collectPromptFiles(rawSource, selection, fetchImpl = fetch) {
  const parsedSource = parseSource(rawSource);

  if (parsedSource.type === "local") {
    return readLocalPromptFiles(parsedSource, selection);
  }

  return readGitHubPromptFiles(parsedSource, selection, fetchImpl);
}

export function normalizePromptToSkill(prompt, sourceInfo) {
  const { metadata, body } = extractPromptMetadata(prompt.content);
  const description = metadata.description;
  const originalName = metadata.name;

  if (!description || !originalName) {
    throw new Error(`Prompt ${prompt.relativePath} is missing name or description metadata`);
  }

  return {
    slug: promptFileToSkillSlug(prompt.filename),
    description,
    originalName,
    ccVersion: metadata.ccVersion ?? "",
    variables: Array.isArray(metadata.variables) ? metadata.variables : [],
    body,
    sourceUrl: prompt.sourceUrl,
    source: {
      owner: sourceInfo.owner,
      repo: sourceInfo.repo,
      ref: sourceInfo.ref,
      path: prompt.relativePath
    }
  };
}

async function loadManifest(outputDir) {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  if (!(await pathExists(manifestPath))) {
    return {
      skills: []
    };
  }

  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function writeManifest(outputDir, manifest) {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rm(manifestPath, { force: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rm(`${manifestPath}.tmp`, { force: true });
}

export async function syncSkills({
  source = DEFAULT_SOURCE,
  outputDir = DEFAULT_OUTPUT_DIR,
  selection = DEFAULT_SELECTION,
  dryRun = false,
  fetchImpl = fetch
} = {}) {
  const resolvedOutputDir = path.resolve(outputDir);
  const sourceInfo = await collectPromptFiles(source, selection, fetchImpl);
  const normalizedSkills = sourceInfo.promptFiles
    .map((prompt) => normalizePromptToSkill(prompt, sourceInfo))
    .sort((left, right) => left.slug.localeCompare(right.slug));

  if (normalizedSkills.length === 0) {
    throw new Error(`No prompt files matched selection "${selection}" for source "${source}"`);
  }

  if (dryRun) {
    return {
      wrote: false,
      outputDir: resolvedOutputDir,
      skills: normalizedSkills.map((skill) => skill.slug)
    };
  }

  await mkdir(resolvedOutputDir, { recursive: true });

  const existingManifest = await loadManifest(resolvedOutputDir);
  const previouslyGenerated = new Set(existingManifest.skills ?? []);
  const nextGenerated = new Set(normalizedSkills.map((skill) => skill.slug));

  for (const oldSlug of previouslyGenerated) {
    if (nextGenerated.has(oldSlug)) {
      continue;
    }

    await rm(path.join(resolvedOutputDir, oldSlug), { recursive: true, force: true });
  }

  for (const skill of normalizedSkills) {
    const skillDir = path.join(resolvedOutputDir, skill.slug);
    const skillFile = path.join(skillDir, "SKILL.md");
    const alreadyExists = await pathExists(skillDir);

    if (alreadyExists && !previouslyGenerated.has(skill.slug)) {
      throw new Error(
        `Refusing to overwrite existing non-generated directory: ${path.relative(
          process.cwd(),
          skillDir
        )}`
      );
    }

    await mkdir(skillDir, { recursive: true });
    await writeFile(skillFile, buildSkillDocument(skill), "utf8");
  }

  await writeManifest(resolvedOutputDir, {
    source,
    selection,
    skills: normalizedSkills.map((skill) => skill.slug)
  });

  return {
    wrote: true,
    outputDir: resolvedOutputDir,
    skills: normalizedSkills.map((skill) => skill.slug)
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncSkills(options);

  if (result.wrote) {
    console.log(`Synced ${result.skills.length} skills into ${result.outputDir}`);
  } else {
    console.log(`Would sync ${result.skills.length} skills into ${result.outputDir}`);
  }

  for (const skill of result.skills) {
    console.log(`- ${skill}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
