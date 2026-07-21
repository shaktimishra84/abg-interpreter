const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = __dirname;
const owner = "shaktimishra84";
const repo = "abg-interpreter";
const repoFullName = `${owner}/${repo}`;
const gh = path.join(root, ".tools/gh/bin/gh");
const node = path.join(root, ".tools/node/bin/node");
const vercel = path.join(root, ".tools/vercel-cli/node_modules/.bin/vercel");
const ghConfig = path.join(root, ".gh-config");
const professionalAliases = [
  "abg-clinical-interpreter.vercel.app",
  "clinical-abg-interpreter.vercel.app",
  "abg-emergency-interpreter.vercel.app"
];

const appFiles = [
  ".gitignore",
  ".nojekyll",
  ".vercelignore",
  "README.md",
  "package.json",
  "vercel.json",
  "index.html",
  "styles.css",
  "app.js",
  "engine.js",
  "ocr-parser.js",
  "smoke-test.js"
];

const appDirs = ["images"];

function run(command, args, options = {}) {
  return cp.execFileSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"]
  });
}

function token() {
  const tries = [
    { GH_CONFIG_DIR: ghConfig },
    {}
  ];
  for (const env of tries) {
    try {
      const value = run(gh, ["auth", "token"], { env }).trim();
      if (value) return value;
    } catch (_) {
      // Try the next auth store.
    }
  }
  throw new Error("GitHub token not found. Run gh auth login first.");
}

async function api(method, endpoint, body, authToken) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "abg-publisher",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${endpoint} failed ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function pushToGithub() {
  const authToken = token();
  const ref = await api("GET", `/repos/${repoFullName}/git/ref/heads/main`, null, authToken);
  const headSha = ref.object.sha;
  const headCommit = await api("GET", `/repos/${repoFullName}/git/commits/${headSha}`, null, authToken);
  const tree = [];

  for (const file of appFiles) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    const blob = await api("POST", `/repos/${repoFullName}/git/blobs`, {
      content,
      encoding: "utf-8"
    }, authToken);
    tree.push({ path: file, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await api("POST", `/repos/${repoFullName}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree
  }, authToken);

  if (newTree.sha === headCommit.tree.sha) {
    console.log(`GitHub already up to date: ${headSha}`);
    return headSha;
  }

  const newCommit = await api("POST", `/repos/${repoFullName}/git/commits`, {
    message: "Add corrective measures to ABG report",
    tree: newTree.sha,
    parents: [headSha]
  }, authToken);

  await api("PATCH", `/repos/${repoFullName}/git/refs/heads/main`, {
    sha: newCommit.sha,
    force: false
  }, authToken);

  console.log(`GitHub main updated: ${newCommit.sha}`);
  return newCommit.sha;
}

function findDeploymentHost(output) {
  const matches = Array.from(String(output).matchAll(/https:\/\/([a-zA-Z0-9.-]+\.vercel\.app)\b/g));
  if (!matches.length) return "";
  return matches[matches.length - 1][1];
}

function setProfessionalAlias(deploymentHost, env, cwd) {
  if (!deploymentHost) return "";
  for (const alias of professionalAliases) {
    try {
      const output = run(vercel, ["alias", "set", `https://${deploymentHost}`, alias], {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      if (output.trim()) console.log(output.trim());
      console.log(`Professional URL: https://${alias}`);
      return `https://${alias}`;
    } catch (error) {
      const detail = String(error.stderr || error.message || "").split("\n").filter(Boolean).slice(-1)[0] || "alias not available";
      console.log(`Alias unavailable: https://${alias} (${detail})`);
    }
  }
  return "";
}

function deployToVercel() {
  const deployDir = fs.mkdtempSync(path.join("/private/tmp", "abg-deploy-"));
  for (const file of appFiles.filter((item) => item !== "smoke-test.js")) {
    fs.copyFileSync(path.join(root, file), path.join(deployDir, file));
  }
  for (const dir of appDirs) {
    const src = path.join(root, dir);
    const dest = path.join(deployDir, dir);
    const copy = (src, dest) => {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(file => {
          if (!file.startsWith("._")) {  // Skip macOS metadata files
            copy(path.join(src, file), path.join(dest, file));
          }
        });
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    };
    copy(src, dest);
  }
  fs.mkdirSync(path.join(deployDir, ".vercel"), { recursive: true });
  fs.copyFileSync(path.join(root, ".vercel/project.json"), path.join(deployDir, ".vercel/project.json"));

  const env = {
    PATH: `${path.join(root, ".tools/node/bin")}:${process.env.PATH || ""}`,
    XDG_CONFIG_HOME: path.join(root, ".tools/vercel-xdg/config"),
    XDG_CACHE_HOME: path.join(root, ".tools/vercel-xdg/cache"),
    XDG_DATA_HOME: path.join(root, ".tools/vercel-xdg/data")
  };
  const output = run(vercel, ["--prod", "--yes"], {
    cwd: deployDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  console.log(output.trim());
  const deploymentHost = findDeploymentHost(output);
  const professionalUrl = setProfessionalAlias(deploymentHost, env, deployDir);
  return professionalUrl || (deploymentHost ? `https://${deploymentHost}` : "https://abg-photo-interpreter.vercel.app");
}

(async () => {
  run(node, ["smoke-test.js"], { stdio: "inherit" });
  await pushToGithub();
  const liveUrl = deployToVercel();
  console.log(`Done. Live URL: ${liveUrl}`);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
