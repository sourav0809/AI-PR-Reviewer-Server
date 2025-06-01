export const IGNORED_FILES = [
  // Package/dependency files
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bower.json",
  "Gemfile",
  "Gemfile.lock",
  "go.mod",
  "go.sum",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "composer.json",
  "composer.lock",

  // Configuration files
  ".env",
  ".env.*", // All .env files (.env.local, .env.production, etc.)
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".eslintignore",
  ".prettierignore",
  ".npmrc",
  ".yarnrc",
  ".babelrc",
  ".eslintrc",
  ".prettierrc",
  "tsconfig.json",
  "jsconfig.json",
  "webpack.config.js",
  "vite.config.js",
  "rollup.config.js",
  "jest.config.js",
  "karma.conf.js",
  "babel.config.js",

  // Build/output directories
  "dist/",
  "build/",
  "out/",
  "bin/",
  "coverage/",
  "node_modules/",

  // Documentation
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "CONTRIBUTING.md",

  // IDE/Editor files
  ".vscode/",
  ".idea/",
  "*.suo",
  "*.ntvs*",
  "*.njsproj",
  "*.sln",

  // OS generated files
  ".DS_Store",
  "Thumbs.db",

  // Test artifacts
  "*.log",
  "*.tmp",

  // Image files (might want to review these case by case)
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.svg",
  "*.ico",

  // Font files
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",

  // Binary files
  "*.pdf",
  "*.zip",
  "*.gz",
  "*.tar",
];
