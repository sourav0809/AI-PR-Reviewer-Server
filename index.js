import express from "express";
import axios from "axios";
import { aiPrompt } from "./promt.js";
import { GoogleGenAI } from "@google/genai";
import { shouldIgnoreFile } from "./helpers/helpers.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

const PERSONAL_ACCESS_TOKEN = process.env.PERSONAL_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHUNK_SIZE = 200; // Process 200 lines at once
const REQUEST_DELAY = 2000; // 2 seconds between batches

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

app.post("/webhook", async (req, res) => {
  if (!req.body) {
    console.log("Missing request body");
    return res.status(400).send("Missing request body");
  }

  const { action, pull_request, repository } = req.body;

  if (
    !pull_request ||
    !["opened", "synchronize", "reopened"].includes(action)
  ) {
    console.log("Ignored event");
    return res.status(200).send("Ignored event");
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const prNumber = pull_request.number;

  try {
    await handlePullRequest(owner, repo, prNumber);
    res.status(200).send("AI review completed successfully");
  } catch (err) {
    console.error("Review failed:", err.message);
    res.status(500).send("Internal Error");
  }
});

async function handlePullRequest(owner, repo, prNumber) {
  console.log(`🚀 Handling PR #${prNumber} for ${owner}/${repo}`);

  const files = await getChangedFiles(owner, repo, prNumber);
  console.log(`📁 Changed Files: ${files.length}`);

  const filteredFiles = files?.filter(
    (file) => !shouldIgnoreFile(file?.filename)
  );

  if (filteredFiles.length === 0) {
    console.log("No files to review after filtering");
    return;
  }

  const latestCommit = await getLatestCommitSha(owner, repo, prNumber);
  console.log(`🔍 Latest Commit SHA: ${latestCommit}`);

  // Process files in parallel with controlled concurrency
  const batchSize = 5;
  for (let i = 0; i < filteredFiles.length; i += batchSize) {
    const batch = filteredFiles.slice(i, i + batchSize);
    await Promise.all(
      batch.map((file) =>
        processFile(owner, repo, prNumber, latestCommit, file)
      )
    );
    await delay(REQUEST_DELAY);
  }

  console.log(`🎉 Completed AI review for PR #${prNumber}`);
}

async function processFile(owner, repo, prNumber, commitId, file) {
  console.log(`\n📂 Processing file: ${file.filename}`);

  if (!file.patch) {
    console.log(`⚠️ Skipping file (no patch): ${file.filename}`);
    return;
  }

  const { changedLines, lineNumberMap } = extractChangedLinesWithLineNumbers(
    file.patch
  );
  if (changedLines.length === 0) {
    console.log(`⚠️ Skipping file (no meaningful new code): ${file.filename}`);
    return;
  }

  // Process lines in chunks
  for (let i = 0; i < changedLines.length; i += CHUNK_SIZE) {
    const chunk = changedLines.slice(i, i + CHUNK_SIZE);
    const lineNumbers = lineNumberMap.slice(i, i + CHUNK_SIZE);

    try {
      const suggestions = await getAISuggestionsForChunk(
        chunk,
        lineNumbers,
        file.filename
      );
      await postComments(
        owner,
        repo,
        prNumber,
        commitId,
        file.filename,
        suggestions
      );
      await delay(REQUEST_DELAY);
    } catch (err) {
      console.error(
        `Error processing chunk ${i}-${i + CHUNK_SIZE} in ${file.filename}:`,
        err.message
      );
    }
  }
}

async function getAISuggestionsForChunk(codeLines, lineNumbers, filename) {
  const context = codeLines
    .map((line, i) => `Line ${lineNumbers[i]}: ${line}`)
    .join("\n");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${aiPrompt}\n\nFile: ${filename}\n\nCode changes:\n${context}`,
            },
          ],
        },
      ],
    });

    const rawResponse =
      response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawResponse) return [];

    // Parse the response into individual suggestions
    return parseAISuggestions(rawResponse, lineNumbers);
  } catch (err) {
    console.error("Gemini API Error:", err.message);
    return [];
  }
}

function parseAISuggestions(response, lineNumbers) {
  // Split response into individual suggestions
  const suggestions = response
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .filter(
      (line) =>
        !["No suggestion", "Looks good", "ignore file"].includes(line.trim())
    );

  // Map suggestions to their line numbers (simplified - in reality you'd need more sophisticated parsing)
  return suggestions.map((suggestion) => ({
    line: findLineNumberForSuggestion(suggestion, lineNumbers),
    comment: suggestion.replace(/^Line \d+: /, "").trim(),
  }));
}

function findLineNumberForSuggestion(suggestion, lineNumbers) {
  // Extract line number if mentioned in suggestion
  const match = suggestion.match(/Line (\d+):/);
  if (match) return parseInt(match[1], 10);

  // Fallback to first line number if can't determine
  return lineNumbers[0];
}

async function postComments(
  owner,
  repo,
  prNumber,
  commitId,
  path,
  suggestions
) {
  if (suggestions.length === 0) return;

  try {
    await Promise.all(
      suggestions.map(({ line, comment }) =>
        postInlineComment({
          owner,
          repo,
          prNumber,
          commit_id: commitId,
          body: comment,
          path,
          line,
        })
      )
    );
    console.log(`💬 Posted ${suggestions.length} comments on ${path}`);
  } catch (err) {
    console.error("Failed to post comments:", err.message);
  }
}

function extractChangedLinesWithLineNumbers(patch) {
  const lines = patch.split("\n");
  let changedLines = [];
  let lineNumberMap = [];
  let currentNewLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) currentNewLine = parseInt(match[1], 10);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      changedLines.push(line.slice(1));
      lineNumberMap.push(currentNewLine);
      currentNewLine++;
    } else if (!line.startsWith("-")) {
      currentNewLine++;
    }
  }

  return { changedLines, lineNumberMap };
}

async function getChangedFiles(owner, repo, prNumber) {
  const res = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    { headers: { Authorization: `token ${PERSONAL_ACCESS_TOKEN}` } }
  );
  return res.data;
}

async function getLatestCommitSha(owner, repo, prNumber) {
  const res = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: { Authorization: `token ${PERSONAL_ACCESS_TOKEN}` } }
  );
  return res.data.head.sha;
}

async function postInlineComment({
  owner,
  repo,
  prNumber,
  commit_id,
  body,
  path,
  line,
}) {
  try {
    await axios.post(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      {
        body,
        commit_id,
        path,
        side: "RIGHT",
        line,
      },
      {
        headers: {
          Authorization: `token ${PERSONAL_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(`Failed to post comment on ${path}:${line}`, error.message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ AI PR reviewer running on port ${PORT}`);
});
